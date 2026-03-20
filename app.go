package main

import (
	"context"

	"devpilot/backend"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx     context.Context
	runtime *backend.Runtime
}

func NewApp(runtime *backend.Runtime) *App {
	return &App{runtime: runtime}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	backend.InitRuleChainExecutor(a.runtime)
}

// OpenSkillZipDialog 打开系统文件选择对话框，让用户选择技能包 zip 文件。返回选中文件路径，取消时返回空字符串。
func (a *App) OpenSkillZipDialog() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择技能包 zip 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "ZIP 文件", Pattern: "*.zip"},
			{DisplayName: "所有文件", Pattern: "*"},
		},
	})
}

func (a *App) shutdown(ctx context.Context) {
	if a.runtime != nil {
		_ = a.runtime.Close()
	}
}

// ============ Agent Service Methods ============

// CreateAgent 创建新代理
func (a *App) CreateAgent(config backend.AgentConfig) (backend.AgentInfo, error) {
	if a.runtime.AgentWrapper() == nil {
		return backend.AgentInfo{}, nil
	}
	return a.runtime.AgentWrapper().CreateAgent(a.ctx, config)
}

// GetAgent 获取代理信息
func (a *App) GetAgent(agentID string) (backend.AgentInfo, error) {
	if a.runtime.AgentWrapper() == nil {
		return backend.AgentInfo{}, nil
	}
	return a.runtime.AgentWrapper().GetAgent(a.ctx, agentID)
}

// ListAgents 列出所有代理
func (a *App) ListAgents() []backend.AgentInfo {
	if a.runtime.AgentWrapper() == nil {
		return []backend.AgentInfo{}
	}
	return a.runtime.AgentWrapper().ListAgents(a.ctx)
}

// DestroyAgent 销毁代理
func (a *App) DestroyAgent(agentID string) error {
	if a.runtime.AgentWrapper() == nil {
		return nil
	}
	return a.runtime.AgentWrapper().DestroyAgent(a.ctx, agentID)
}

// Chat 与代理对话
func (a *App) Chat(agentID string, message string) (string, error) {
	if a.runtime.AgentWrapper() == nil {
		return "", nil
	}
	return a.runtime.AgentWrapper().Chat(a.ctx, agentID, message)
}

// SendMessage 发送消息
func (a *App) SendMessage(fromAgentID string, toAgentID string, content string, msgType string) error {
	if a.runtime.AgentWrapper() == nil {
		return nil
	}
	return a.runtime.AgentWrapper().SendMessage(a.ctx, fromAgentID, toAgentID, content, backend.MessageType(msgType))
}

// GetAgentTree 获取代理树
func (a *App) GetAgentTree(rootID string) (*backend.AgentTreeNode, error) {
	if a.runtime.AgentWrapper() == nil {
		return nil, nil
	}
	return a.runtime.AgentWrapper().GetAgentTree(a.ctx, rootID)
}

// GetAgentChatHistory 获取代理对话记忆（user/assistant）
func (a *App) GetAgentChatHistory(agentID string) ([]backend.ChatHistoryEntry, error) {
	if a.runtime.AgentWrapper() == nil {
		return []backend.ChatHistoryEntry{}, nil
	}
	return a.runtime.AgentWrapper().GetAgentChatHistory(a.ctx, agentID)
}

// ClearAgentChatHistory 清空代理对话记忆
func (a *App) ClearAgentChatHistory(agentID string) error {
	if a.runtime.AgentWrapper() == nil {
		return nil
	}
	return a.runtime.AgentWrapper().ClearAgentChatHistory(a.ctx, agentID)
}

// UpdateAgentModelConfig 热切换当前代理使用的模型（保留会话记忆）
func (a *App) UpdateAgentModelConfig(agentID string, mc backend.ModelConfig) (backend.AgentInfo, error) {
	if a.runtime.AgentWrapper() == nil {
		return backend.AgentInfo{}, nil
	}
	return a.runtime.AgentWrapper().UpdateAgentModelConfig(a.ctx, agentID, mc)
}

// UpdateAgent 更新 Agent 名称、角色、技能、MCP、系统提示与模型等
func (a *App) UpdateAgent(config backend.AgentConfig) (backend.AgentInfo, error) {
	if a.runtime.AgentWrapper() == nil {
		return backend.AgentInfo{}, nil
	}
	return a.runtime.AgentWrapper().UpdateAgent(a.ctx, config)
}

// ListMCPServerPresets 全局可选 MCP 项（供 Agent 勾选）
func (a *App) ListMCPServerPresets() []backend.MCPServerPreset {
	if a.runtime.AgentWrapper() == nil {
		return []backend.MCPServerPreset{}
	}
	p := a.runtime.AgentWrapper().ListMCPServerPresets()
	if p == nil {
		return []backend.MCPServerPreset{}
	}
	return p
}

// GetMCPServerDefinitions 获取全局 MCP 配置（设置页，~/.devpilot/mcp.json）
func (a *App) GetMCPServerDefinitions() ([]backend.MCPServerDefinition, error) {
	if a.runtime.AgentWrapper() == nil {
		return nil, nil
	}
	return a.runtime.AgentWrapper().GetMCPServerDefinitions(a.ctx)
}

// SaveMCPServerDefinitions 保存 MCP 配置至 ~/.devpilot/mcp.json
func (a *App) SaveMCPServerDefinitions(servers []backend.MCPServerDefinition) error {
	if a.runtime.AgentWrapper() == nil {
		return nil
	}
	return a.runtime.AgentWrapper().SaveMCPServerDefinitions(a.ctx, servers)
}

// GetProjectInfo 获取项目信息
func (a *App) GetProjectInfo() (backend.ProjectInfo, error) {
	if a.runtime.AgentWrapper() == nil {
		return backend.ProjectInfo{}, nil
	}
	return a.runtime.AgentWrapper().GetProjectInfo(a.ctx)
}

// SearchCode 搜索代码
func (a *App) SearchCode(query string, limit int) ([]backend.CodeMatch, error) {
	if a.runtime.AgentWrapper() == nil {
		return []backend.CodeMatch{}, nil
	}
	return a.runtime.AgentWrapper().SearchCode(a.ctx, query, limit)
}

// GetFileContent 获取文件内容
func (a *App) GetFileContent(path string) (string, error) {
	if a.runtime.AgentWrapper() == nil {
		return "", nil
	}
	return a.runtime.AgentWrapper().GetFileContent(a.ctx, path)
}

// UpdateFile 更新文件
func (a *App) UpdateFile(path string, content string) error {
	if a.runtime.AgentWrapper() == nil {
		return nil
	}
	return a.runtime.AgentWrapper().UpdateFile(a.ctx, path, content)
}

// ListFiles 列出文件
func (a *App) ListFiles(pattern string) ([]string, error) {
	if a.runtime.AgentWrapper() == nil {
		return []string{}, nil
	}
	return a.runtime.AgentWrapper().ListFiles(a.ctx, pattern)
}

// GetProjectConfig 获取项目配置
func (a *App) GetProjectConfig(key string) (interface{}, error) {
	if a.runtime.AgentWrapper() == nil {
		return nil, nil
	}
	return a.runtime.AgentWrapper().GetProjectConfig(a.ctx, key)
}

// SetProjectConfig 设置项目配置
func (a *App) SetProjectConfig(key string, value interface{}) error {
	if a.runtime.AgentWrapper() == nil {
		return nil
	}
	return a.runtime.AgentWrapper().SetProjectConfig(a.ctx, key, value)
}
