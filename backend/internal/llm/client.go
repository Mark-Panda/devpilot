package llm

import (
	"context"
	"strings"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/openai"
)

// Client 基于 langchaingo 的自定义 LLM 客户端，支持 baseUrl/apiKey/model、Skill 与 MCP 配置。
type Client struct {
	model  llms.Model
	config Config
	skills []Skill
}

// NewClient 根据 config 创建 LLM 客户端。会校验 BaseURL/APIKey/Model，并可选加载 SkillDir 下的技能。
func NewClient(ctx context.Context, config Config) (*Client, error) {
	config.BaseURL = strings.TrimSpace(config.BaseURL)
	config.APIKey = strings.TrimSpace(config.APIKey)
	config.Model = strings.TrimSpace(config.Model)
	if config.BaseURL == "" || config.APIKey == "" || config.Model == "" {
		return nil, ErrInvalidConfig
	}

	opts := []openai.Option{
		openai.WithToken(config.APIKey),
		openai.WithBaseURL(config.BaseURL),
		openai.WithModel(config.Model),
	}
	model, err := openai.New(opts...)
	if err != nil {
		return nil, err
	}

	c := &Client{model: model, config: config}
	if config.SkillDir != "" {
		skills, err := LoadSkills(config.SkillDir)
		if err != nil {
			return nil, err
		}
		c.skills = skills
	}
	return c, nil
}

// Chat 使用当前模型进行单轮对话。若配置了 SkillDir 且加载到技能，会将技能描述注入为系统提示（仅 description，节省 token）。
// 若希望注入完整技能内容，可使用 ChatWithSkillPrompt 或自行构建 messages。
func (c *Client) Chat(ctx context.Context, userMessage string) (string, error) {
	return c.ChatWithSkillPrompt(ctx, userMessage, true)
}

// ChatWithSkillPrompt 与 Chat 相同，但可通过 onlySkillDescriptions 控制是否只注入技能描述（true）还是完整技能内容（false）。
func (c *Client) ChatWithSkillPrompt(ctx context.Context, userMessage string, onlySkillDescriptions bool) (string, error) {
	var systemPrompt string
	if len(c.skills) > 0 {
		systemPrompt = BuildSkillSystemPrompt(c.skills, onlySkillDescriptions)
	}
	return c.ChatWithSystem(ctx, systemPrompt, userMessage)
}

// ChatWithSystem 使用自定义 systemPrompt 与 userMessage 进行单轮对话。
func (c *Client) ChatWithSystem(ctx context.Context, systemPrompt, userMessage string) (string, error) {
	opts := c.callOptions()
	var messages []llms.MessageContent
	if systemPrompt != "" {
		messages = append(messages, llms.MessageContent{
			Role:  llms.ChatMessageTypeSystem,
			Parts: []llms.ContentPart{llms.TextContent{Text: systemPrompt}},
		})
	}
	messages = append(messages, llms.MessageContent{
		Role:  llms.ChatMessageTypeHuman,
		Parts: []llms.ContentPart{llms.TextContent{Text: userMessage}},
	})
	resp, err := c.model.GenerateContent(ctx, messages, opts...)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", ErrEmptyResponse
	}
	return resp.Choices[0].Content, nil
}

// GenerateFromMessages 使用已有消息列表调用模型（可用于多轮或带 MCP 工具结果的对话）。
func (c *Client) GenerateFromMessages(ctx context.Context, messages []llms.MessageContent) (string, error) {
	return c.GenerateFromMessagesWithOptions(ctx, messages, c.callOptions())
}

// GenerateFromMessagesWithOptions 使用指定 CallOption 调用模型，便于 RuleGo 节点按 Params 传入参数。
func (c *Client) GenerateFromMessagesWithOptions(ctx context.Context, messages []llms.MessageContent, opts []llms.CallOption) (string, error) {
	if len(opts) == 0 {
		opts = c.callOptions()
	}
	resp, err := c.model.GenerateContent(ctx, messages, opts...)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", ErrEmptyResponse
	}
	return resp.Choices[0].Content, nil
}

func (c *Client) callOptions() []llms.CallOption {
	var opts []llms.CallOption
	if c.config.MaxTokens > 0 {
		opts = append(opts, llms.WithMaxTokens(c.config.MaxTokens))
	}
	if c.config.Temperature >= 0 && c.config.Temperature <= 2 {
		opts = append(opts, llms.WithTemperature(c.config.Temperature))
	}
	return opts
}

// Config 返回当前使用的配置副本。
func (c *Client) Config() Config { return c.config }

// Skills 返回已加载的技能列表（只读）。
func (c *Client) Skills() []Skill {
	if len(c.skills) == 0 {
		return nil
	}
	out := make([]Skill, len(c.skills))
	copy(out, c.skills)
	return out
}
