package curl_compare

import (
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// ParsedCurl 从粘贴的 curl 命令解析出的请求信息（不含具体 URL，用于替换域名后发请求）
type ParsedCurl struct {
	Method  string
	Path    string // 含 query，如 /api/foo?k=v
	Headers http.Header
	Body    string
}

// ParseCurl 简单解析 curl 命令，提取 URL、-X、-H、-d/--data。
// 返回的 Path 为完整 path+query，便于与来源/目标 base URL 拼接。
func ParseCurl(raw string) (*ParsedCurl, string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, "", ErrEmptyCurl
	}
	// 去掉开头的 curl 或 curl'
	raw = strings.TrimPrefix(raw, "curl")
	raw = strings.TrimSpace(raw)

	var method string
	headers := make(http.Header)
	var body string
	var firstURL string

	// 简单 tokenize：按空白和引号分段，保留 -X -H -d --data 等
	// 先处理单引号/双引号内的内容，再按空白分
	tokens := tokenizeCurl(raw)

	i := 0
	for i < len(tokens) {
		t := tokens[i]
		switch {
		case t == "-X" || t == "--request":
			i++
			if i < len(tokens) {
				method = strings.ToUpper(strings.Trim(tokens[i], "'\""))
				i++
			}
			continue
		case t == "-H" || t == "--header":
			i++
			if i < len(tokens) {
				h := tokens[i]
				idx := strings.Index(h, ":")
				if idx > 0 {
					k := strings.TrimSpace(h[:idx])
					v := strings.TrimSpace(h[idx+1:])
					headers.Set(k, v)
				}
				i++
			}
			continue
		case t == "-d" || t == "--data" || t == "--data-raw" || t == "--data-ascii":
			i++
			if i < len(tokens) {
				body = strings.Trim(tokens[i], "'\"")
				i++
			}
			continue
		case t == "--data-binary":
			i++
			if i < len(tokens) {
				body = tokens[i]
				i++
			}
			continue
		case strings.HasPrefix(t, "http://") || strings.HasPrefix(t, "https://"):
			if firstURL == "" {
				firstURL = strings.Trim(t, "'\"")
			}
			i++
			continue
		default:
			i++
		}
	}

	if firstURL == "" {
		return nil, "", ErrNoURLInCurl
	}

	u, err := url.Parse(firstURL)
	if err != nil {
		return nil, "", ErrInvalidURL
	}

	if method == "" {
		if body != "" {
			method = "POST"
		} else {
			method = "GET"
		}
	}

	path := u.Path
	if u.RawQuery != "" {
		path = path + "?" + u.RawQuery
	}
	if path == "" {
		path = "/"
	}

	return &ParsedCurl{
		Method:  method,
		Path:    path,
		Headers: headers,
		Body:    body,
	}, firstURL, nil
}

// tokenizeCurl 将 curl 参数字符串拆成 token，尊重单引号/双引号。
func tokenizeCurl(s string) []string {
	var out []string
	var buf strings.Builder
	inQuote := false
	quoteChar := byte(0)
	escaped := false

	for i := 0; i < len(s); i++ {
		c := s[i]
		if escaped {
			buf.WriteByte(c)
			escaped = false
			continue
		}
		if c == '\\' && inQuote {
			escaped = true
			continue
		}
		if (c == '"' || c == '\'') && !inQuote {
			inQuote = true
			quoteChar = c
			// 若当前 buf 非空，先压入
			if buf.Len() > 0 {
				out = append(out, buf.String())
				buf.Reset()
			}
			continue
		}
		if inQuote && c == quoteChar {
			inQuote = false
			out = append(out, buf.String())
			buf.Reset()
			continue
		}
		if !inQuote && (c == ' ' || c == '\t' || c == '\n') {
			if buf.Len() > 0 {
				out = append(out, buf.String())
				buf.Reset()
			}
			continue
		}
		buf.WriteByte(c)
	}
	if buf.Len() > 0 {
		out = append(out, buf.String())
	}
	return out
}

// BuildRequestURL 用 baseURL（来源或目标，完整 URL，可含路径如 http://host/path）与 curl 的 path 拼出完整 URL。
// 不做「只取域名」：用户填的 baseURL 原样作为前缀，再拼接 curl 中的 path。
// 例如 baseURL=http://channel.teacherschool/channel、path=/api/foo → http://channel.teacherschool/channel/api/foo
func BuildRequestURL(baseURL, path string) (string, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	if path == "" || path[0] != '/' {
		path = "/" + path
	}
	// 仅校验 baseURL 可解析，不截断其 path
	if _, err := url.Parse(baseURL); err != nil {
		return "", err
	}
	return baseURL + path, nil
}

var (
	urlWithScheme = regexp.MustCompile(`^https?://[^\s]+`)
)
