package agent

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"devpilot/backend/internal/llm"
	"github.com/rs/zerolog/log"
	"github.com/tmc/langchaingo/llms"
)

func modelConfigEqual(a, b ModelConfig) bool {
	return a.BaseURL == b.BaseURL && a.APIKey == b.APIKey && a.Model == b.Model &&
		a.MaxTokens == b.MaxTokens && a.Temperature == b.Temperature
}

func cloneMetadataMap(m map[string]interface{}) map[string]interface{} {
	if m == nil || len(m) == 0 {
		return nil
	}
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// agentImpl 代理实现
type agentImpl struct {
	mu         sync.RWMutex
	processMu  sync.Mutex // 串行化 Process（含来自消息总线的请求）

	config       AgentConfig
	status       AgentStatus
	createdAt    time.Time
	lastActiveAt time.Time
	messageCount int

	llmClient *llm.Client
	messageBus MessageBus
	projectCtx ProjectContext

	// 多轮对话记忆（仅 user/assistant 文本；与 OpenClaw 类 session 一致，供模型上下文）
	memory     []llms.MessageContent
	memoryPath string
	// 当前载入的记忆所属工作室：空串 = 聊天页全局会话；非空 = ~/.devpilot/agent-memory/studio_<id>_<agent>.json
	memorySessionStudioID string
	// 超长记忆压缩后的滚动摘要（注入系统提示；持久化 *-summary.txt）
	memorySummary     string
	memorySummaryPath string

	messagesCh <-chan Message
	stopCh     chan struct{}
	children   map[string]bool

	// 解析其他 Agent 信息（系统提示中列出子代理等）；由 Orchestrator 注入，可为 nil
	peerLookup PeerAgentLookup

	delegateMu      sync.Mutex
	delegateWaiters map[string]chan delegateRPCResult // 委派 RPC：request_id -> 等待子 Agent Response

	studioProgress func(StudioProgressEvent) // 工作室进度上报，可为 nil

	createAgentTool CreateAgentToolFunc // 主 Agent 创建团队工具回调，可为 nil

	studioSubFinished StudioSubFinishedFunc // 工作室子任务完成时通知，可为 nil

	studioTodoRuntime StudioTodoRuntime // 工作室 TODO 持久化，可为 nil
}

// NewAgent 创建新代理；peerLookup 用于在系统提示中展示子代理等，可为 nil；studioProgress 用于工作室委派进度；createAgentTool 仅对 type=main 生效；studioSubFinished 在子 Agent 完成工作室委派时触发主侧续跑；studioTodoRuntime 工作室内 TODO 工具
func NewAgent(ctx context.Context, config AgentConfig, messageBus MessageBus, projectCtx ProjectContext, peerLookup PeerAgentLookup, studioProgress func(StudioProgressEvent), createAgentTool CreateAgentToolFunc, studioSubFinished StudioSubFinishedFunc, studioTodoRuntime StudioTodoRuntime) (Agent, error) {
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

	memPath := agentMemoryFilePath(config.ID)
	var projRoot string
	if projectCtx != nil {
		projRoot = projectCtx.RootPath()
	}
	loadedMem, err := loadChatHistoryFromFile(memPath)
	if err != nil {
		log.Warn().Err(err).Str("agent_id", config.ID).Msg("load agent memory failed, starting empty")
		loadedMem = nil
	}
	loadedFrom := ""
	if len(loadedMem) > 0 {
		loadedFrom = memPath
	} else {
		for _, p := range migrationMemoryCandidatePaths(projRoot, config.ID) {
			if p == "" || p == memPath {
				continue
			}
			if lm, e2 := loadChatHistoryFromFile(p); e2 == nil && len(lm) > 0 {
				loadedMem = lm
				loadedFrom = p
				break
			}
		}
	}
	if len(loadedMem) > 0 && loadedFrom != "" && loadedFrom != memPath && memPath != "" {
		if e3 := saveChatHistoryToFile(memPath, loadedMem); e3 != nil {
			log.Warn().Err(e3).Str("agent_id", config.ID).Str("from", loadedFrom).Msg("migrate agent memory to ~/.devpilot/agent-memory failed")
		}
	}

	sumPath := memorySummaryFilePath(memPath)
	sumText := loadMemorySummaryFromFile(sumPath)
	if sumText == "" && loadedFrom != "" && loadedFrom != memPath {
		altSum := memorySummaryFilePath(loadedFrom)
		sumText = loadMemorySummaryFromFile(altSum)
		if sumText != "" && memPath != "" {
			_ = saveMemorySummaryFile(memorySummaryFilePath(memPath), sumText)
		}
	}

	agent := &agentImpl{
		config:       config,
		status:       AgentStatusIdle,
		createdAt:    time.Now(),
		lastActiveAt: time.Now(),
		llmClient:    client,
		messageBus:   messageBus,
		projectCtx:     projectCtx,
		peerLookup:     peerLookup,
		studioProgress:    studioProgress,
		createAgentTool:   createAgentTool,
		studioSubFinished: studioSubFinished,
		studioTodoRuntime: studioTodoRuntime,
		memory:            loadedMem,
		memoryPath:        memPath,
		memorySummary:     sumText,
		memorySummaryPath: sumPath,
		messagesCh:        messagesCh,
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

// ensureMemorySession 按 context 中的工作室 ID 切换持久化文件与内存（聊天 vs 各工作室互不共享）
func (a *agentImpl) ensureMemorySession(ctx context.Context) {
	sid := StudioIDFromContext(ctx)
	a.mu.Lock()
	defer a.mu.Unlock()
	if sid == a.memorySessionStudioID {
		return
	}
	if a.memoryPath != "" {
		_ = saveChatHistoryToFile(a.memoryPath, a.memory)
		_ = saveMemorySummaryFile(a.memorySummaryPath, a.memorySummary)
	}
	newPath := agentMemoryFilePathForSession(a.config.ID, sid)
	newSumPath := memorySummaryFilePath(newPath)
	loadedMem, err := loadChatHistoryFromFile(newPath)
	if err != nil {
		log.Warn().Err(err).Str("agent_id", a.config.ID).Str("studio_id", sid).Msg("load session memory failed, starting empty")
		loadedMem = nil
	}
	a.memory = loadedMem
	a.memoryPath = newPath
	a.memorySummaryPath = newSumPath
	a.memorySummary = loadMemorySummaryFromFile(newSumPath)
	a.memorySessionStudioID = sid
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
	a.processMu.Lock()
	defer a.processMu.Unlock()

	a.ensureMemorySession(ctx)

	a.mu.Lock()
	a.status = AgentStatusBusy
	a.lastActiveAt = time.Now()
	a.messageCount++
	memSnapshot := cloneMessageSlice(a.memory)
	agentType := a.config.Type
	mcpSelected := append([]string(nil), a.config.MCPServers...)
	a.mu.Unlock()

	defer func() {
		a.mu.Lock()
		a.status = AgentStatusIdle
		a.mu.Unlock()
	}()

	systemPrompt := a.buildSystemPrompt(ctx)

	messages := make([]llms.MessageContent, 0, 2+len(memSnapshot)+1)
	messages = append(messages, llms.MessageContent{
		Role:  llms.ChatMessageTypeSystem,
		Parts: []llms.ContentPart{llms.TextContent{Text: systemPrompt}},
	})
	messages = append(messages, memSnapshot...)
	messages = append(messages, llms.MessageContent{
		Role:  llms.ChatMessageTypeHuman,
		Parts: []llms.ContentPart{llms.TextContent{Text: userMessage}},
	})

	skills := a.llmClient.Skills()
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

	root := ""
	if a.projectCtx != nil {
		root = a.projectCtx.RootPath()
	}
	mcpIDs := resolvedMCPServerIDs(root, agentType, mcpSelected)
	mcpTools, mcpRoute, mcpCleanup, mcpSetupErr := attachMCPForAgent(ctx, root, mcpIDs)
	defer mcpCleanup()
	if mcpSetupErr != nil {
		log.Warn().Err(mcpSetupErr).Str("agent_id", a.config.ID).Msg("mcp attach failed")
	}

	var tools []llms.Tool
	if len(enabledSkills) > 0 {
		tools = append(tools, llm.SkillsToTools(enabledSkills)...)
	}
	tools = append(tools, mcpTools...)

	a.mu.RLock()
	hasChildren := len(a.children) > 0
	a.mu.RUnlock()
	if hasChildren {
		tools = append(tools, delegateToSubAgentTool())
	}
	if agentType == AgentTypeMain && a.createAgentTool != nil {
		tools = append(tools, createAgentTeamTool())
	}
	inStudio := strings.TrimSpace(StudioIDFromContext(ctx)) != ""
	hasStudioTodos := inStudio && a.studioTodoRuntime != nil
	if hasStudioTodos {
		tools = append(tools, studioTodoTool())
		if agentType == AgentTypeMain {
			tools = append(tools, studioTodoSnapshotTool())
		}
	}

	var skillEx llm.ToolExecutor
	if len(enabledSkills) > 0 {
		skillEx = llm.NewSkillExecutor(a.llmClient, enabledSkills)
	}
	composite := newCompositeToolExecutor(skillEx, mcpRoute)

	useToolRouter := hasChildren || (agentType == AgentTypeMain && a.createAgentTool != nil) || hasStudioTodos
	var executor llm.ToolExecutor
	if useToolRouter {
		executor = &agentToolRouter{agent: a, inner: composite}
	} else {
		executor = composite
	}

	var reply string
	var err error
	if len(tools) > 0 && executor != nil {
		reply, err = a.llmClient.GenerateWithToolLoop(ctx, messages, tools, nil, executor, llm.DefaultToolLoopMaxRounds)
	} else {
		reply, err = a.llmClient.GenerateFromMessages(ctx, messages)
	}
	if err != nil {
		return "", err
	}

	a.mu.Lock()
	a.memory = append(a.memory,
		llms.MessageContent{
			Role:  llms.ChatMessageTypeHuman,
			Parts: []llms.ContentPart{llms.TextContent{Text: userMessage}},
		},
		llms.MessageContent{
			Role:  llms.ChatMessageTypeAI,
			Parts: []llms.ContentPart{llms.TextContent{Text: reply}},
		},
	)
	memFull := cloneMessageSlice(a.memory)
	sum := a.memorySummary
	memPath := a.memoryPath
	sumPath := a.memorySummaryPath
	a.mu.Unlock()

	finalMem := memFull
	finalSum := sum
	if outMem, outSum, cerr := maybeCompressMemory(ctx, a.llmClient, memFull, sum); cerr != nil {
		log.Warn().Err(cerr).Str("agent_id", a.config.ID).Msg("memory compress failed, fallback trim only")
		finalMem = trimMemory(memFull)
		finalSum = sum
	} else {
		finalMem = outMem
		finalSum = outSum
	}

	a.mu.Lock()
	a.memory = finalMem
	a.memorySummary = finalSum
	a.mu.Unlock()

	if err := saveChatHistoryToFile(memPath, finalMem); err != nil {
		log.Warn().Err(err).Str("agent_id", a.config.ID).Msg("persist agent memory failed")
	}
	if err := saveMemorySummaryFile(sumPath, finalSum); err != nil {
		log.Warn().Err(err).Str("agent_id", a.config.ID).Msg("persist memory summary failed")
	}

	return reply, nil
}

// ChatHistory 返回已持久化的对话轮次（user/assistant）
func (a *agentImpl) ChatHistory() []ChatHistoryEntry {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return memoryToEntries(a.memory)
}

// ClearChatHistory 清空当前载入会话的记忆并删除对应磁盘文件
func (a *agentImpl) ClearChatHistory() error {
	a.mu.Lock()
	a.memory = nil
	a.memorySummary = ""
	path := a.memoryPath
	sumPath := a.memorySummaryPath
	a.mu.Unlock()
	deleteAgentMemoryFile(path)
	deleteMemorySummaryFile(sumPath)
	return nil
}

// clearMemoryIfSessionMatches 若当前内存会话与给定工作室 ID 一致则清空内存（磁盘由调用方删）
func (a *agentImpl) clearMemoryIfSessionMatches(studioID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if studioID != a.memorySessionStudioID {
		return
	}
	a.memory = nil
	a.memorySummary = ""
}

// wipeMemoryState 销毁 Agent 前清空内存中的会话状态（磁盘由 DeleteAllSessionMemoryFilesForAgent 处理）
func (a *agentImpl) wipeMemoryState() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.memory = nil
	a.memorySummary = ""
	a.memorySessionStudioID = ""
	a.memoryPath = ""
	a.memorySummaryPath = ""
}

// SetModelConfig 热切换模型：重建 LLM 客户端并更新配置（对话记忆保留）
func (a *agentImpl) SetModelConfig(ctx context.Context, mc ModelConfig) error {
	llmCfg := llm.Config{
		BaseURL:     mc.BaseURL,
		APIKey:      mc.APIKey,
		Model:       mc.Model,
		MaxTokens:   mc.MaxTokens,
		Temperature: mc.Temperature,
	}
	client, err := llm.NewClient(ctx, llmCfg)
	if err != nil {
		return fmt.Errorf("create llm client: %w", err)
	}

	a.processMu.Lock()
	defer a.processMu.Unlock()

	a.mu.Lock()
	a.config.ModelConfig = mc
	a.llmClient = client
	a.mu.Unlock()

	log.Info().
		Str("agent_id", a.config.ID).
		Str("model", mc.Model).
		Msg("agent model config updated")
	return nil
}

// UpdateEditableConfig 更新名称、角色、技能、MCP、系统提示与模型配置（不可改 id / type / parent_id）
func (a *agentImpl) UpdateEditableConfig(ctx context.Context, newCfg AgentConfig) error {
	if newCfg.ID != a.config.ID {
		return fmt.Errorf("agent id mismatch")
	}
	a.mu.RLock()
	oldMC := a.config.ModelConfig
	a.mu.RUnlock()
	if !modelConfigEqual(oldMC, newCfg.ModelConfig) {
		if err := a.SetModelConfig(ctx, newCfg.ModelConfig); err != nil {
			return err
		}
	}
	a.mu.Lock()
	a.config.Name = newCfg.Name
	a.config.Role = newCfg.Role
	a.config.Skills = append([]string(nil), newCfg.Skills...)
	a.config.MCPServers = append([]string(nil), newCfg.MCPServers...)
	a.config.SystemPrompt = newCfg.SystemPrompt
	a.config.Metadata = cloneMetadataMap(newCfg.Metadata)
	a.mu.Unlock()
	return nil
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
		// 必须在独立 goroutine 中 Process：委派子 Agent 时当前 Agent 会阻塞等待 Response，
		// 若仍在 messageLoop 线程内同步调用 Process，则无法处理随后到达的 MessageTypeResponse（死锁）。
		msgCopy := msg
		studioID := ""
		if msgCopy.Metadata != nil {
			if v, ok := msgCopy.Metadata["studio_id"].(string); ok {
				studioID = strings.TrimSpace(v)
			}
		}
		if studioID != "" {
			a.fireStudioProgress(StudioProgressEvent{
				StudioID:      studioID,
				Kind:          "sub_task_accepted",
				AgentID:       a.config.ID,
				AgentName:     a.config.Name,
				ParentAgentID: msgCopy.FromAgent,
				TaskPreview:   previewTaskText(msgCopy.Content),
			})
		}
		go func() {
			ctx := context.Background()
			if studioID != "" {
				ctx = WithStudioID(ctx, studioID)
			}
			var response string
			var err error
			if studioID != "" {
				response, err = a.processStudioDelegatedTask(ctx, msgCopy.Content)
			} else {
				response, err = a.Process(ctx, msgCopy.Content)
			}
			if studioID != "" {
				if err != nil {
					a.fireStudioProgress(StudioProgressEvent{
						StudioID:      studioID,
						Kind:          "sub_task_failed",
						AgentID:       a.config.ID,
						AgentName:     a.config.Name,
						ParentAgentID: msgCopy.FromAgent,
						TaskPreview:   previewTaskText(msgCopy.Content),
						Error:         err.Error(),
					})
				} else {
					a.fireStudioProgress(StudioProgressEvent{
						StudioID:      studioID,
						Kind:          "sub_task_finished",
						AgentID:       a.config.ID,
						AgentName:     a.config.Name,
						ParentAgentID: msgCopy.FromAgent,
						TaskPreview:   previewTaskText(msgCopy.Content),
						ResultPreview: previewTaskText(response),
					})
				}
			}
			respMeta := map[string]interface{}{
				"request_id": msgCopy.ID,
			}
			if studioID != "" {
				respMeta["studio_id"] = studioID
				respMeta["task_preview"] = previewTaskText(msgCopy.Content)
			}
			respMsg := Message{
				Type:     MessageTypeResponse,
				ToAgent:  msgCopy.FromAgent,
				Metadata: respMeta,
			}
			if err != nil {
				log.Error().Err(err).Str("agent_id", a.config.ID).Msg("failed to process request")
				respMsg.Content = fmt.Sprintf("[子 Agent 处理失败] %v", err)
			} else {
				respMsg.Content = response
			}
			if err := a.SendMessage(ctx, respMsg); err != nil {
				log.Error().Err(err).Str("agent_id", a.config.ID).Msg("failed to send response")
			}
		}()

	case MessageTypeResponse:
		if a.completeDelegateWait(msg) {
			return
		}
		if a.handleStudioAsyncDelegateResult(msg) {
			return
		}
		log.Debug().
			Str("agent_id", a.config.ID).
			Str("from", msg.FromAgent).
			Msg("received response with no matching delegate waiter (ignored)")

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
	if role := strings.TrimSpace(a.config.Role); role != "" {
		prompt = fmt.Sprintf("【角色】%s\n\n%s", role, prompt)
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

	if sid := StudioIDFromContext(ctx); sid != "" {
		switch a.config.Type {
		case AgentTypeMain:
			prompt += "\n\n【工作室协作模式】\n当前为工作室对话：用户仅通过你（主 Agent）沟通。你需理解需求、拆解任务，" +
				"对适合子 Agent 的工作必须调用工具 " + DelegateToSubAgentToolName +
				" 实际派发。调用后子 Agent 在后台执行，不会阻塞你与用户的对话：你应在收到「委派已提交后台」类观察后尽快用自然语言回复用户（可说明左侧进度面板会更新），用户可同时继续向你提问。" +
				"子 Agent 在后台会**多轮调用工具**直至子任务完成；完成后进度面板会出现「返回结果」，系统也可能自动插入一条协调说明。" +
				"若用户需要整合产出，请在后续轮次根据进度或追问组织答复；若整体需求仍需其它子 Agent，请继续调用委派工具。"
		case AgentTypeSub, AgentTypeWorker:
			prompt += "\n\n【工作室子任务自主执行】\n你收到的是主 Agent 的委派。请**持续使用工具**（技能、MCP、" + DelegateToSubAgentToolName +
				" 等）将任务推进到可交付完成态，避免仅输出一段说明就结束。\n当你确认本子任务**已全部完成**时，在回复**第一行单独一行**输出 " + StudioTaskCompleteToken +
				" ，然后空一行再写总结。在完成前不要输出该标记。\n若收到「工作室自动续跑」类系统消息，表示需继续执行：必须再次调用工具推进，直至可声明完成。"
		}
	}

	if sid := StudioIDFromContext(ctx); sid != "" && a.studioTodoRuntime != nil {
		prompt += "\n\n【工作室 TODO 清单（强制）】必须使用工具 " + StudioTodoToolName +
			"：开始执行前先用 operation=replace 写入至少 2 条可执行步骤（每条含唯一 id 与具体 title）；每完成一步用 operation=complete 勾选对应 id；operation=list 可查看当前清单。\n" +
			"禁止仅用口头描述代替 TODO 工具。委派子 Agent 前，你应已用 replace 维护好自己的协调步骤。"
		if a.config.Type == AgentTypeMain {
			prompt += "你应主动、定期使用工具 " + StudioTodoSnapshotToolName +
				" 拉取本工作室**全部成员**的 TODO JSON，并结合结果用简短中文向用户汇报整体进度；若系统发送「定时进度巡检」消息，须先调用该工具再回复用户。"
		}
	}

	// 添加代理能力说明
	if len(a.config.Skills) > 0 {
		prompt += fmt.Sprintf("\n\n你拥有以下技能: %v", a.config.Skills)
	}

	a.mu.RLock()
	hasCreateTeamTool := a.config.Type == AgentTypeMain && a.createAgentTool != nil
	childIDs := make([]string, 0, len(a.children))
	for id := range a.children {
		childIDs = append(childIDs, id)
	}
	a.mu.RUnlock()
	if hasCreateTeamTool {
		prompt += "\n\n【动态组建 Agent 团队】\n当用户需要为**新的项目或独立工作流**新增一套主从 Agent 时：先分析需求、拟定主 Agent 与若干子/worker 的 id（仅字母数字下划线连字符）、名称与分工，必要时与用户确认；然后调用工具 " + CreateAgentTeamToolName +
			" 一次性创建新主 Agent（独立树根）及其下属。新 Agent 将继承你当前的模型配置与已勾选的技能、MCP 列表。创建完成后告知用户刷新侧栏 Agent 树，并可为**新主 Agent** 新建工作室以便后续委派。勿用此工具删除或修改已有 Agent。"
	}
	sort.Strings(childIDs)
	if len(childIDs) > 0 && a.peerLookup != nil {
		var lines []string
		for _, cid := range childIDs {
			if sum, ok := a.peerLookup(cid); ok {
				role := strings.TrimSpace(sum.Role)
				if role != "" {
					lines = append(lines, fmt.Sprintf("- %s（id=%s，类型=%s）\n  角色：%s", sum.Name, sum.ID, sum.Type, role))
				} else {
					lines = append(lines, fmt.Sprintf("- %s（id=%s，类型=%s）", sum.Name, sum.ID, sum.Type))
				}
			} else {
				lines = append(lines, fmt.Sprintf("- id=%s（系统中已登记为子 Agent，详情暂不可读）", cid))
			}
		}
		prompt += "\n\n【下属子 Agent】\n" +
			"下列子 Agent 已在系统中注册；它们有各自模型、技能与对话记忆。当用户问题更适合由子 Agent 专项处理时，你**必须**使用工具 " + DelegateToSubAgentToolName +
			" 派发任务（参数 sub_agent_id、task），子 Agent 会独立推理并将结果返回给你，你再向用户整合回答。不要仅在口头上说「交给子 Agent」而不调用该工具。\n" +
			strings.Join(lines, "\n")
	}

	a.mu.RLock()
	agentType := a.config.Type
	mcpSel := append([]string(nil), a.config.MCPServers...)
	memSummary := strings.TrimSpace(a.memorySummary)
	a.mu.RUnlock()

	if memSummary != "" {
		prompt += "\n\n【历史对话摘要】\n" + memSummary
	}

	promptRoot := ""
	if a.projectCtx != nil {
		promptRoot = a.projectCtx.RootPath()
	}
	if ids := resolvedMCPServerIDs(promptRoot, agentType, mcpSel); len(ids) > 0 {
		doc, _ := loadMCPServersDoc(promptRoot)
		by := mcpDefinitionsByID(doc)
		var labels []string
		for _, id := range ids {
			if d, ok := by[id]; ok && strings.TrimSpace(d.Name) != "" {
				labels = append(labels, fmt.Sprintf("%s (%s)", d.Name, id))
			} else {
				labels = append(labels, id)
			}
		}
		prompt += fmt.Sprintf("\n\n当前会话已加载 MCP 服务: %s。请通过工具调用（function calling）使用各服务暴露的工具。", strings.Join(labels, "；"))
	}

	prompt += reactSystemPromptBlock
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
