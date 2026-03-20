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

	return &Service{
		orchestrator: orchestrator,
		projectCtx:   projectCtx,
	}, nil
}

// CreateAgent 创建代理
func (s *Service) CreateAgent(ctx context.Context, config AgentConfig) (AgentInfo, error) {
	agent, err := s.orchestrator.CreateAgent(ctx, config)
	if err != nil {
		return AgentInfo{}, err
	}
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
	return s.orchestrator.DestroyAgent(agentID)
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
	return s.orchestrator.Shutdown()
}
