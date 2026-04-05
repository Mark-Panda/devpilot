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
	"strings"
	"time"
	"unicode"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
)

// --- sourcegraph/search：Sourcegraph GraphQL 代码搜索（与 api-route-tracer 编排同文件维护） ---

// SourcegraphSearchNode 调用 Sourcegraph GraphQL API（/.api/graphql）执行代码搜索。
// 文档：https://docs.sourcegraph.com/api/graphql
type SourcegraphSearchNode struct {
	cfg sourcegraphSearchConfig

	endpointTmpl     el.Template
	accessTokenTmpl  el.Template
	defaultQueryTmpl el.Template
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
	n.cfg.Endpoint = strings.TrimSpace(n.cfg.Endpoint)
	n.cfg.AccessToken = strings.TrimSpace(n.cfg.AccessToken)
	n.cfg.DefaultSearchQuery = strings.TrimSpace(n.cfg.DefaultSearchQuery)
	if n.cfg.Endpoint == "" {
		return errors.New("sourcegraph/search: endpoint 不能为空（例如 https://sourcegraph.com，或含 ${...} 的模板）")
	}
	if n.cfg.TimeoutSec <= 0 {
		n.cfg.TimeoutSec = 30
	}
	var err error
	n.endpointTmpl, err = el.NewTemplate(n.cfg.Endpoint)
	if err != nil {
		return fmt.Errorf("sourcegraph/search: endpoint 模板: %w", err)
	}
	n.accessTokenTmpl, err = el.NewTemplate(n.cfg.AccessToken)
	if err != nil {
		return fmt.Errorf("sourcegraph/search: accessToken 模板: %w", err)
	}
	n.defaultQueryTmpl, err = el.NewTemplate(n.cfg.DefaultSearchQuery)
	if err != nil {
		return fmt.Errorf("sourcegraph/search: defaultSearchQuery 模板: %w", err)
	}
	return nil
}

const sourcegraphSearchGQL = `query RuleGoSourcegraphSearch($query: String!) {
  search(query: $query, version: V3) {
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
        }
      }
    }
  }
}`

func (n *SourcegraphSearchNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	endpoint := strings.TrimRight(strings.TrimSpace(n.endpointTmpl.ExecuteAsString(env)), "/")
	accessToken := strings.TrimSpace(n.accessTokenTmpl.ExecuteAsString(env))
	defaultQ := strings.TrimSpace(n.defaultQueryTmpl.ExecuteAsString(env))
	q := resolveSourcegraphQuery(msg.GetData(), defaultQ)
	if q == "" {
		ctx.TellFailure(msg, errors.New("sourcegraph/search: 搜索词为空（请在消息 data 中传入字符串或 JSON {\"query\":\"...\"}，或配置 defaultSearchQuery）"))
		return
	}
	if endpoint == "" {
		ctx.TellFailure(msg, errors.New("sourcegraph/search: 渲染后 endpoint 为空"))
		return
	}
	gqlURL, err := url.JoinPath(endpoint, ".api", "graphql")
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
	req.Header.Set("Accept", "application/json")
	if accessToken != "" {
		req.Header.Set("Authorization", "token "+accessToken)
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

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		ctx.TellFailure(msg, fmt.Errorf("sourcegraph/search: HTTP %d（请先检查 endpoint 是否为实例根 URL、令牌是否有效）: %s", resp.StatusCode, truncateForLog(strings.TrimSpace(string(respBody)), 512)))
		return
	}

	var gqlResp struct {
		Data   json.RawMessage   `json:"data"`
		Errors []json.RawMessage `json:"errors"`
	}
	if err := json.Unmarshal(respBody, &gqlResp); err != nil {
		preview := truncateForLog(strings.TrimSpace(string(respBody)), 320)
		ctx.TellFailure(msg, fmt.Errorf("sourcegraph/search: 响应非 JSON（常为登录页/网关错误/HTML）。请确认 POST %s 且返回 application/json。正文片段: %q — %w", gqlURL, preview, err))
		return
	}
	if len(gqlResp.Errors) > 0 {
		ctx.TellFailure(msg, fmt.Errorf("sourcegraph/search: GraphQL 错误: %s", string(gqlResp.Errors[0])))
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

func (n *SourcegraphSearchNode) Destroy() {
	n.cfg = sourcegraphSearchConfig{}
	n.endpointTmpl = nil
	n.accessTokenTmpl = nil
	n.defaultQueryTmpl = nil
}

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

// --- apiRouteTracer/gitPrepare：按配置的 Git 地址与父目录克隆或拉取仓库 ---

type apiRouteTracerGitPrepareConfig struct {
	GitlabURL string `json:"gitlabUrl"`
	WorkDir   string `json:"workDir"`
}

type apiRouteTracerGitPrepareNode struct {
	cfg apiRouteTracerGitPrepareConfig

	gitlabURLTmpl el.Template
	workDirTmpl   el.Template
}

func (n *apiRouteTracerGitPrepareNode) Type() string { return "apiRouteTracer/gitPrepare" }

func (n *apiRouteTracerGitPrepareNode) New() types.Node { return &apiRouteTracerGitPrepareNode{} }

func (n *apiRouteTracerGitPrepareNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.GitlabURL = strings.TrimSpace(n.cfg.GitlabURL)
	n.cfg.WorkDir = strings.TrimSpace(n.cfg.WorkDir)
	if n.cfg.GitlabURL == "" {
		return errors.New("gitPrepare: gitlabUrl 不能为空（可为含 ${...} 的模板）")
	}
	if n.cfg.WorkDir == "" {
		return errors.New("gitPrepare: workDir 不能为空（可为含 ${...} 的模板）")
	}
	var err error
	n.gitlabURLTmpl, err = el.NewTemplate(n.cfg.GitlabURL)
	if err != nil {
		return fmt.Errorf("gitPrepare: gitlabUrl 模板: %w", err)
	}
	n.workDirTmpl, err = el.NewTemplate(n.cfg.WorkDir)
	if err != nil {
		return fmt.Errorf("gitPrepare: workDir 模板: %w", err)
	}
	return nil
}

func (n *apiRouteTracerGitPrepareNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	gitURL := strings.TrimSpace(n.gitlabURLTmpl.ExecuteAsString(env))
	if gitURL == "" {
		ctx.TellFailure(msg, errors.New("gitPrepare: 渲染后 gitlabUrl 为空"))
		return
	}
	workDir := strings.TrimSpace(n.workDirTmpl.ExecuteAsString(env))
	workDir = expandUserPath(workDir)
	workDir = filepath.Clean(workDir)
	if workDir == "" || workDir == "." {
		ctx.TellFailure(msg, errors.New("gitPrepare: 渲染后 workDir 为空"))
		return
	}
	repoBase, err := gitRepoDirNameFromURL(gitURL)
	if err != nil {
		ctx.TellFailure(msg, fmt.Errorf("gitPrepare: 从 URL 解析仓库目录名: %w", err))
		return
	}
	name, ok := sanitizeServiceDirName(repoBase)
	if !ok {
		ctx.TellFailure(msg, fmt.Errorf("gitPrepare: 仓库目录名非法 %q（仅允许字母、数字、.-_，长度 1–128）", repoBase))
		return
	}
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
	gitURL = fmt.Sprintf(`https://%s.git`, gitURL)
	st, err := os.Stat(servicePath)
	if err == nil {
		if !st.IsDir() {
			ctx.TellFailure(msg, fmt.Errorf("gitPrepare: %q 已存在且不是目录", servicePath))
			return
		}
		if _, err := os.Stat(filepath.Join(servicePath, ".git")); err != nil {
			ctx.TellFailure(msg, fmt.Errorf("gitPrepare: 目录 %q 已存在但不是 git 仓库（无 .git），请删除后重试", servicePath))
			return
		}
		if err := runGit(gitEnv, servicePath, "pull"); err != nil {
			ctx.TellFailure(msg, fmt.Errorf("gitPrepare: git pull: %w", err))
			return
		}
	} else if os.IsNotExist(err) {
		if err := runGit(gitEnv, workDir, "clone", gitURL); err != nil {
			ctx.TellFailure(msg, fmt.Errorf("gitPrepare: git clone: %w", err))
			return
		}
	} else {
		ctx.TellFailure(msg, fmt.Errorf("gitPrepare: 检查路径: %w", err))
		return
	}

	out.Metadata.PutValue("api_route_tracer_service_path", servicePath)
	out.Metadata.PutValue("api_route_tracer_project_type", "")
	out.Metadata.PutValue("api_route_tracer_service_name", name)
	summary, _ := json.Marshal(map[string]string{
		"servicePath": servicePath,
		"serviceName": name,
		"gitlabUrl":   gitURL,
	})
	out.SetData(string(summary))
	ctx.TellSuccess(out)
}

func (n *apiRouteTracerGitPrepareNode) Destroy() {
	n.cfg = apiRouteTracerGitPrepareConfig{}
	n.gitlabURLTmpl = nil
	n.workDirTmpl = nil
}

// gitRepoDirNameFromURL 返回与 git clone 默认一致的本地目录名（路径最后一段，去掉 .git 后缀）。
func gitRepoDirNameFromURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("url 为空")
	}
	switch {
	case strings.HasPrefix(raw, "ssh://"):
		u, err := url.Parse(raw)
		if err != nil {
			return "", err
		}
		path := strings.TrimSuffix(strings.Trim(u.Path, "/"), ".git")
		if path == "" {
			return "", errors.New("ssh:// URL 路径为空")
		}
		parts := strings.Split(path, "/")
		return parts[len(parts)-1], nil
	case strings.Contains(raw, "://"):
		u, err := url.Parse(raw)
		if err != nil {
			return "", err
		}
		path := strings.TrimSuffix(strings.Trim(u.Path, "/"), ".git")
		parts := strings.Split(path, "/")
		if len(parts) == 0 || parts[len(parts)-1] == "" {
			return "", errors.New("无法从 URL 路径得到仓库名")
		}
		return parts[len(parts)-1], nil
	case strings.HasPrefix(raw, "git@"):
		colon := strings.Index(raw, ":")
		if colon < 0 {
			return "", errors.New("SCP 形式 git URL 中缺少 ':'")
		}
		path := strings.TrimSuffix(strings.Trim(raw[colon+1:], "/"), ".git")
		parts := strings.Split(path, "/")
		if len(parts) == 0 || parts[len(parts)-1] == "" {
			return "", errors.New("无法从 SCP 形式 URL 得到仓库名")
		}
		return parts[len(parts)-1], nil
	default:
		path := strings.TrimSuffix(strings.Trim(raw, "/"), ".git")
		parts := strings.Split(path, "/")
		if len(parts) == 0 || parts[len(parts)-1] == "" {
			return "", errors.New("无法解析为非空仓库名")
		}
		return parts[len(parts)-1], nil
	}
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
