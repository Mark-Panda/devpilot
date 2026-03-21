package llm

import (
	"context"
	"errors"
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
	model      llms.Model
	config     Config
	modelChain []string
	skills     []Skill
}

func newClientCore(config Config, skills []Skill, loadSkillDir bool) (*Client, error) {
	config.BaseURL = strings.TrimSpace(config.BaseURL)
	config.APIKey = strings.TrimSpace(config.APIKey)
	chain := NormalizeModelChain(config.Model, config.Models)
	if config.BaseURL == "" || config.APIKey == "" || len(chain) == 0 {
		return nil, ErrInvalidConfig
	}
	config.Model = chain[0]

	opts := []openai.Option{
		openai.WithToken(config.APIKey),
		openai.WithBaseURL(config.BaseURL),
		openai.WithModel(config.Model),
	}
	model, err := openai.New(opts...)
	if err != nil {
		return nil, err
	}

	if config.SkillDir == "" {
		config.SkillDir = DefaultSkillDir()
	}
	c := &Client{model: model, config: config, modelChain: chain, skills: skills}
	if loadSkillDir && config.SkillDir != "" {
		loaded, err := LoadSkills(config.SkillDir)
		if err != nil {
			return nil, err
		}
		c.skills = loaded
	}
	return c, nil
}

// NewClient 根据 config 创建 LLM 客户端。会校验 BaseURL/APIKey 与至少一个模型，并可选加载 SkillDir 下的技能。
func NewClient(ctx context.Context, config Config) (*Client, error) {
	return newClientCore(config, nil, true)
}

// NewClientWithSkills 根据 config 创建 LLM 客户端，并仅使用指定的 skills（不从 SkillDir 加载）。
// 用于“仅暴露 skill-creator 等技能”的流程。
func NewClientWithSkills(ctx context.Context, config Config, skills []Skill) (*Client, error) {
	return newClientCore(config, skills, false)
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
	return c.generateSingleRoundWithFailover(ctx, messages, nil)
}

// GenerateFromMessages 使用已有消息列表调用模型（可用于多轮或带 MCP 工具结果的对话）。
func (c *Client) GenerateFromMessages(ctx context.Context, messages []llms.MessageContent) (string, error) {
	return c.GenerateFromMessagesWithOptions(ctx, messages, c.callOptions())
}

// GenerateFromMessagesWithOptions 使用指定 CallOption 调用模型，便于 RuleGo 节点按 Params 传入参数。
func (c *Client) GenerateFromMessagesWithOptions(ctx context.Context, messages []llms.MessageContent, opts []llms.CallOption) (string, error) {
	return c.generateSingleRoundWithFailover(ctx, messages, opts)
}

// DefaultToolLoopMaxRounds 工具调用循环最大轮数，避免无限递归。
const DefaultToolLoopMaxRounds = 16

// GenerateWithToolLoop 带工具调用的生成：传入 tools 与 ToolExecutor，当模型返回 tool_calls 时执行并继续，
// 直到模型返回纯文本或达到 maxRounds。与 Claude Code / OpenClaw 的 MCP 调用流程一致。
// 若 tools 为空或 executor 为 nil，行为等价于 GenerateFromMessagesWithOptions（不传 WithTools）。
// 配置多个模型时，任一轮 API 失败或空响应会换下一个模型并从初始 messages 整段重试。
func (c *Client) GenerateWithToolLoop(ctx context.Context, messages []llms.MessageContent, tools []llms.Tool, opts []llms.CallOption, executor ToolExecutor, maxRounds int) (string, error) {
	if maxRounds <= 0 {
		maxRounds = DefaultToolLoopMaxRounds
	}
	baseOpts := opts
	if len(baseOpts) == 0 {
		baseOpts = c.callOptions()
	}

	var lastErr error
	chainLen := len(c.modelChain)
	for mi, mName := range c.modelChain {
		msgs := CloneMessageContents(messages)
		callOpts := c.callOptionsForModel(mName, baseOpts)
		if len(tools) > 0 {
			callOpts = append(callOpts, llms.WithTools(tools))
		}
		out, err := c.generateWithToolLoopOneModel(ctx, msgs, callOpts, executor, maxRounds)
		if err == nil {
			if mi > 0 {
				log.Printf("[llm] 多模型故障转移成功，使用模型 %q（链上下标 %d/%d）", mName, mi+1, chainLen)
			}
			return out, nil
		}
		if errors.Is(err, context.Canceled) {
			return "", err
		}
		lastErr = err
		if mi < chainLen-1 {
			log.Printf("[llm] 模型 %q 调用失败（%d/%d），尝试下一模型: %v", mName, mi+1, chainLen, err)
		} else {
			log.Printf("[llm] 模型 %q 调用失败（%d/%d，已是最后一个模型）: %v", mName, mi+1, chainLen, err)
		}
	}
	if lastErr == nil {
		lastErr = ErrEmptyResponse
	}
	return "", lastErr
}

func (c *Client) generateSingleRoundWithFailover(ctx context.Context, messages []llms.MessageContent, extra []llms.CallOption) (string, error) {
	var lastErr error
	chainLen := len(c.modelChain)
	for mi, mName := range c.modelChain {
		callOpts := c.callOptionsForModel(mName, extra)
		resp, err := c.model.GenerateContent(ctx, messages, callOpts...)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return "", err
			}
			lastErr = err
			if mi < chainLen-1 {
				log.Printf("[llm] 模型 %q 请求失败（%d/%d），尝试下一模型: %v", mName, mi+1, chainLen, err)
			} else {
				log.Printf("[llm] 模型 %q 请求失败（%d/%d，已是最后一个模型）: %v", mName, mi+1, chainLen, err)
			}
			continue
		}
		if len(resp.Choices) == 0 {
			lastErr = ErrEmptyResponse
			if mi < chainLen-1 {
				log.Printf("[llm] 模型 %q 返回空 choices（%d/%d），尝试下一模型", mName, mi+1, chainLen)
			} else {
				log.Printf("[llm] 模型 %q 返回空 choices（%d/%d，已是最后一个模型）", mName, mi+1, chainLen)
			}
			continue
		}
		if mi > 0 {
			log.Printf("[llm] 多模型故障转移成功，使用模型 %q（链上下标 %d/%d）", mName, mi+1, chainLen)
		}
		content := resp.Choices[0].Content
		log.Printf("[llm] 大模型响应 contentLen=%d preview=%s", len(content), truncateForLog(content, 200))
		return content, nil
	}
	if lastErr == nil {
		lastErr = ErrEmptyResponse
	}
	return "", lastErr
}

func (c *Client) generateWithToolLoopOneModel(ctx context.Context, messages []llms.MessageContent, callOpts []llms.CallOption, executor ToolExecutor, maxRounds int) (string, error) {
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

func (c *Client) callOptionsForModel(modelName string, extra []llms.CallOption) []llms.CallOption {
	var base []llms.CallOption
	if len(extra) == 0 {
		base = c.callOptions()
	} else {
		base = extra
	}
	out := make([]llms.CallOption, 0, len(base)+1)
	out = append(out, llms.WithModel(modelName))
	out = append(out, base...)
	return out
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
