package rulego

import (
	"fmt"
	"strconv"
	"strings"
)

// 与 api-route-tracer-frontend/scripts/sourcegraph_search.py 中拼接规则一致（Stream/网页查询串）。

const (
	defaultSourcegraphRepoFrontend = `teacher/fe/.*|frontend/.*`
	defaultSourcegraphRepoBackend  = `teacher/backend/.*|backend/.*`
)

type tracerSourcegraphQueryParts struct {
	ContextGlobal string // "context:global" 或空
	TypeFilter    string
	RepoFilter    string // 如 repo:(a|b)
	ForkFilter    string // fork:yes 或空
	DisplayLimit  int
}

func buildTracerSourcegraphQuery(patternType, pattern string, p tracerSourcegraphQueryParts) string {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		return ""
	}
	pt := strings.ToLower(strings.TrimSpace(patternType))
	if pt == "" {
		pt = "literal"
	}
	var segs []string
	if strings.TrimSpace(p.ContextGlobal) != "" {
		segs = append(segs, strings.TrimSpace(p.ContextGlobal))
	}
	segs = append(segs, pattern)
	if tf := strings.TrimSpace(p.TypeFilter); tf != "" {
		segs = append(segs, tf)
	}
	if pt == "regexp" {
		segs = append(segs, "patternType:regexp")
	}
	if rf := strings.TrimSpace(p.RepoFilter); rf != "" {
		segs = append(segs, rf)
	}
	if ff := strings.TrimSpace(p.ForkFilter); ff != "" {
		segs = append(segs, ff)
	}
	s := strings.TrimSpace(strings.Join(segs, " "))
	s = strings.Join(strings.Fields(s), " ")
	if p.DisplayLimit > 0 {
		s = strings.TrimSpace(s + " " + fmt.Sprintf("count:%d", p.DisplayLimit))
	}
	return s
}

func repoFilterForTracerScope(scope, repoFrontend, repoBackend string) string {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "frontend":
		rf := strings.TrimSpace(repoFrontend)
		if rf == "" {
			rf = defaultSourcegraphRepoFrontend
		}
		return "repo:(" + rf + ")"
	case "backend":
		rb := strings.TrimSpace(repoBackend)
		if rb == "" {
			rb = defaultSourcegraphRepoBackend
		}
		return "repo:(" + rb + ")"
	default:
		return ""
	}
}

func parseTruthyTemplate(s string) bool {
	v := strings.ToLower(strings.TrimSpace(s))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func parseDisplayLimitTemplate(s string, fallback int) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
