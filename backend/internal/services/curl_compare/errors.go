package curl_compare

import "errors"

var (
	ErrEmptyCurl     = errors.New("curl 内容不能为空")
	ErrNoURLInCurl   = errors.New("curl 中未找到 URL")
	ErrInvalidURL    = errors.New("URL 格式无效")
	ErrNotJSON       = errors.New("响应不是有效的 JSON")
	ErrRequestFailed = errors.New("请求失败")
)
