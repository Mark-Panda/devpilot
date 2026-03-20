package agent

import (
	"context"
	"fmt"
	"sort"
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
}

// NewOrchestrator 创建编排器
func NewOrchestrator(projectCtx ProjectContext) *Orchestrator {
	return &Orchestrator{
		agents:     make(map[string]Agent),
		messageBus: NewMessageBus(100),
		projectCtx: projectCtx,
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

	// 创建代理
	agent, err := NewAgent(ctx, config, o.messageBus, o.projectCtx)
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

// DestroyAgent 销毁代理
func (o *Orchestrator) DestroyAgent(agentID string) error {
	o.mu.Lock()
	defer o.mu.Unlock()

	agent, exists := o.agents[agentID]
	if !exists {
		return fmt.Errorf("agent %s not found", agentID)
	}

	if agent.Config().Type == AgentTypeMain {
		return fmt.Errorf("主 Agent 不可删除")
	}

	// 停止代理
	if err := agent.Stop(); err != nil {
		log.Warn().Err(err).Str("agent_id", agentID).Msg("failed to stop agent")
	}

	if impl, ok := agent.(*agentImpl); ok {
		_ = impl.ClearChatHistory()
	}

	// 从父代理移除
	config := agent.Config()
	if config.ParentID != "" {
		if parent, exists := o.agents[config.ParentID]; exists {
			if impl, ok := parent.(*agentImpl); ok {
				impl.RemoveChild(agentID)
			}
		}
	}

	// 销毁所有子代理
	info := agent.Info()
	for _, childID := range info.Children {
		if err := o.DestroyAgent(childID); err != nil {
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

// GetAgentChatHistory 返回代理的 user/assistant 对话记忆（与模型上下文一致）
func (o *Orchestrator) GetAgentChatHistory(agentID string) ([]ChatHistoryEntry, error) {
	agent, err := o.GetAgent(agentID)
	if err != nil {
		return nil, err
	}
	impl, ok := agent.(*agentImpl)
	if !ok {
		return nil, fmt.Errorf("unexpected agent implementation")
	}
	return impl.ChatHistory(), nil
}

// ClearAgentChatHistory 清空代理对话记忆并删除本地持久化文件
func (o *Orchestrator) ClearAgentChatHistory(agentID string) error {
	agent, err := o.GetAgent(agentID)
	if err != nil {
		return err
	}
	impl, ok := agent.(*agentImpl)
	if !ok {
		return fmt.Errorf("unexpected agent implementation")
	}
	return impl.ClearChatHistory()
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
