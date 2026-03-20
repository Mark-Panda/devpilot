package agent

import (
	"context"
	"fmt"
	"sync"
	"time"

	"devpilot/backend/internal/llm"
	"github.com/rs/zerolog/log"
	"github.com/tmc/langchaingo/llms"
)

// agentImpl 代理实现
type agentImpl struct {
	mu sync.RWMutex

	config       AgentConfig
	status       AgentStatus
	createdAt    time.Time
	lastActiveAt time.Time
	messageCount int

	llmClient *llm.Client
	messageBus MessageBus
	projectCtx ProjectContext

	messagesCh <-chan Message
	stopCh     chan struct{}
	children   map[string]bool
}

// NewAgent 创建新代理
func NewAgent(ctx context.Context, config AgentConfig, messageBus MessageBus, projectCtx ProjectContext) (Agent, error) {
	// 构建 LLM 配置
	llmCfg := llm.Config{
		BaseURL:     config.ModelConfig.BaseURL,
		APIKey:      config.ModelConfig.APIKey,
		Model:       config.ModelConfig.Model,
		MaxTokens:   config.ModelConfig.MaxTokens,
		Temperature: config.ModelConfig.Temperature,
	}

	// 创建 LLM 客户端
	client, err := llm.NewClient(ctx, llmCfg)
	if err != nil {
		return nil, fmt.Errorf("create llm client: %w", err)
	}

	// 订阅消息总线
	messagesCh, err := messageBus.Subscribe(config.ID)
	if err != nil {
		return nil, fmt.Errorf("subscribe to message bus: %w", err)
	}

	agent := &agentImpl{
		config:       config,
		status:       AgentStatusIdle,
		createdAt:    time.Now(),
		lastActiveAt: time.Now(),
		llmClient:    client,
		messageBus:   messageBus,
		projectCtx:   projectCtx,
		messagesCh:   messagesCh,
		stopCh:       make(chan struct{}),
		children:     make(map[string]bool),
	}

	// 启动消息监听
	go agent.messageLoop()

	log.Info().
		Str("agent_id", config.ID).
		Str("type", string(config.Type)).
		Msg("agent created")

	return agent, nil
}

// ID 返回代理 ID
func (a *agentImpl) ID() string {
	return a.config.ID
}

// Config 返回配置
func (a *agentImpl) Config() AgentConfig {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.config
}

// Info 返回运行时信息
func (a *agentImpl) Info() AgentInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()

	children := make([]string, 0, len(a.children))
	for id := range a.children {
		children = append(children, id)
	}

	return AgentInfo{
		Config:       a.config,
		Status:       a.status,
		CreatedAt:    a.createdAt,
		LastActiveAt: a.lastActiveAt,
		MessageCount: a.messageCount,
		Children:     children,
	}
}

// SendMessage 发送消息
func (a *agentImpl) SendMessage(ctx context.Context, msg Message) error {
	msg.FromAgent = a.config.ID
	if msg.ToAgent == "" {
		return a.messageBus.Publish(ctx, msg)
	}
	return a.messageBus.PublishToAgent(ctx, msg, msg.ToAgent)
}

// Process 处理用户消息
func (a *agentImpl) Process(ctx context.Context, userMessage string) (string, error) {
	a.mu.Lock()
	a.status = AgentStatusBusy
	a.lastActiveAt = time.Now()
	a.messageCount++
	a.mu.Unlock()

	defer func() {
		a.mu.Lock()
		a.status = AgentStatusIdle
		a.mu.Unlock()
	}()

	// 构建系统提示
	systemPrompt := a.buildSystemPrompt(ctx)

	// 获取已加载的技能
	skills := a.llmClient.Skills()

	// 过滤启用的技能
	enabledSkills := make([]llm.Skill, 0)
	if len(a.config.Skills) > 0 {
		skillMap := make(map[string]llm.Skill)
		for _, s := range skills {
			skillMap[s.Name] = s
		}
		for _, name := range a.config.Skills {
			if skill, ok := skillMap[name]; ok {
				enabledSkills = append(enabledSkills, skill)
			}
		}
	}

	// 如果启用了技能,使用工具循环
	if len(enabledSkills) > 0 {
		// 将技能转为工具
		tools := llm.SkillsToTools(enabledSkills)
		executor := llm.NewSkillExecutor(a.llmClient, enabledSkills)

		// 构建消息
		messages := []llms.MessageContent{
			{
				Role:  llms.ChatMessageTypeSystem,
				Parts: []llms.ContentPart{llms.TextContent{Text: systemPrompt}},
			},
			{
				Role:  llms.ChatMessageTypeHuman,
				Parts: []llms.ContentPart{llms.TextContent{Text: userMessage}},
			},
		}

		// 使用工具循环生成
		return a.llmClient.GenerateWithToolLoop(ctx, messages, tools, nil, executor, llm.DefaultToolLoopMaxRounds)
	}

	// 普通对话
	return a.llmClient.ChatWithSystem(ctx, systemPrompt, userMessage)
}

// Stop 停止代理
func (a *agentImpl) Stop() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.status == AgentStatusStopped {
		return nil
	}

	a.status = AgentStatusStopped
	close(a.stopCh)

	// 取消订阅
	if err := a.messageBus.Unsubscribe(a.config.ID); err != nil {
		log.Warn().Err(err).Str("agent_id", a.config.ID).Msg("failed to unsubscribe from message bus")
	}

	log.Info().Str("agent_id", a.config.ID).Msg("agent stopped")
	return nil
}

// messageLoop 消息监听循环
func (a *agentImpl) messageLoop() {
	for {
		select {
		case msg := <-a.messagesCh:
			a.handleMessage(msg)
		case <-a.stopCh:
			return
		}
	}
}

// handleMessage 处理收到的消息
func (a *agentImpl) handleMessage(msg Message) {
	a.mu.Lock()
	a.messageCount++
	a.lastActiveAt = time.Now()
	a.mu.Unlock()

	log.Debug().
		Str("agent_id", a.config.ID).
		Str("from", msg.FromAgent).
		Str("type", string(msg.Type)).
		Msg("received message")

	// 根据消息类型处理
	switch msg.Type {
	case MessageTypeRequest:
		// 处理请求并回复
		ctx := context.Background()
		response, err := a.Process(ctx, msg.Content)
		if err != nil {
			log.Error().Err(err).Str("agent_id", a.config.ID).Msg("failed to process request")
			return
		}

		// 发送响应
		respMsg := Message{
			Type:    MessageTypeResponse,
			Content: response,
			ToAgent: msg.FromAgent,
			Metadata: map[string]interface{}{
				"request_id": msg.ID,
			},
		}
		if err := a.SendMessage(ctx, respMsg); err != nil {
			log.Error().Err(err).Str("agent_id", a.config.ID).Msg("failed to send response")
		}

	case MessageTypeEvent:
		// 处理事件(可扩展)
		log.Debug().Str("agent_id", a.config.ID).Interface("event", msg.Metadata).Msg("received event")
	}
}

// buildSystemPrompt 构建系统提示
func (a *agentImpl) buildSystemPrompt(ctx context.Context) string {
	prompt := a.config.SystemPrompt
	if prompt == "" {
		prompt = fmt.Sprintf("你是一个名为 %s 的 AI 助手。", a.config.Name)
	}

	// 添加项目上下文
	if a.projectCtx != nil {
		if info, err := a.projectCtx.GetProjectInfo(ctx); err == nil {
			prompt += fmt.Sprintf("\n\n当前项目: %s\n路径: %s\n语言: %s",
				info.Name, info.Path, info.Language)
			if info.Description != "" {
				prompt += fmt.Sprintf("\n说明: %s", info.Description)
			}
		}
	}

	// 添加代理能力说明
	if len(a.config.Skills) > 0 {
		prompt += fmt.Sprintf("\n\n你拥有以下技能: %v", a.config.Skills)
	}

	return prompt
}

// AddChild 添加子代理
func (a *agentImpl) AddChild(childID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.children[childID] = true
}

// RemoveChild 移除子代理
func (a *agentImpl) RemoveChild(childID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.children, childID)
}
