package rulego

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
)

// SourcegraphQueryBuildNode 根据 LLM 预处理 JSON（或纯文本）拼接与 api-route-tracer 脚本一致的 Sourcegraph 查询串，
// 并区分前端/后端仓库范围（repo 过滤）。下游 sourcegraph/search 可将 defaultSearchQuery 设为 ${metadata.sourcegraph_built_query}。
type SourcegraphQueryBuildNode struct {
	cfg sourcegraphQueryBuildConfig

	repoScopeTmpl          el.Template
	repoFrontendTmpl       el.Template
	repoBackendTmpl        el.Template
	contextGlobalTmpl      el.Template
	typeFilterTmpl         el.Template
	includeForkedTmpl      el.Template
	displayLimitTmpl       el.Template
	defaultPatternTypeTmpl el.Template
	defaultPatternsTmpl    el.Template
}

type sourcegraphQueryBuildConfig struct {
	RepoScope      string `json:"repoScope"`      // 空 | frontend | backend，支持 ${...}
	RepoFrontend   string `json:"repoFrontend"`   // repo 正则，前端 scope 用，支持 ${...}
	RepoBackend    string `json:"repoBackend"`    // repo 正则，后端 scope 用，支持 ${...}
	ContextGlobal  string `json:"contextGlobal"`  // true/false，默认 true，支持 ${...}
	TypeFilter     string `json:"typeFilter"`     // 如 lang:go，支持 ${...}
	IncludeForked        string `json:"includeForked"`        // 默认 true，支持 ${...}
	DisplayLimit         string `json:"displayLimit"`         // 默认 1500，支持 ${...}
	DefaultPatternType   string `json:"defaultPatternType"`   // literal | regexp，默认 literal，支持 ${...}
	DefaultPatterns      string `json:"defaultPatterns"`      // 多行，每行一条路径/pattern；支持 ${...}
}

func (n *SourcegraphQueryBuildNode) Type() string { return "sourcegraph/queryBuild" }

func (n *SourcegraphQueryBuildNode) New() types.Node { return &SourcegraphQueryBuildNode{} }

func (n *SourcegraphQueryBuildNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.RepoScope = strings.TrimSpace(n.cfg.RepoScope)
	n.cfg.RepoFrontend = strings.TrimSpace(n.cfg.RepoFrontend)
	n.cfg.RepoBackend = strings.TrimSpace(n.cfg.RepoBackend)
	n.cfg.ContextGlobal = strings.TrimSpace(n.cfg.ContextGlobal)
	if n.cfg.ContextGlobal == "" {
		n.cfg.ContextGlobal = "true"
	}
	n.cfg.TypeFilter = strings.TrimSpace(n.cfg.TypeFilter)
	n.cfg.IncludeForked = strings.TrimSpace(n.cfg.IncludeForked)
	if n.cfg.IncludeForked == "" {
		n.cfg.IncludeForked = "true"
	}
	n.cfg.DisplayLimit = strings.TrimSpace(n.cfg.DisplayLimit)
	if n.cfg.DisplayLimit == "" {
		n.cfg.DisplayLimit = "1500"
	}
	n.cfg.DefaultPatternType = strings.TrimSpace(n.cfg.DefaultPatternType)
	if n.cfg.DefaultPatternType == "" {
		n.cfg.DefaultPatternType = "literal"
	}
	n.cfg.DefaultPatterns = strings.TrimSpace(n.cfg.DefaultPatterns)
	var err error
	n.repoScopeTmpl, err = el.NewTemplate(n.cfg.RepoScope)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: repoScope 模板: %w", err)
	}
	n.repoFrontendTmpl, err = el.NewTemplate(n.cfg.RepoFrontend)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: repoFrontend 模板: %w", err)
	}
	n.repoBackendTmpl, err = el.NewTemplate(n.cfg.RepoBackend)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: repoBackend 模板: %w", err)
	}
	n.contextGlobalTmpl, err = el.NewTemplate(n.cfg.ContextGlobal)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: contextGlobal 模板: %w", err)
	}
	n.typeFilterTmpl, err = el.NewTemplate(n.cfg.TypeFilter)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: typeFilter 模板: %w", err)
	}
	n.includeForkedTmpl, err = el.NewTemplate(n.cfg.IncludeForked)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: includeForked 模板: %w", err)
	}
	n.displayLimitTmpl, err = el.NewTemplate(n.cfg.DisplayLimit)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: displayLimit 模板: %w", err)
	}
	n.defaultPatternTypeTmpl, err = el.NewTemplate(n.cfg.DefaultPatternType)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: defaultPatternType 模板: %w", err)
	}
	n.defaultPatternsTmpl, err = el.NewTemplate(n.cfg.DefaultPatterns)
	if err != nil {
		return fmt.Errorf("sourcegraph/queryBuild: defaultPatterns 模板: %w", err)
	}
	return nil
}

type sourcegraphPreprocessPatterns struct {
	PatternType string   `json:"patternType"`
	Patterns    []string `json:"patterns"`
}

// parseQueryBuildData 解析消息 data：空、或合法 JSON 但 patterns 为空时返回 ok=false，供回退到块上默认路径。
func parseQueryBuildData(data string) (patternType string, patterns []string, ok bool) {
	data = strings.TrimSpace(data)
	if data == "" {
		return "", nil, false
	}
	var wrap sourcegraphPreprocessPatterns
	if err := json.Unmarshal([]byte(data), &wrap); err == nil {
		if len(wrap.Patterns) == 0 {
			return "", nil, false
		}
		pt := strings.TrimSpace(wrap.PatternType)
		if pt == "" {
			pt = "literal"
		}
		out := make([]string, 0, len(wrap.Patterns))
		for _, p := range wrap.Patterns {
			if s := strings.TrimSpace(p); s != "" {
				out = append(out, s)
			}
		}
		if len(out) == 0 {
			return "", nil, false
		}
		return pt, out, true
	}
	return "literal", []string{data}, true
}

func splitDefaultPatternsLines(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if t := strings.TrimSpace(line); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func (n *SourcegraphQueryBuildNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	patternType, patterns, fromMsg := parseQueryBuildData(msg.GetData())
	if !fromMsg {
		pt := strings.ToLower(strings.TrimSpace(n.defaultPatternTypeTmpl.ExecuteAsString(env)))
		if pt != "regexp" {
			pt = "literal"
		}
		patternType = pt
		patterns = splitDefaultPatternsLines(n.defaultPatternsTmpl.ExecuteAsString(env))
	}
	if len(patterns) == 0 {
		ctx.TellFailure(msg, errors.New("sourcegraph/queryBuild: 无搜索路径：请在上游消息 data 中传入 JSON/纯文本，或在块配置中填写 defaultPatterns（每行一条）"))
		return
	}
	scope := strings.ToLower(strings.TrimSpace(n.repoScopeTmpl.ExecuteAsString(env)))
	repoFE := strings.TrimSpace(n.repoFrontendTmpl.ExecuteAsString(env))
	repoBE := strings.TrimSpace(n.repoBackendTmpl.ExecuteAsString(env))
	repoFilter := repoFilterForTracerScope(scope, repoFE, repoBE)

	var ctxTok string
	if parseTruthyTemplate(n.contextGlobalTmpl.ExecuteAsString(env)) {
		ctxTok = "context:global"
	}
	typeFilter := strings.TrimSpace(n.typeFilterTmpl.ExecuteAsString(env))
	var forkFilter string
	if parseTruthyTemplate(n.includeForkedTmpl.ExecuteAsString(env)) {
		forkFilter = "fork:yes"
	}
	limit := parseDisplayLimitTemplate(n.displayLimitTmpl.ExecuteAsString(env), 1500)

	parts := tracerSourcegraphQueryParts{
		ContextGlobal: ctxTok,
		TypeFilter:    typeFilter,
		RepoFilter:    repoFilter,
		ForkFilter:    forkFilter,
		DisplayLimit:  limit,
	}

	queries := make([]string, 0, len(patterns))
	for _, p := range patterns {
		q := buildTracerSourcegraphQuery(patternType, p, parts)
		if q == "" {
			continue
		}
		queries = append(queries, q)
	}
	if len(queries) == 0 {
		ctx.TellFailure(msg, errors.New("sourcegraph/queryBuild: 未能生成任何查询串"))
		return
	}

	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	mergeTraceMetadata(msg, out)
	first := queries[0]
	out.Metadata.PutValue("sourcegraph_built_query", first)
	qb, _ := json.Marshal(queries)
	out.Metadata.PutValue("sourcegraph_built_queries", string(qb))
	out.Metadata.PutValue("sourcegraph_query_repo_scope", scope)

	payload, err := json.Marshal(map[string]interface{}{
		"query":   first,
		"queries": queries,
	})
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	out.SetData(string(payload))
	ctx.TellSuccess(out)
}

func (n *SourcegraphQueryBuildNode) Destroy() {
	n.cfg = sourcegraphQueryBuildConfig{}
	n.repoScopeTmpl = nil
	n.repoFrontendTmpl = nil
	n.repoBackendTmpl = nil
	n.contextGlobalTmpl = nil
	n.typeFilterTmpl = nil
	n.includeForkedTmpl = nil
	n.displayLimitTmpl = nil
	n.defaultPatternTypeTmpl = nil
	n.defaultPatternsTmpl = nil
}

func init() {
	rulego.Registry.Register(&SourcegraphQueryBuildNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&SourcegraphQueryBuildNode{}).Type())
}
