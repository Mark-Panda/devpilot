package rulego

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
)

// --- sourcegraph/search：Sourcegraph GraphQL 代码搜索（与 api-route-tracer 编排同文件维护） ---

// SourcegraphSearchNode 调用 Sourcegraph GraphQL API（/.api/graphql）执行代码搜索。
// 文档：https://docs.sourcegraph.com/api/graphql
type SourcegraphSearchNode struct {
	cfg sourcegraphSearchConfig
}

type sourcegraphSearchConfig struct {
	Endpoint           string `json:"endpoint"`
	AccessToken        string `json:"accessToken"`
	TimeoutSec         int    `json:"timeoutSec"`
	DefaultSearchQuery string `json:"defaultSearchQuery"`
}

func (n *SourcegraphSearchNode) Type() string { return "sourcegraph/search" }

func (n *SourcegraphSearchNode) New() types.Node { return &SourcegraphSearchNode{} }

func (n *SourcegraphSearchNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.Endpoint = strings.TrimRight(strings.TrimSpace(n.cfg.Endpoint), "/")
	n.cfg.AccessToken = strings.TrimSpace(n.cfg.AccessToken)
	n.cfg.DefaultSearchQuery = strings.TrimSpace(n.cfg.DefaultSearchQuery)
	if n.cfg.Endpoint == "" {
		return errors.New("sourcegraph/search: endpoint 不能为空（例如 https://sourcegraph.com）")
	}
	if n.cfg.TimeoutSec <= 0 {
		n.cfg.TimeoutSec = 30
	}
	return nil
}

const sourcegraphSearchGQL = `query RuleGoSourcegraphSearch($query: String!) {
  search(query: $query, version: V3, patternType: literal) {
    results {
      matchCount
      limitHit
      results {
        __typename
        ... on FileMatch {
          file {
            path
            url
          }
          repository {
            name
          }
          lineMatches {
            lineNumber
            preview
          }
        }
        ... on CommitSearchResult {
          url
          subject
        }
      }
    }
  }
}`

func (n *SourcegraphSearchNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	q := resolveSourcegraphQuery(msg.GetData(), n.cfg.DefaultSearchQuery)
	if q == "" {
		ctx.TellFailure(msg, errors.New("sourcegraph/search: 搜索词为空（请在消息 data 中传入字符串或 JSON {\"query\":\"...\"}，或配置 defaultSearchQuery）"))
		return
	}
	gqlURL, err := url.JoinPath(n.cfg.Endpoint, ".api", "graphql")
	if err != nil {
		ctx.TellFailure(msg, fmt.Errorf("sourcegraph/search: 拼接 GraphQL URL 失败: %w", err))
		return
	}

	payload := map[string]interface{}{
		"query": sourcegraphSearchGQL,
		"variables": map[string]string{
			"query": q,
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	ctxHTTP, cancel := context.WithTimeout(context.Background(), time.Duration(n.cfg.TimeoutSec)*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctxHTTP, http.MethodPost, gqlURL, bytes.NewReader(body))
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if n.cfg.AccessToken != "" {
		req.Header.Set("Authorization", "token "+n.cfg.AccessToken)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[rulego] sourcegraph/search 请求失败: %v", err)
		ctx.TellFailure(msg, err)
		return
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	var gqlResp struct {
		Data   json.RawMessage   `json:"data"`
		Errors []json.RawMessage `json:"errors"`
	}
	if err := json.Unmarshal(respBody, &gqlResp); err != nil {
		ctx.TellFailure(msg, fmt.Errorf("sourcegraph/search: 解析响应 JSON 失败: %w", err))
		return
	}
	if len(gqlResp.Errors) > 0 {
		ctx.TellFailure(msg, fmt.Errorf("sourcegraph/search: GraphQL 错误: %s", string(gqlResp.Errors[0])))
		return
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		ctx.TellFailure(msg, fmt.Errorf("sourcegraph/search: HTTP %d: %s", resp.StatusCode, truncateForLog(string(respBody), 512)))
		return
	}

	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	out.Metadata.PutValue("sourcegraph_search_query", q)
	out.SetData(string(gqlResp.Data))
	ctx.TellSuccess(out)
}

func (n *SourcegraphSearchNode) Destroy() { n.cfg = sourcegraphSearchConfig{} }

func resolveSourcegraphQuery(data string, defaultQ string) string {
	data = strings.TrimSpace(data)
	if data == "" {
		return defaultQ
	}
	var wrap struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal([]byte(data), &wrap); err == nil && strings.TrimSpace(wrap.Query) != "" {
		return strings.TrimSpace(wrap.Query)
	}
	return data
}

func truncateForLog(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// --- apiRouteTracer/gitPrepare：按 Router 响应克隆/更新服务仓库 ---

type apiRouteTracerGitPrepareConfig struct {
	WorkDir string `json:"workDir"`
}

type apiRouteTracerGitPrepareNode struct {
	cfg apiRouteTracerGitPrepareConfig
}

func (n *apiRouteTracerGitPrepareNode) Type() string { return "apiRouteTracer/gitPrepare" }

func (n *apiRouteTracerGitPrepareNode) New() types.Node { return &apiRouteTracerGitPrepareNode{} }

func (n *apiRouteTracerGitPrepareNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.WorkDir = strings.TrimSpace(n.cfg.WorkDir)
	if n.cfg.WorkDir == "" {
		return errors.New("gitPrepare: workDir 不能为空")
	}
	return nil
}

func (n *apiRouteTracerGitPrepareNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	raw := strings.TrimSpace(msg.GetData())
	if raw == "" {
		ctx.TellFailure(msg, errors.New("gitPrepare: 上游消息 data 为空（需为 Router API 返回的 JSON，或 for 遍历中的单条 service 对象）"))
		return
	}
	svc, err := parseGitPrepareService(raw, msg)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	name, ok := sanitizeServiceDirName(svc.ServiceName)
	if !ok {
		ctx.TellFailure(msg, fmt.Errorf("gitPrepare: 非法 serviceName %q", svc.ServiceName))
		return
	}
	gitURL := strings.TrimSpace(svc.GitlabURL)
	if gitURL == "" {
		ctx.TellFailure(msg, errors.New("gitPrepare: gitlabUrl 为空"))
		return
	}
	workDir := filepath.Clean(n.cfg.WorkDir)
	servicePath := filepath.Join(workDir, name)

	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	mergeTraceMetadata(msg, out)

	if err := os.MkdirAll(workDir, 0755); err != nil {
		ctx.TellFailure(msg, fmt.Errorf("gitPrepare: 创建工作目录: %w", err))
		return
	}

	gitEnv := append(os.Environ(), "GIT_TERMINAL_PROMPT=0")

	if _, err := os.Stat(filepath.Join(servicePath, ".git")); err == nil {
		if err := runGit(gitEnv, servicePath, "checkout", "master"); err != nil {
			_ = runGit(gitEnv, servicePath, "checkout", "main")
		}
		if err := runGit(gitEnv, servicePath, "pull", "origin", "master"); err != nil {
			_ = runGit(gitEnv, servicePath, "pull", "origin", "main")
		}
	} else {
		if err := runGit(gitEnv, workDir, "clone", gitURL, name); err != nil {
			ctx.TellFailure(msg, fmt.Errorf("gitPrepare: git clone: %w", err))
			return
		}
	}

	out.Metadata.PutValue("api_route_tracer_service_path", servicePath)
	out.Metadata.PutValue("api_route_tracer_project_type", strings.TrimSpace(svc.Type))
	out.Metadata.PutValue("api_route_tracer_service_name", name)
	summary, _ := json.Marshal(map[string]string{
		"servicePath": servicePath,
		"serviceName": name,
		"projectType": strings.TrimSpace(svc.Type),
	})
	out.SetData(string(summary))
	ctx.TellSuccess(out)
}

func (n *apiRouteTracerGitPrepareNode) Destroy() { n.cfg = apiRouteTracerGitPrepareConfig{} }

type apiRouteTracerService struct {
	ServiceName string `json:"serviceName"`
	GitlabURL   string `json:"gitlabUrl"`
	Type        string `json:"type"`
}

// parseGitPrepareService 支持两种上游：① Router 完整 JSON（含 data 数组）；② for 节点遍历时的单条元素 JSON。
func parseGitPrepareService(raw string, msg types.RuleMsg) (apiRouteTracerService, error) {
	var root map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &root); err != nil {
		return apiRouteTracerService{}, fmt.Errorf("gitPrepare: 解析 JSON 失败: %w", err)
	}
	if arr, ok := root["data"].([]interface{}); ok && len(arr) > 0 {
		idx := serviceIndexForTracer(msg, len(arr))
		b, err := json.Marshal(arr[idx])
		if err != nil {
			return apiRouteTracerService{}, fmt.Errorf("gitPrepare: 序列化 data[%d] 失败: %w", idx, err)
		}
		var one apiRouteTracerService
		if err := json.Unmarshal(b, &one); err != nil {
			return apiRouteTracerService{}, fmt.Errorf("gitPrepare: 解析 data[%d] 失败: %w", idx, err)
		}
		return one, nil
	}
	var one apiRouteTracerService
	if err := json.Unmarshal([]byte(raw), &one); err != nil {
		return apiRouteTracerService{}, fmt.Errorf("gitPrepare: 解析单条 service 失败: %w", err)
	}
	if strings.TrimSpace(one.ServiceName) == "" || strings.TrimSpace(one.GitlabURL) == "" {
		return apiRouteTracerService{}, errors.New("gitPrepare: 非 Router 包格式时，JSON 根级需含 serviceName、gitlabUrl（适用于 for 遍历 msg.data）")
	}
	return one, nil
}

// serviceIndexForTracer 优先 api_route_tracer_service_index，否则使用 RuleGo for 注入的 _loopIndex。
func serviceIndexForTracer(msg types.RuleMsg, n int) int {
	if n <= 0 {
		return 0
	}
	if msg.Metadata != nil {
		if s := strings.TrimSpace(msg.Metadata.GetValue("api_route_tracer_service_index")); s != "" {
			if v, err := strconv.Atoi(s); err == nil && v >= 0 && v < n {
				return v
			}
		}
		if s := strings.TrimSpace(msg.Metadata.GetValue("_loopIndex")); s != "" {
			if v, err := strconv.Atoi(s); err == nil && v >= 0 && v < n {
				return v
			}
		}
	}
	return 0
}

// --- helpers ---

func mapConfigurationToStruct(configuration types.Configuration, out interface{}) error {
	if configuration == nil {
		return nil
	}
	b, err := json.Marshal(configuration)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

func sanitizeServiceDirName(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" || len(s) > 128 {
		return "", false
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' || r == '.' {
			continue
		}
		return "", false
	}
	return s, true
}

func runGit(env []string, dir string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = env
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git %v: %w: %s", args, err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

func mergeTraceMetadata(from, to types.RuleMsg) {
	if from.Metadata == nil || to.Metadata == nil {
		return
	}
	for _, key := range []string{
		"trace_url", "trace_method", "trace_router_http_status",
		"api_route_tracer_service_index",
	} {
		if v := from.Metadata.GetValue(key); v != "" {
			to.Metadata.PutValue(key, v)
		}
	}
}

func init() {
	rulego.Registry.Register(&SourcegraphSearchNode{})
	rulego.Registry.Register(&apiRouteTracerGitPrepareNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s, type=%s",
		(&SourcegraphSearchNode{}).Type(),
		(&apiRouteTracerGitPrepareNode{}).Type(),
	)
}
