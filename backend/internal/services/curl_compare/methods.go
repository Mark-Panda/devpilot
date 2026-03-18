package curl_compare

import (
	"net/http"
	"strconv"
	"strings"
)

// CompareCurlInput 执行对比的入参
type CompareCurlInput struct {
	SourceURL string `json:"source_url"` // 来源 URL（替换 curl 中的域名）
	TargetURL string `json:"target_url"` // 目标 URL
	CurlRaw   string `json:"curl_raw"`   // 粘贴的 curl 命令
}

// CompareCurlOutput 对比结果
type CompareCurlOutput struct {
	SourceStatus   int            `json:"source_status"`   // 来源响应状态码
	TargetStatus   int            `json:"target_status"`   // 目标响应状态码
	SourceBodyLen  int            `json:"source_body_len"`   // 来源 body 长度
	TargetBodyLen  int            `json:"target_body_len"`  // 目标 body 长度
	SourceBodyErr  string         `json:"source_body_err"`  // 来源请求错误信息（空表示成功）
	TargetBodyErr  string         `json:"target_body_err"`  // 目标请求错误信息
	DiffCount      int            `json:"diff_count"`      // 差异条数
	Diffs          []JSONDiffItem `json:"diffs"`           // 差异列表
	ParseCurlError string         `json:"parse_curl_error"` // curl 解析错误（空表示成功）

	// 请求与响应日志（便于排查）
	RequestMethod   string `json:"request_method"`   // 请求方法（两个请求相同）
	RequestHeaders  string `json:"request_headers"`  // 请求头（多行字符串）
	RequestBody     string `json:"request_body"`      // 请求体（两个请求相同）
	SourceRequestURL string `json:"source_request_url"`  // 来源请求完整 URL
	TargetRequestURL string `json:"target_request_url"` // 目标请求完整 URL
	SourceResponsePreview string `json:"source_response_preview"` // 来源响应 body 预览（截断）
	TargetResponsePreview string `json:"target_response_preview"` // 目标响应 body 预览（截断）
}

// Service 无状态，仅提供对比方法
type Service struct{}

// NewService 创建对比服务
func NewService() *Service {
	return &Service{}
}

// CompareCurl 解析 curl，分别用来源 URL 和目标 URL 替换域名后发起请求，对比两份 JSON 并返回差异。
func (s *Service) CompareCurl(input CompareCurlInput) (CompareCurlOutput, error) {
	out := CompareCurlOutput{}
	sourceURL := trimSpace(input.SourceURL)
	targetURL := trimSpace(input.TargetURL)
	curlRaw := trimSpace(input.CurlRaw)

	if sourceURL == "" || targetURL == "" || curlRaw == "" {
		return out, ErrEmptyCurl
	}

	parsed, _, err := ParseCurl(curlRaw)
	if err != nil {
		out.ParseCurlError = err.Error()
		return out, nil // 不 return err，让前端展示 ParseCurlError
	}

	sourceFull, err := BuildRequestURL(sourceURL, parsed.Path)
	if err != nil {
		out.SourceBodyErr = "来源 URL 拼接失败: " + err.Error()
		return out, nil
	}
	targetFull, err := BuildRequestURL(targetURL, parsed.Path)
	if err != nil {
		out.TargetBodyErr = "目标 URL 拼接失败: " + err.Error()
		return out, nil
	}

	// 填充请求参数日志
	out.RequestMethod = parsed.Method
	out.RequestHeaders = formatHeaders(parsed.Headers)
	out.RequestBody = parsed.Body
	out.SourceRequestURL = sourceFull
	out.TargetRequestURL = targetFull

	var sourceBody, targetBody []byte

	// 并发发起两个请求
	type result struct {
		code int
		body []byte
		err  error
	}
	sourceDone := make(chan result, 1)
	targetDone := make(chan result, 1)
	go func() {
		code, body, err := ExecuteRequest(sourceFull, parsed)
		sourceDone <- result{code, body, err}
	}()
	go func() {
		code, body, err := ExecuteRequest(targetFull, parsed)
		targetDone <- result{code, body, err}
	}()

	sr := <-sourceDone
	tr := <-targetDone

	out.SourceStatus = sr.code
	out.TargetStatus = tr.code
	if sr.err != nil {
		out.SourceBodyErr = sr.err.Error()
	}
	if tr.err != nil {
		out.TargetBodyErr = tr.err.Error()
	}
	sourceBody = sr.body
	targetBody = tr.body
	out.SourceBodyLen = len(sourceBody)
	out.TargetBodyLen = len(targetBody)
	out.SourceResponsePreview = truncateForPreview(sourceBody, 8192)
	out.TargetResponsePreview = truncateForPreview(targetBody, 8192)

	// 任一侧请求失败或非 2xx 时仍尝试解析 JSON 做对比（若 body 有内容）
	if out.SourceBodyErr != "" && len(sourceBody) == 0 {
		return out, nil
	}
	if out.TargetBodyErr != "" && len(targetBody) == 0 {
		return out, nil
	}

	diffs, err := CompareJSON(sourceBody, targetBody)
	if err != nil {
		// 非 JSON 时只记录，不报错
		out.SourceBodyErr = addIfEmpty(out.SourceBodyErr, "来源响应不是有效 JSON")
		out.TargetBodyErr = addIfEmpty(out.TargetBodyErr, "目标响应不是有效 JSON")
		return out, nil
	}
	out.Diffs = diffs
	out.DiffCount = len(diffs)
	return out, nil
}

func trimSpace(s string) string {
	const cutset = " \t\n\r"
	start := 0
	for start < len(s) && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	end := len(s)
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}

func addIfEmpty(current, msg string) string {
	if current != "" {
		return current
	}
	return msg
}

func formatHeaders(h http.Header) string {
	if h == nil || len(h) == 0 {
		return ""
	}
	var b strings.Builder
	for k, v := range h {
		for _, vv := range v {
			b.WriteString(k)
			b.WriteString(": ")
			b.WriteString(vv)
			b.WriteString("\n")
		}
	}
	return strings.TrimSuffix(b.String(), "\n")
}

func truncateForPreview(body []byte, maxLen int) string {
	if len(body) == 0 {
		return ""
	}
	s := string(body)
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n\n... (已截断，共 " + strconv.Itoa(len(body)) + " 字节)"
}
