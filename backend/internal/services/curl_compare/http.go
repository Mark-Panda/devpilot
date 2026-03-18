package curl_compare

import (
	"bytes"
	"io"
	"net/http"
	"time"
)

const defaultTimeout = 30 * time.Second

// ExecuteRequest 根据解析后的 curl 和完整 URL 发起 HTTP 请求，返回状态码和 body。
func ExecuteRequest(fullURL string, p *ParsedCurl) (statusCode int, body []byte, err error) {
	var reqBody io.Reader
	if p.Body != "" {
		reqBody = bytes.NewReader([]byte(p.Body))
	}
	req, err := http.NewRequest(p.Method, fullURL, reqBody)
	if err != nil {
		return 0, nil, err
	}
	for k, v := range p.Headers {
		if len(v) > 0 {
			req.Header.Set(k, v[0])
		}
	}
	if p.Body != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: defaultTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, err
	}
	return resp.StatusCode, body, nil
}
