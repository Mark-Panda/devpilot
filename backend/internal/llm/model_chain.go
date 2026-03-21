package llm

import (
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// NormalizeModelChain 合并首模型 Model 与备用 Models，去重并保持顺序（先 primary 再 extras）。
func NormalizeModelChain(primary string, extras []string) []string {
	primary = strings.TrimSpace(primary)
	seen := make(map[string]struct{})
	var out []string
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	add(primary)
	for _, e := range extras {
		add(e)
	}
	return out
}

// CloneMessageContents 浅拷贝消息列表（Parts 切片复制一层），供整段 tool 循环在切换模型时从初始消息重试。
func CloneMessageContents(src []llms.MessageContent) []llms.MessageContent {
	if len(src) == 0 {
		return nil
	}
	out := make([]llms.MessageContent, len(src))
	for i, m := range src {
		out[i].Role = m.Role
		out[i].Parts = append([]llms.ContentPart(nil), m.Parts...)
	}
	return out
}
