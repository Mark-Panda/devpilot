package backend

import (
	"context"
	"devpilot/backend/internal/agent"
)

// 公开的 Agent 相关类型,供 Wails 绑定使用

type AgentConfig = agent.AgentConfig
type AgentInfo = agent.AgentInfo
type AgentTreeNode = agent.AgentTreeNode
type ProjectInfo = agent.ProjectInfo
type CodeMatch = agent.CodeMatch
type ModelConfig = agent.ModelConfig
type AgentType = agent.AgentType
type AgentStatus = agent.AgentStatus
type MessageType = agent.MessageType
type ChatHistoryEntry = agent.ChatHistoryEntry
type MCPServerPreset = agent.MCPServerPreset
type MCPServerDefinition = agent.MCPServerDefinition

// AgentServiceWrapper 包装 Agent 服务,提供公开的方法
type AgentServiceWrapper struct {
	svc *agent.Service
}

func NewAgentServiceWrapper(svc *agent.Service) *AgentServiceWrapper {
	if svc == nil {
		return nil
	}
	return &AgentServiceWrapper{svc: svc}
}

func (w *AgentServiceWrapper) CreateAgent(ctx context.Context, config AgentConfig) (AgentInfo, error) {
	if w == nil || w.svc == nil {
		return AgentInfo{}, nil
	}
	return w.svc.CreateAgent(ctx, config)
}

func (w *AgentServiceWrapper) GetAgent(ctx context.Context, agentID string) (AgentInfo, error) {
	if w == nil || w.svc == nil {
		return AgentInfo{}, nil
	}
	return w.svc.GetAgent(ctx, agentID)
}

func (w *AgentServiceWrapper) ListAgents(ctx context.Context) []AgentInfo {
	if w == nil || w.svc == nil {
		return []AgentInfo{}
	}
	return w.svc.ListAgents(ctx)
}

func (w *AgentServiceWrapper) DestroyAgent(ctx context.Context, agentID string) error {
	if w == nil || w.svc == nil {
		return nil
	}
	return w.svc.DestroyAgent(ctx, agentID)
}

func (w *AgentServiceWrapper) Chat(ctx context.Context, agentID string, message string) (string, error) {
	if w == nil || w.svc == nil {
		return "", nil
	}
	return w.svc.Chat(ctx, agentID, message)
}

func (w *AgentServiceWrapper) SendMessage(ctx context.Context, fromAgentID string, toAgentID string, content string, msgType MessageType) error {
	if w == nil || w.svc == nil {
		return nil
	}
	return w.svc.SendMessage(ctx, fromAgentID, toAgentID, content, msgType)
}

func (w *AgentServiceWrapper) GetAgentTree(ctx context.Context, rootID string) (*AgentTreeNode, error) {
	if w == nil || w.svc == nil {
		return nil, nil
	}
	return w.svc.GetAgentTree(ctx, rootID)
}

func (w *AgentServiceWrapper) GetAgentChatHistory(ctx context.Context, agentID string) ([]ChatHistoryEntry, error) {
	if w == nil || w.svc == nil {
		return []ChatHistoryEntry{}, nil
	}
	return w.svc.GetAgentChatHistory(ctx, agentID)
}

func (w *AgentServiceWrapper) ClearAgentChatHistory(ctx context.Context, agentID string) error {
	if w == nil || w.svc == nil {
		return nil
	}
	return w.svc.ClearAgentChatHistory(ctx, agentID)
}

func (w *AgentServiceWrapper) UpdateAgentModelConfig(ctx context.Context, agentID string, mc ModelConfig) (AgentInfo, error) {
	if w == nil || w.svc == nil {
		return AgentInfo{}, nil
	}
	return w.svc.UpdateAgentModelConfig(ctx, agentID, mc)
}

func (w *AgentServiceWrapper) UpdateAgent(ctx context.Context, cfg AgentConfig) (AgentInfo, error) {
	if w == nil || w.svc == nil {
		return AgentInfo{}, nil
	}
	return w.svc.UpdateAgent(ctx, cfg)
}

func (w *AgentServiceWrapper) ListMCPServerPresets() []MCPServerPreset {
	if w == nil || w.svc == nil {
		return []MCPServerPreset{}
	}
	p := w.svc.ListMCPServerPresets()
	if p == nil {
		return []MCPServerPreset{}
	}
	return p
}

func (w *AgentServiceWrapper) GetMCPServerDefinitions(ctx context.Context) ([]MCPServerDefinition, error) {
	if w == nil || w.svc == nil {
		return nil, nil
	}
	return w.svc.GetMCPServerDefinitions(ctx)
}

func (w *AgentServiceWrapper) SaveMCPServerDefinitions(ctx context.Context, servers []MCPServerDefinition) error {
	if w == nil || w.svc == nil {
		return nil
	}
	return w.svc.SaveMCPServerDefinitions(ctx, servers)
}

func (w *AgentServiceWrapper) GetProjectInfo(ctx context.Context) (ProjectInfo, error) {
	if w == nil || w.svc == nil {
		return ProjectInfo{}, nil
	}
	return w.svc.GetProjectInfo(ctx)
}

func (w *AgentServiceWrapper) SearchCode(ctx context.Context, query string, limit int) ([]CodeMatch, error) {
	if w == nil || w.svc == nil {
		return []CodeMatch{}, nil
	}
	return w.svc.SearchCode(ctx, query, limit)
}

func (w *AgentServiceWrapper) GetFileContent(ctx context.Context, path string) (string, error) {
	if w == nil || w.svc == nil {
		return "", nil
	}
	return w.svc.GetFileContent(ctx, path)
}

func (w *AgentServiceWrapper) UpdateFile(ctx context.Context, path string, content string) error {
	if w == nil || w.svc == nil {
		return nil
	}
	return w.svc.UpdateFile(ctx, path, content)
}

func (w *AgentServiceWrapper) ListFiles(ctx context.Context, pattern string) ([]string, error) {
	if w == nil || w.svc == nil {
		return []string{}, nil
	}
	return w.svc.ListFiles(ctx, pattern)
}

func (w *AgentServiceWrapper) GetProjectConfig(ctx context.Context, key string) (interface{}, error) {
	if w == nil || w.svc == nil {
		return nil, nil
	}
	return w.svc.GetProjectConfig(ctx, key)
}

func (w *AgentServiceWrapper) SetProjectConfig(ctx context.Context, key string, value interface{}) error {
	if w == nil || w.svc == nil {
		return nil
	}
	return w.svc.SetProjectConfig(ctx, key, value)
}
