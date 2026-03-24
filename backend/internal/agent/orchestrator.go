package agent

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
)

func agentListSortRank(t AgentType) int {
	switch t {
	case AgentTypeMain:
		return 0
	case AgentTypeSub:
		return 1
	case AgentTypeWorker:
		return 2
	default:
		return 3
	}
}

// Orchestrator 代理编排器
type Orchestrator struct {
	mu sync.RWMutex

	agents     map[string]Agent
	messageBus MessageBus
	projectCtx ProjectContext

	studioMu       sync.RWMutex
	studioProgress func(StudioProgressEvent) // 工作室委派/子 Agent 进度，可为 nil

	createAgentToolMu sync.RWMutex
	createAgentTool   CreateAgentToolFunc // 主 Agent 工具创建新 Agent，可为 nil

	studioSubFinishedMu sync.RWMutex
	studioSubFinished   StudioSubFinishedFunc // 工作室子任务完成后续协调，可为 nil

	studioTodoMu      sync.RWMutex
	studioTodoRuntime StudioTodoRuntime // 工作室 TODO，可为 nil

	studioAgentWsMu      sync.RWMutex
	studioAgentWorkspace StudioAgentWorkspaceRuntime // 工作室成员文件工具根，可为 nil
}

// NewOrchestrator 创建编排器
func NewOrchestrator(projectCtx ProjectContext) *Orchestrator {
	return &Orchestrator{
		agents:     make(map[string]Agent),
		messageBus: NewMessageBus(100),
		projectCtx: projectCtx,
	}
}

// SetStudioProgressHook 注册工作室进度回调（须在恢复 Agent 之前调用）
func (o *Orchestrator) SetStudioProgressHook(h func(StudioProgressEvent)) {
	o.studioMu.Lock()
	defer o.studioMu.Unlock()
	o.studioProgress = h
}

// SetCreateAgentToolFunc 注册主 Agent 创建团队工具的后端实现（须在从注册表恢复 Agent 之前调用）
func (o *Orchestrator) SetCreateAgentToolFunc(fn CreateAgentToolFunc) {
	o.createAgentToolMu.Lock()
	defer o.createAgentToolMu.Unlock()
	o.createAgentTool = fn
}

func (o *Orchestrator) createAgentToolFn() CreateAgentToolFunc {
	o.createAgentToolMu.RLock()
	defer o.createAgentToolMu.RUnlock()
	return o.createAgentTool
}

// SetStudioSubFinishedHook 注册工作室子任务完成回调（须在从注册表恢复 Agent 之前调用）
func (o *Orchestrator) SetStudioSubFinishedHook(h StudioSubFinishedFunc) {
	o.studioSubFinishedMu.Lock()
	defer o.studioSubFinishedMu.Unlock()
	o.studioSubFinished = h
}

func (o *Orchestrator) studioSubFinishedFn() StudioSubFinishedFunc {
	o.studioSubFinishedMu.RLock()
	defer o.studioSubFinishedMu.RUnlock()
	return o.studioSubFinished
}

// SetStudioTodoRuntime 注册工作室 TODO 实现（须在从注册表恢复 Agent 之前调用）
func (o *Orchestrator) SetStudioTodoRuntime(rt StudioTodoRuntime) {
	o.studioTodoMu.Lock()
	defer o.studioTodoMu.Unlock()
	o.studioTodoRuntime = rt
}

func (o *Orchestrator) studioTodoRuntimeFn() StudioTodoRuntime {
	o.studioTodoMu.RLock()
	defer o.studioTodoMu.RUnlock()
	return o.studioTodoRuntime
}

// SetStudioAgentWorkspaceRuntime 注册工作室成员工作区查询（须在从注册表恢复 Agent 之前调用）
func (o *Orchestrator) SetStudioAgentWorkspaceRuntime(rt StudioAgentWorkspaceRuntime) {
	o.studioAgentWsMu.Lock()
	defer o.studioAgentWsMu.Unlock()
	o.studioAgentWorkspace = rt
}

func (o *Orchestrator) studioAgentWorkspaceFn() StudioAgentWorkspaceRuntime {
	o.studioAgentWsMu.RLock()
	defer o.studioAgentWsMu.RUnlock()
	return o.studioAgentWorkspace
}

func (o *Orchestrator) studioProgressHook() func(StudioProgressEvent) {
	o.studioMu.RLock()
	defer o.studioMu.RUnlock()
	return o.studioProgress
}

// peerAgentLookup 供各 Agent 构建系统提示时解析其他 Agent（须并发安全）
func (o *Orchestrator) peerAgentLookup() PeerAgentLookup {
	return func(agentID string) (AgentPeerSummary, bool) {
		o.mu.RLock()
		defer o.mu.RUnlock()
		ag, ok := o.agents[agentID]
		if !ok {
			return AgentPeerSummary{}, false
		}
		c := ag.Config()
		return AgentPeerSummary{
			ID:   c.ID,
			Name: c.Name,
			Role: c.Role,
			Type: c.Type,
		}, true
	}
}

// CreateAgent 创建代理
func (o *Orchestrator) CreateAgent(ctx context.Context, config AgentConfig) (Agent, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	// 检查 ID 是否重复
	if _, exists := o.agents[config.ID]; exists {
		return nil, fmt.Errorf("agent %s already exists", config.ID)
	}

	ws, err := NormalizeAgentWorkspaceRoot(config.WorkspaceRoot)
	if err != nil {
		return nil, err
	}
	config.WorkspaceRoot = ws

	lookup := o.peerAgentLookup()
	hook := o.studioProgressHook()
	agent, err := NewAgent(ctx, config, o.messageBus, o.projectCtx, lookup, hook, o.createAgentToolFn(), o.studioSubFinishedFn(), o.studioTodoRuntimeFn(), o.studioAgentWorkspaceFn())
	if err != nil {
		return nil, fmt.Errorf("create agent: %w", err)
	}

	o.agents[config.ID] = agent

	// 如果有父代理,建立父子关系
	if config.ParentID != "" {
		if parent, exists := o.agents[config.ParentID]; exists {
			if impl, ok := parent.(*agentImpl); ok {
				impl.AddChild(config.ID)
			}
		}
	}

	log.Info().
		Str("agent_id", config.ID).
		Str("parent_id", config.ParentID).
		Msg("agent created in orchestrator")

	return agent, nil
}

// GetAgent 获取代理
func (o *Orchestrator) GetAgent(agentID string) (Agent, error) {
	o.mu.RLock()
	defer o.mu.RUnlock()

	agent, exists := o.agents[agentID]
	if !exists {
		return nil, fmt.Errorf("agent %s not found", agentID)
	}
	return agent, nil
}

// ListAgents 列出所有代理（顺序稳定：main → sub → worker，同类型按创建时间、id）
func (o *Orchestrator) ListAgents() []AgentInfo {
	o.mu.RLock()
	defer o.mu.RUnlock()

	infos := make([]AgentInfo, 0, len(o.agents))
	for _, agent := range o.agents {
		infos = append(infos, agent.Info())
	}
	sort.Slice(infos, func(i, j int) bool {
		ri, rj := agentListSortRank(infos[i].Config.Type), agentListSortRank(infos[j].Config.Type)
		if ri != rj {
			return ri < rj
		}
		if !infos[i].CreatedAt.Equal(infos[j].CreatedAt) {
			return infos[i].CreatedAt.Before(infos[j].CreatedAt)
		}
		return infos[i].Config.ID < infos[j].Config.ID
	})
	return infos
}

// DestroyAgent 销毁代理及其子树。允许多个 main 时删除其中任意一个，但须至少保留一个 main。
func (o *Orchestrator) DestroyAgent(agentID string) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.destroyAgentUnlocked(agentID)
}

// destroyAgentUnlocked 在已持有 o.mu 的前提下销毁代理（可递归子节点，避免 DestroyAgent 嵌套加锁死锁）
func (o *Orchestrator) destroyAgentUnlocked(agentID string) error {
	agent, exists := o.agents[agentID]
	if !exists {
		return fmt.Errorf("agent %s not found", agentID)
	}

	if agent.Config().Type == AgentTypeMain {
		mainCount := 0
		for _, ag := range o.agents {
			if ag.Config().Type == AgentTypeMain {
				mainCount++
			}
		}
		if mainCount <= 1 {
			return fmt.Errorf("须至少保留一个主 Agent（main）")
		}
	}

	if err := agent.Stop(); err != nil {
		log.Warn().Err(err).Str("agent_id", agentID).Msg("failed to stop agent")
	}

	if impl, ok := agent.(*agentImpl); ok {
		impl.wipeMemoryState()
	}
	DeleteAllSessionMemoryFilesForAgent(agentID)

	config := agent.Config()
	if config.ParentID != "" {
		if parent, ok := o.agents[config.ParentID]; ok {
			if impl, ok := parent.(*agentImpl); ok {
				impl.RemoveChild(agentID)
			}
		}
	}

	info := agent.Info()
	for _, childID := range info.Children {
		if err := o.destroyAgentUnlocked(childID); err != nil {
			log.Warn().Err(err).Str("child_id", childID).Msg("failed to destroy child agent")
		}
	}

	delete(o.agents, agentID)

	log.Info().Str("agent_id", agentID).Msg("agent destroyed")
	return nil
}

// SendMessage 发送消息
func (o *Orchestrator) SendMessage(ctx context.Context, fromAgentID string, msg Message) error {
	agent, err := o.GetAgent(fromAgentID)
	if err != nil {
		return err
	}
	return agent.SendMessage(ctx, msg)
}

// Chat 与指定代理对话
func (o *Orchestrator) Chat(ctx context.Context, agentID string, userMessage string) (string, error) {
	agent, err := o.GetAgent(agentID)
	if err != nil {
		return "", err
	}
	return agent.Process(ctx, userMessage)
}

// GetAgentChatHistory 从磁盘读取会话；studioID 为空为聊天页全局会话，非空为对应工作室的独立会话
func (o *Orchestrator) GetAgentChatHistory(ctx context.Context, agentID, studioID string) ([]ChatHistoryEntry, error) {
	_ = ctx
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return nil, fmt.Errorf("agent id empty")
	}
	studioID = strings.TrimSpace(studioID)
	path := agentMemoryFilePathForSession(agentID, studioID)
	mem, err := loadChatHistoryFromFile(path)
	if err != nil {
		return nil, err
	}
	return memoryToEntries(mem), nil
}

// ClearAgentChatHistory 清空指定会话的磁盘与（若与当前内存会话一致）内存
func (o *Orchestrator) ClearAgentChatHistory(agentID, studioID string) error {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return fmt.Errorf("agent id empty")
	}
	studioID = strings.TrimSpace(studioID)
	path := agentMemoryFilePathForSession(agentID, studioID)
	deleteAgentMemoryFile(path)
	deleteMemorySummaryFile(memorySummaryFilePath(path))

	agent, err := o.GetAgent(agentID)
	if err != nil {
		return nil
	}
	impl, ok := agent.(*agentImpl)
	if !ok {
		return fmt.Errorf("unexpected agent implementation")
	}
	impl.clearMemoryIfSessionMatches(studioID)
	return nil
}

// UpdateAgentModelConfig 更新代理的模型配置并重建 LLM 客户端
func (o *Orchestrator) UpdateAgentModelConfig(ctx context.Context, agentID string, mc ModelConfig) error {
	agent, err := o.GetAgent(agentID)
	if err != nil {
		return err
	}
	impl, ok := agent.(*agentImpl)
	if !ok {
		return fmt.Errorf("unexpected agent implementation")
	}
	return impl.SetModelConfig(ctx, mc)
}

// UpdateAgent 更新代理可编辑字段（id 须与内存中一致）
func (o *Orchestrator) UpdateAgent(ctx context.Context, cfg AgentConfig) error {
	agent, err := o.GetAgent(cfg.ID)
	if err != nil {
		return err
	}
	impl, ok := agent.(*agentImpl)
	if !ok {
		return fmt.Errorf("unexpected agent implementation")
	}
	// 禁止通过此接口改树结构
	existing := impl.Config()
	cfg.Type = existing.Type
	cfg.ParentID = existing.ParentID
	// metadata：请求未带该字段时为 nil，保留原值；显式传 {} 表示清空
	if cfg.Metadata == nil {
		cfg.Metadata = existing.Metadata
	} else if len(cfg.Metadata) == 0 {
		cfg.Metadata = nil
	}
	ws, err := NormalizeAgentWorkspaceRoot(cfg.WorkspaceRoot)
	if err != nil {
		return err
	}
	cfg.WorkspaceRoot = ws
	return impl.UpdateEditableConfig(ctx, cfg)
}

// GetAgentTree 获取代理树结构
func (o *Orchestrator) GetAgentTree(rootID string) (*AgentTreeNode, error) {
	o.mu.RLock()
	defer o.mu.RUnlock()

	return o.buildTree(rootID)
}

// AgentTreeNode 代理树节点
type AgentTreeNode struct {
	Agent    AgentInfo        `json:"agent"`
	Children []*AgentTreeNode `json:"children,omitempty"`
}

func (o *Orchestrator) buildTree(agentID string) (*AgentTreeNode, error) {
	agent, exists := o.agents[agentID]
	if !exists {
		return nil, fmt.Errorf("agent %s not found", agentID)
	}

	info := agent.Info()
	node := &AgentTreeNode{
		Agent:    info,
		Children: make([]*AgentTreeNode, 0, len(info.Children)),
	}

	for _, childID := range info.Children {
		childNode, err := o.buildTree(childID)
		if err != nil {
			log.Warn().Err(err).Str("child_id", childID).Msg("failed to build child tree")
			continue
		}
		node.Children = append(node.Children, childNode)
	}

	return node, nil
}

// Shutdown 关闭编排器
func (o *Orchestrator) Shutdown() error {
	o.mu.Lock()
	defer o.mu.Unlock()

	for id, agent := range o.agents {
		if err := agent.Stop(); err != nil {
			log.Warn().Err(err).Str("agent_id", id).Msg("failed to stop agent during shutdown")
		}
	}

	o.agents = make(map[string]Agent)
	log.Info().Msg("orchestrator shutdown complete")
	return nil
}
