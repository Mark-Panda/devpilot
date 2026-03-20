package agent

import (
	"context"
	"fmt"
	"sync"

	"github.com/rs/zerolog/log"
)

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

// ListAgents 列出所有代理
func (o *Orchestrator) ListAgents() []AgentInfo {
	o.mu.RLock()
	defer o.mu.RUnlock()

	infos := make([]AgentInfo, 0, len(o.agents))
	for _, agent := range o.agents {
		infos = append(infos, agent.Info())
	}
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

	// 停止代理
	if err := agent.Stop(); err != nil {
		log.Warn().Err(err).Str("agent_id", agentID).Msg("failed to stop agent")
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
