package rulego

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
)

// OpenSearchSearchNode 调用 OpenSearch / Elasticsearch `_search` 检索日志（POST JSON）。
// 兼容 OpenSearch 与 ES 7.x+ 搜索 API。
type OpenSearchSearchNode struct {
	cfg openSearchSearchConfig
}

type openSearchSearchConfig struct {
	Endpoint           string `json:"endpoint"`
	Index              string `json:"index"`
	Username           string `json:"username"`
	Password           string `json:"password"`
	InsecureSkipVerify bool   `json:"insecureSkipVerify"`
	TimeoutSec         int    `json:"timeoutSec"`
	DefaultSearchBody  string `json:"defaultSearchBody"`
}

func (n *OpenSearchSearchNode) Type() string { return "opensearch/search" }

func (n *OpenSearchSearchNode) New() types.Node { return &OpenSearchSearchNode{} }

var openSearchIndexPattern = regexp.MustCompile(`^[a-zA-Z0-9_*,.-]+$`)

func (n *OpenSearchSearchNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.Endpoint = strings.TrimRight(strings.TrimSpace(n.cfg.Endpoint), "/")
	n.cfg.Index = strings.TrimSpace(n.cfg.Index)
	n.cfg.Username = strings.TrimSpace(n.cfg.Username)
	n.cfg.Password = strings.TrimSpace(n.cfg.Password)
	n.cfg.DefaultSearchBody = strings.TrimSpace(n.cfg.DefaultSearchBody)
	if n.cfg.Endpoint == "" {
		return errors.New("opensearch/search: endpoint 不能为空（如 https://opensearch:9200）")
	}
	if n.cfg.Index == "" {
		return errors.New("opensearch/search: index 不能为空（支持单索引、逗号分隔多索引或通配如 logs-*）")
	}
	for _, part := range strings.Split(n.cfg.Index, ",") {
		p := strings.TrimSpace(part)
		if p == "" || !openSearchIndexPattern.MatchString(p) {
			return fmt.Errorf("opensearch/search: index 片段非法: %q（仅允许字母数字及 _ * , . -）", part)
		}
	}
	if n.cfg.TimeoutSec <= 0 {
		n.cfg.TimeoutSec = 60
	}
	if n.cfg.DefaultSearchBody == "" {
		n.cfg.DefaultSearchBody = `{"size":100,"sort":[{"@timestamp":{"order":"desc"}}],"query":{"match_all":{}}}`
	}
	if !json.Valid([]byte(n.cfg.DefaultSearchBody)) {
		return errors.New("opensearch/search: defaultSearchBody 不是合法 JSON")
	}
	return nil
}

func resolveOpenSearchBody(msgData string, defaultJSON string) ([]byte, error) {
	msgData = strings.TrimSpace(msgData)
	if msgData == "" {
		return []byte(defaultJSON), nil
	}
	if json.Valid([]byte(msgData)) {
		var probe interface{}
		if err := json.Unmarshal([]byte(msgData), &probe); err != nil {
			return nil, err
		}
		if _, isObj := probe.(map[string]interface{}); isObj {
			return []byte(msgData), nil
		}
	}
	// 非 JSON 对象：当作 query_string 检索语句
	wrap := map[string]interface{}{
		"size": 100,
		"sort": []interface{}{
			map[string]interface{}{"@timestamp": map[string]interface{}{"order": "desc"}},
		},
		"query": map[string]interface{}{
			"query_string": map[string]interface{}{
				"query": msgData,
			},
		},
	}
	// 尽量沿用默认请求中的 size / sort
	var def map[string]interface{}
	if err := json.Unmarshal([]byte(defaultJSON), &def); err == nil {
		if sz, ok := def["size"].(float64); ok && sz > 0 {
			wrap["size"] = int(sz)
		}
		if s, ok := def["sort"]; ok {
			wrap["sort"] = s
		}
	}
	return json.Marshal(wrap)
}

func openSearchSearchURL(endpoint, index string) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	if u.Scheme == "" || u.Host == "" {
		return "", errors.New("endpoint 需包含协议与主机，如 https://host:9200")
	}
	idx := strings.TrimSpace(index)
	basePath := strings.TrimSuffix(u.Path, "/")
	var path string
	if basePath == "" {
		path = "/" + idx + "/_search"
	} else {
		path = basePath + "/" + idx + "/_search"
	}
	u.Path = path
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}

func (n *OpenSearchSearchNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	body, err := resolveOpenSearchBody(msg.GetData(), n.cfg.DefaultSearchBody)
	if err != nil {
		ctx.TellFailure(msg, fmt.Errorf("opensearch/search: 构造请求体失败: %w", err))
		return
	}
	searchURL, err := openSearchSearchURL(n.cfg.Endpoint, n.cfg.Index)
	if err != nil {
		ctx.TellFailure(msg, fmt.Errorf("opensearch/search: 拼接 URL 失败: %w", err))
		return
	}

	transport := http.RoundTripper(http.DefaultTransport)
	if n.cfg.InsecureSkipVerify {
		if base, ok := http.DefaultTransport.(*http.Transport); ok {
			tr := base.Clone()
			if tr.TLSClientConfig == nil {
				tr.TLSClientConfig = &tls.Config{}
			}
			tr.TLSClientConfig.InsecureSkipVerify = true
			transport = tr
		}
	}
	client := &http.Client{
		Timeout:   time.Duration(n.cfg.TimeoutSec) * time.Second,
		Transport: transport,
	}

	ctxHTTP, cancel := context.WithTimeout(context.Background(), time.Duration(n.cfg.TimeoutSec)*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctxHTTP, http.MethodPost, searchURL, bytes.NewReader(body))
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if n.cfg.Username != "" || n.cfg.Password != "" {
		req.SetBasicAuth(n.cfg.Username, n.cfg.Password)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[rulego] opensearch/search 请求失败: %v", err)
		ctx.TellFailure(msg, err)
		return
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	out.Metadata.PutValue("opensearch_index", n.cfg.Index)
	out.Metadata.PutValue("opensearch_http_status", fmt.Sprintf("%d", resp.StatusCode))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		ctx.TellFailure(msg, fmt.Errorf("opensearch/search: HTTP %d: %s", resp.StatusCode, truncateForLog(string(respBody), 1024)))
		return
	}

	var summary struct {
		Hits *struct {
			Total interface{} `json:"total"`
		} `json:"hits"`
		Took int `json:"took"`
	}
	if err := json.Unmarshal(respBody, &summary); err == nil && summary.Hits != nil {
		out.Metadata.PutValue("opensearch_took_ms", fmt.Sprintf("%d", summary.Took))
		switch t := summary.Hits.Total.(type) {
		case float64:
			out.Metadata.PutValue("opensearch_hits_total", fmt.Sprintf("%.0f", t))
		case map[string]interface{}:
			if v, ok := t["value"]; ok {
				out.Metadata.PutValue("opensearch_hits_total", fmt.Sprintf("%v", v))
			}
		}
	}

	out.SetData(string(respBody))
	ctx.TellSuccess(out)
}

func (n *OpenSearchSearchNode) Destroy() { n.cfg = openSearchSearchConfig{} }

func init() {
	rulego.Registry.Register(&OpenSearchSearchNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&OpenSearchSearchNode{}).Type())
}
