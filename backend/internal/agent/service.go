package agent

import (
	"context"
	"fmt"

	"github.com/rs/zerolog/log"
)

// Service 代理服务
type Service struct {
	orchestrator *Orchestrator
	projectCtx   ProjectContext
}

// NewService 创建代理服务
func NewService(projectPath string) (*Service, error) {
	// 创建项目上下文
	projectCtx, err := NewProjectContext(projectPath)
	if err != nil {
		return nil, fmt.Errorf("create project context: %w", err)
	}

	// 创建编排器
	orchestrator := NewOrchestrator(projectCtx)

	s := &Service{
		orchestrator: orchestrator,
		projectCtx:   projectCtx,
	}

	configs, err := loadAgentRegistry(projectCtx.RootPath())
	if err != nil {
		log.Warn().Err(err).Msg("load agents registry failed, starting without restored agents")
	} else {
		ctx := context.Background()
		for _, cfg := range topoSortAgentConfigs(configs) {
			if _, err := orchestrator.CreateAgent(ctx, cfg); err != nil {
				log.Warn().Err(err).Str("agent_id", cfg.ID).Msg("restore agent from registry failed")
			}
		}
		if len(configs) > 0 {
			log.Info().Int("count", len(s.orchestrator.ListAgents())).Msg("agents restored from registry")
		}
	}

	return s, nil
}

// CreateAgent 创建代理
func (s *Service) CreateAgent(ctx context.Context, config AgentConfig) (AgentInfo, error) {
	agent, err := s.orchestrator.CreateAgent(ctx, config)
	if err != nil {
		return AgentInfo{}, err
	}
	s.persistAgentsRegistry()
	return agent.Info(), nil
}

// GetAgent 获取代理信息
func (s *Service) GetAgent(ctx context.Context, agentID string) (AgentInfo, error) {
	agent, err := s.orchestrator.GetAgent(agentID)
	if err != nil {
		return AgentInfo{}, err
	}
	return agent.Info(), nil
}

// ListAgents 列出所有代理
func (s *Service) ListAgents(ctx context.Context) []AgentInfo {
	return s.orchestrator.ListAgents()
}

// DestroyAgent 销毁代理
func (s *Service) DestroyAgent(ctx context.Context, agentID string) error {
	if err := s.orchestrator.DestroyAgent(agentID); err != nil {
		return err
	}
	s.persistAgentsRegistry()
	return nil
}

// Chat 与代理对话
func (s *Service) Chat(ctx context.Context, agentID string, userMessage string) (string, error) {
	return s.orchestrator.Chat(ctx, agentID, userMessage)
}

// SendMessage 发送消息
func (s *Service) SendMessage(ctx context.Context, fromAgentID string, toAgentID string, content string, msgType MessageType) error {
	msg := Message{
		ToAgent: toAgentID,
		Type:    msgType,
		Content: content,
	}
	return s.orchestrator.SendMessage(ctx, fromAgentID, msg)
}

// GetAgentTree 获取代理树
func (s *Service) GetAgentTree(ctx context.Context, rootID string) (*AgentTreeNode, error) {
	return s.orchestrator.GetAgentTree(rootID)
}

// GetAgentChatHistory 获取代理对话记忆
func (s *Service) GetAgentChatHistory(ctx context.Context, agentID string) ([]ChatHistoryEntry, error) {
	return s.orchestrator.GetAgentChatHistory(agentID)
}

// ClearAgentChatHistory 清空代理对话记忆
func (s *Service) ClearAgentChatHistory(ctx context.Context, agentID string) error {
	return s.orchestrator.ClearAgentChatHistory(agentID)
}

// UpdateAgentModelConfig 热切换模型
func (s *Service) UpdateAgentModelConfig(ctx context.Context, agentID string, mc ModelConfig) (AgentInfo, error) {
	if err := s.orchestrator.UpdateAgentModelConfig(ctx, agentID, mc); err != nil {
		return AgentInfo{}, err
	}
	ag, err := s.orchestrator.GetAgent(agentID)
	if err != nil {
		return AgentInfo{}, err
	}
	s.persistAgentsRegistry()
	return ag.Info(), nil
}

// UpdateAgent 更新名称、角色、技能、MCP、系统提示与模型等
func (s *Service) UpdateAgent(ctx context.Context, cfg AgentConfig) (AgentInfo, error) {
	if err := s.orchestrator.UpdateAgent(ctx, cfg); err != nil {
		return AgentInfo{}, err
	}
	ag, err := s.orchestrator.GetAgent(cfg.ID)
	if err != nil {
		return AgentInfo{}, err
	}
	s.persistAgentsRegistry()
	return ag.Info(), nil
}

// ListMCPServerPresets 全局 MCP 可选项（~/.devpilot/mcp.json，缺失时从旧路径迁移）
func (s *Service) ListMCPServerPresets() []MCPServerPreset {
	return ListMCPServerPresets(s.projectCtx.RootPath())
}

// GetMCPServerDefinitions 返回全局 MCP 配置列表（供设置页编辑）
func (s *Service) GetMCPServerDefinitions(ctx context.Context) ([]MCPServerDefinition, error) {
	_ = ctx
	doc, err := loadMCPServersDoc(s.projectCtx.RootPath())
	if err != nil {
		return nil, err
	}
	return doc.Servers, nil
}

// SaveMCPServerDefinitions 保存到 ~/.devpilot/mcp.json
func (s *Service) SaveMCPServerDefinitions(ctx context.Context, servers []MCPServerDefinition) error {
	_ = ctx
	if err := validateMCPServerDefinitions(servers); err != nil {
		return err
	}
	return saveMCPServersDoc(MCPServersDocument{Version: 1, Servers: servers})
}

// persistAgentsRegistry 将内存中全部 Agent 的配置写回 ~/.devpilot/agents.json。
func (s *Service) persistAgentsRegistry() {
	infos := s.orchestrator.ListAgents()
	configs := make([]AgentConfig, 0, len(infos))
	for _, info := range infos {
		configs = append(configs, info.Config)
	}
	if len(configs) == 0 {
		deleteAgentRegistry()
		return
	}
	if err := saveAgentRegistry(configs); err != nil {
		log.Warn().Err(err).Msg("persist agents registry failed")
	}
}

// GetProjectInfo 获取项目信息
func (s *Service) GetProjectInfo(ctx context.Context) (ProjectInfo, error) {
	return s.projectCtx.GetProjectInfo(ctx)
}

// SearchCode 搜索代码
func (s *Service) SearchCode(ctx context.Context, query string, limit int) ([]CodeMatch, error) {
	return s.projectCtx.SearchCode(ctx, query, limit)
}

// GetFileContent 获取文件内容
func (s *Service) GetFileContent(ctx context.Context, path string) (string, error) {
	return s.projectCtx.GetFileContent(ctx, path)
}

// UpdateFile 更新文件
func (s *Service) UpdateFile(ctx context.Context, path string, content string) error {
	return s.projectCtx.UpdateFile(ctx, path, content)
}

// ListFiles 列出文件
func (s *Service) ListFiles(ctx context.Context, pattern string) ([]string, error) {
	return s.projectCtx.ListFiles(ctx, pattern)
}

// GetProjectConfig 获取项目配置
func (s *Service) GetProjectConfig(ctx context.Context, key string) (interface{}, error) {
	return s.projectCtx.GetConfig(ctx, key)
}

// SetProjectConfig 设置项目配置
func (s *Service) SetProjectConfig(ctx context.Context, key string, value interface{}) error {
	return s.projectCtx.SetConfig(ctx, key, value)
}

// Shutdown 关闭服务
func (s *Service) Shutdown() error {
	log.Info().Msg("shutting down agent service")
	s.persistAgentsRegistry()
	return s.orchestrator.Shutdown()
}
