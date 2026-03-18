package llm

import (
	"context"
	"log"
	"strings"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/openai"
)

// truncateForLog 截断字符串用于日志，避免过长；换行改为空格。
func truncateForLog(s string, maxLen int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.TrimSpace(s)
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

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

	// 默认使用 ~/.devpilot/skills/ 作为技能目录（与 Claude Code / OpenClaw 一致）
	if config.SkillDir == "" {
		config.SkillDir = DefaultSkillDir()
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

// NewClientWithSkills 根据 config 创建 LLM 客户端，并仅使用指定的 skills（不从 SkillDir 加载）。
// 用于“仅暴露 create-skill 等内置技能”的流程。
func NewClientWithSkills(ctx context.Context, config Config, skills []Skill) (*Client, error) {
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

	c := &Client{model: model, config: config, skills: skills}
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
	content := resp.Choices[0].Content
	log.Printf("[llm] 大模型响应 contentLen=%d preview=%s", len(content), truncateForLog(content, 200))
	return content, nil
}

// DefaultToolLoopMaxRounds 工具调用循环最大轮数，避免无限递归。
const DefaultToolLoopMaxRounds = 16

// GenerateWithToolLoop 带工具调用的生成：传入 tools 与 ToolExecutor，当模型返回 tool_calls 时执行并继续，
// 直到模型返回纯文本或达到 maxRounds。与 Claude Code / OpenClaw 的 MCP 调用流程一致。
// 若 tools 为空或 executor 为 nil，行为等价于 GenerateFromMessagesWithOptions（不传 WithTools）。
func (c *Client) GenerateWithToolLoop(ctx context.Context, messages []llms.MessageContent, tools []llms.Tool, opts []llms.CallOption, executor ToolExecutor, maxRounds int) (string, error) {
	if len(opts) == 0 {
		opts = c.callOptions()
	}
	if maxRounds <= 0 {
		maxRounds = DefaultToolLoopMaxRounds
	}
	callOpts := make([]llms.CallOption, len(opts), len(opts)+1)
	copy(callOpts, opts)
	if len(tools) > 0 {
		callOpts = append(callOpts, llms.WithTools(tools))
	}

	for round := 0; round < maxRounds; round++ {
		resp, err := c.model.GenerateContent(ctx, messages, callOpts...)
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", ErrEmptyResponse
		}
		choice := resp.Choices[0]
		if choice.Content != "" {
			log.Printf("[llm] 大模型响应 round=%d contentLen=%d preview=%s", round+1, len(choice.Content), truncateForLog(choice.Content, 200))
		}
		if len(choice.ToolCalls) > 0 {
			names := make([]string, 0, len(choice.ToolCalls))
			for _, tc := range choice.ToolCalls {
				if tc.FunctionCall != nil {
					names = append(names, tc.FunctionCall.Name)
				}
			}
			log.Printf("[llm] 大模型响应 round=%d tool_calls=%v", round+1, names)
		}
		if len(choice.ToolCalls) == 0 || executor == nil {
			return choice.Content, nil
		}
		// 追加 assistant 消息（含 tool_calls）
		parts := make([]llms.ContentPart, 0, len(choice.ToolCalls)+1)
		if choice.Content != "" {
			parts = append(parts, llms.TextContent{Text: choice.Content})
		}
		for _, tc := range choice.ToolCalls {
			parts = append(parts, tc)
		}
		messages = append(messages, llms.MessageContent{
			Role:  llms.ChatMessageTypeAI,
			Parts: parts,
		})
		// 执行每个 tool call 并追加 tool 结果消息
		for _, tc := range choice.ToolCalls {
			if tc.FunctionCall == nil {
				continue
			}
			name := tc.FunctionCall.Name
			args := tc.FunctionCall.Arguments
			log.Printf("[llm] tool 调用 name=%s argumentsLen=%d", name, len(args))
			content, err := executor.Execute(ctx, name, args)
			if err != nil {
				content = "error: " + err.Error()
			}
			log.Printf("[llm] tool 返回 name=%s success=%v resultLen=%d", name, err == nil, len(content))
			messages = append(messages, llms.MessageContent{
				Role: llms.ChatMessageTypeTool,
				Parts: []llms.ContentPart{
					llms.ToolCallResponse{
						ToolCallID: tc.ID,
						Name:       tc.FunctionCall.Name,
						Content:    content,
					},
				},
			})
		}
	}
	return "", ErrToolLoopMaxRounds
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
