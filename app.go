package main

import (
	"context"
	"fmt"
	"strings"

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
	backend.BindStudioProgressEvents(ctx, a.runtime.AgentService())
	backend.BindStudioAssistantEvents(ctx, a.runtime.AgentService())
	backend.BindCursorACPAfterRoundDialog(ctx)
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

// OpenAgentWorkspaceDialog 选择 Agent 工作区目录（内置读/写文件工具相对此根路径）。
func (a *App) OpenAgentWorkspaceDialog() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 Agent 工作区目录",
	})
}

// OpenWorkspaceProjectDirDialog 选择要添加到 Workspace 的项目根目录。
func (a *App) OpenWorkspaceProjectDirDialog() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择项目根目录",
	})
}

// SetAgentWorkspaceRoot 将 Agent 项目根切换为 path；与 RuleGo 画布上的 workDir 无关。
func (a *App) SetAgentWorkspaceRoot(path string) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("路径不能为空")
	}
	if a.runtime.AgentWrapper() == nil {
		return fmt.Errorf("agent 服务未就绪")
	}
	return a.runtime.AgentWrapper().RelocateProjectRoot(a.ctx, path)
}

func (a *App) shutdown(ctx context.Context) {
	backend.ClearCursorACPAfterRoundDialogs()
	if a.runtime != nil {
		_ = a.runtime.Close()
	}
}

// ResolveCursorACPAfterRound 规则链 cursor/acp_agent 人机续跑弹窗：继续下一轮、主动结束（user_end）或完成标记结束（end_marker）。
func (a *App) ResolveCursorACPAfterRound(requestID string, nextPrompt string, stop bool, endMarker bool) {
	backend.ResolveCursorACPAfterRound(requestID, nextPrompt, stop, endMarker)
}

// ResolveCursorACPAskQuestion 规则链中 cursor/ask_question 弹窗：提交所选 optionId；空字符串表示使用节点 autoAskQuestionOptionIndex。
func (a *App) ResolveCursorACPAskQuestion(requestID string, optionID string) {
	backend.ResolveCursorACPAskQuestion(requestID, optionID)
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

// GetAgentChatHistory 获取代理对话记忆（user/assistant）；studioID 为空为聊天页会话，非空为工作室独立会话
func (a *App) GetAgentChatHistory(agentID string, studioID string) ([]backend.ChatHistoryEntry, error) {
	if a.runtime.AgentWrapper() == nil {
		return []backend.ChatHistoryEntry{}, nil
	}
	return a.runtime.AgentWrapper().GetAgentChatHistory(a.ctx, agentID, studioID)
}

// ClearAgentChatHistory 清空指定会话的对话记忆（studioID 空 = 聊天页）
func (a *App) ClearAgentChatHistory(agentID string, studioID string) error {
	if a.runtime.AgentWrapper() == nil {
		return nil
	}
	return a.runtime.AgentWrapper().ClearAgentChatHistory(a.ctx, agentID, studioID)
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

// ============ 工作室 ============

func (a *App) ListStudios() []backend.Studio {
	if a.runtime.AgentWrapper() == nil {
		return []backend.Studio{}
	}
	return a.runtime.AgentWrapper().ListStudios(a.ctx)
}

func (a *App) CreateStudio(name string, mainAgentID string) (backend.Studio, error) {
	if a.runtime.AgentWrapper() == nil {
		return backend.Studio{}, fmt.Errorf("agent 服务未就绪")
	}
	return a.runtime.AgentWrapper().CreateStudio(a.ctx, name, mainAgentID)
}

func (a *App) DeleteStudio(studioID string) error {
	if a.runtime.AgentWrapper() == nil {
		return fmt.Errorf("agent 服务未就绪")
	}
	return a.runtime.AgentWrapper().DeleteStudio(a.ctx, studioID)
}

func (a *App) GetStudioDetail(studioID string) (backend.StudioDetail, error) {
	if a.runtime.AgentWrapper() == nil {
		return backend.StudioDetail{}, fmt.Errorf("agent 服务未就绪")
	}
	return a.runtime.AgentWrapper().GetStudioDetail(a.ctx, studioID)
}

// SetStudioAgentWorkspace 设置/清除工作室内某成员的文件工具根目录（path 空为清除）
func (a *App) SetStudioAgentWorkspace(studioID, agentID, path string) error {
	if a.runtime.AgentWrapper() == nil {
		return fmt.Errorf("agent 服务未就绪")
	}
	return a.runtime.AgentWrapper().SetStudioAgentWorkspace(a.ctx, studioID, agentID, path)
}

func (a *App) GetStudioProgress(studioID string) []backend.StudioProgressEvent {
	if a.runtime.AgentWrapper() == nil {
		return []backend.StudioProgressEvent{}
	}
	return a.runtime.AgentWrapper().GetStudioProgress(a.ctx, studioID)
}

func (a *App) ChatInStudio(studioID string, agentID string, message string) (string, error) {
	if a.runtime.AgentWrapper() == nil {
		return "", fmt.Errorf("agent 服务未就绪")
	}
	return a.runtime.AgentWrapper().ChatInStudio(a.ctx, studioID, agentID, message)
}

// GetStudioTodoBoard 工作室内各 Agent 的 TODO 看板（持久化于 ~/.devpilot/studio-todos.json）
func (a *App) GetStudioTodoBoard(studioID string) ([]backend.StudioTodoBoardRow, error) {
	if a.runtime.AgentWrapper() == nil {
		return []backend.StudioTodoBoardRow{}, fmt.Errorf("agent 服务未就绪")
	}
	return a.runtime.AgentWrapper().GetStudioTodoBoard(a.ctx, studioID)
}

// StudioMaybeProgressBrief 定时触发主 Agent 拉取 TODO 总览并向用户简报（受后端冷却限制）
func (a *App) StudioMaybeProgressBrief(studioID string) error {
	if a.runtime.AgentWrapper() == nil {
		return fmt.Errorf("agent 服务未就绪")
	}
	return a.runtime.AgentWrapper().StudioMaybeProgressBrief(a.ctx, studioID)
}
