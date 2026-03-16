package llm

import (
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// DefaultLLMURL RuleGo 文档默认请求地址
const DefaultLLMURL = "https://ai.gitee.com/v1"

// NodeConfigToConfig 将 NodeConfig 转为 Config（url/key -> BaseURL/APIKey），便于创建 Client。
func NodeConfigToConfig(nc *NodeConfig) Config {
	url := strings.TrimSpace(nc.URL)
	if url == "" {
		url = DefaultLLMURL
	}
	cfg := Config{
		BaseURL:  url,
		APIKey:   strings.TrimSpace(nc.Key),
		Model:    strings.TrimSpace(nc.Model),
		SkillDir: strings.TrimSpace(nc.SkillDir),
		MCP:      nc.MCP,
	}
	if nc.Params != nil {
		cfg.MaxTokens = nc.Params.MaxTokens
		cfg.Temperature = float64(nc.Params.Temperature)
	}
	return cfg
}

// BuildMessageContentFromNodeConfig 将 NodeConfig 的 systemPrompt + messages 转为 langchaingo MessageContent 列表。
// substitute 用于替换 content 中的 ${key} 占位符，可为 nil。
func BuildMessageContentFromNodeConfig(nc *NodeConfig, substitute map[string]string) []llms.MessageContent {
	var out []llms.MessageContent
	systemPrompt := nc.SystemPrompt
	if len(substitute) > 0 {
		systemPrompt = replacePlaceholders(systemPrompt, substitute)
	}
	if systemPrompt != "" {
		out = append(out, llms.MessageContent{
			Role:  llms.ChatMessageTypeSystem,
			Parts: []llms.ContentPart{llms.TextContent{Text: systemPrompt}},
		})
	}
	for _, m := range nc.Messages {
		content := m.Content
		if len(substitute) > 0 {
			content = replacePlaceholders(content, substitute)
		}
		role := llms.ChatMessageTypeHuman
		if strings.ToLower(strings.TrimSpace(m.Role)) == "assistant" {
			role = llms.ChatMessageTypeAI
		}
		out = append(out, llms.MessageContent{
			Role:  role,
			Parts: []llms.ContentPart{llms.TextContent{Text: content}},
		})
	}
	return out
}

func replacePlaceholders(s string, m map[string]string) string {
	for k, v := range m {
		s = strings.ReplaceAll(s, "${"+k+"}", v)
		s = strings.ReplaceAll(s, "${vars."+k+"}", v)
	}
	return s
}

// CallOptionsFromParams 将 RuleGo Params 转为 langchaingo CallOption 列表。
func CallOptionsFromParams(p *Params) []llms.CallOption {
	if p == nil {
		return nil
	}
	var opts []llms.CallOption
	if p.MaxTokens > 0 {
		opts = append(opts, llms.WithMaxTokens(p.MaxTokens))
	}
	if p.Temperature >= 0 && p.Temperature <= 2 {
		opts = append(opts, llms.WithTemperature(float64(p.Temperature)))
	}
	if p.TopP > 0 && p.TopP <= 1 {
		opts = append(opts, llms.WithTopP(float64(p.TopP)))
	}
	if p.PresencePenalty >= 0 && p.PresencePenalty <= 1 {
		opts = append(opts, llms.WithPresencePenalty(float64(p.PresencePenalty)))
	}
	if p.FrequencyPenalty >= 0 && p.FrequencyPenalty <= 1 {
		opts = append(opts, llms.WithFrequencyPenalty(float64(p.FrequencyPenalty)))
	}
	if len(p.Stop) > 0 {
		opts = append(opts, llms.WithStopWords(p.Stop))
	}
	switch strings.TrimSpace(strings.ToLower(p.ResponseFormat)) {
	case "json_object":
		opts = append(opts, llms.WithJSONMode())
	}
	return opts
}
