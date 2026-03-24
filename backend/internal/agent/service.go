package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
)

// Service 代理服务
type Service struct {
	orchestrator *Orchestrator
	projectCtx   ProjectContext

	studioStore   *StudioStore
	studioEmitMu  sync.RWMutex
	studioEmitter func(StudioProgressEvent)

	studioTodoStore *StudioTodoStore

	studioChatEmitMu    sync.RWMutex
	studioChatEmitter   func(StudioAssistantPush) // 工作室主 Agent 自动续跑回复，供 Wails 推送到前端
	studioAutoMainSteps sync.Map                 // studioID -> 自上次用户发消息以来的自动续跑次数

	persistMu sync.Mutex // 串行化 agents.json 写入，避免并发丢更新
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

	var studioStore *StudioStore
	if p := globalStudiosPath(); p != "" {
		st, err := NewStudioStore(p)
		if err != nil {
			log.Warn().Err(err).Msg("studio store init failed, studio features disabled")
		} else {
			studioStore = st
		}
	}

	s := &Service{
		orchestrator:  orchestrator,
		projectCtx:    projectCtx,
		studioStore:   studioStore,
		studioEmitter: nil,
	}

	orchestrator.SetCreateAgentToolFunc(s.createAgentViaTool)
	orchestrator.SetStudioSubFinishedHook(func(parentID, studioID, childID, childName, taskPreview, result string) {
		go s.studioMainAfterChildFinished(parentID, studioID, childID, childName, taskPreview, result)
	})

	if p := globalStudioTodosPath(); p != "" {
		s.studioTodoStore = newStudioTodoStore(p)
		orchestrator.SetStudioTodoRuntime(s)
	}

	if studioStore != nil {
		orchestrator.SetStudioProgressHook(func(ev StudioProgressEvent) {
			s.onStudioProgress(ev)
		})
		orchestrator.SetStudioAgentWorkspaceRuntime(s)
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

// createAgentViaTool 供主 Agent 工具 devpilot_create_agent_team 调用（校验调用方后写入 agents.json）
func (s *Service) createAgentViaTool(ctx context.Context, callerID string, cfg AgentConfig) (AgentInfo, error) {
	ag, err := s.orchestrator.GetAgent(callerID)
	if err != nil {
		return AgentInfo{}, fmt.Errorf("caller: %w", err)
	}
	if ag.Config().Type != AgentTypeMain {
		return AgentInfo{}, fmt.Errorf("仅主 Agent 可通过工具创建 Agent")
	}
	if cfg.Type == AgentTypeMain && strings.TrimSpace(cfg.ParentID) != "" {
		return AgentInfo{}, fmt.Errorf("新主 Agent 不得设置 parent_id")
	}
	if cfg.Type != AgentTypeMain {
		if strings.TrimSpace(cfg.ParentID) == "" {
			return AgentInfo{}, fmt.Errorf("子/worker Agent 必须指定 parent_id（所属主 Agent id）")
		}
		parent, perr := s.orchestrator.GetAgent(cfg.ParentID)
		if perr != nil {
			return AgentInfo{}, fmt.Errorf("parent 不存在: %w", perr)
		}
		if parent.Config().Type != AgentTypeMain {
			return AgentInfo{}, fmt.Errorf("parent 必须是主 Agent")
		}
	}
	return s.CreateAgent(ctx, cfg)
}

// CreateAgent 创建代理
func (s *Service) CreateAgent(ctx context.Context, config AgentConfig) (AgentInfo, error) {
	agent, err := s.orchestrator.CreateAgent(ctx, config)
	if err != nil {
		return AgentInfo{}, err
	}
	if err := s.persistAgentsRegistry(); err != nil {
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
	_ = ctx
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return fmt.Errorf("agent id empty")
	}
	ag, err := s.orchestrator.GetAgent(agentID)
	if err != nil {
		return err
	}
	if ag.Config().Type == AgentTypeMain && s.studioStore != nil {
		bound := s.studioStore.StudiosUsingMainAgent(agentID)
		if len(bound) > 0 {
			n := bound[0].Name
			if strings.TrimSpace(n) == "" {
				n = bound[0].ID
			}
			if len(bound) > 1 {
				return fmt.Errorf("该主 Agent 仍被 %d 个工作室使用（例如「%s」），请先在工作室列表中删除或更换绑定", len(bound), n)
			}
			return fmt.Errorf("该主 Agent 仍被工作室「%s」使用，请先在工作室列表中删除该工作室", n)
		}
	}
	if err := s.orchestrator.DestroyAgent(agentID); err != nil {
		return err
	}
	return s.persistAgentsRegistry()
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

// GetAgentChatHistory 获取代理对话记忆；studioID 为空为聊天页全局会话，非空为工作室独立会话
func (s *Service) GetAgentChatHistory(ctx context.Context, agentID, studioID string) ([]ChatHistoryEntry, error) {
	return s.orchestrator.GetAgentChatHistory(ctx, agentID, studioID)
}

// ClearAgentChatHistory 清空指定会话的记忆文件
func (s *Service) ClearAgentChatHistory(agentID, studioID string) error {
	return s.orchestrator.ClearAgentChatHistory(agentID, studioID)
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
	if err := s.persistAgentsRegistry(); err != nil {
		return AgentInfo{}, err
	}
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
	if err := s.persistAgentsRegistry(); err != nil {
		return AgentInfo{}, err
	}
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
func (s *Service) persistAgentsRegistry() error {
	s.persistMu.Lock()
	defer s.persistMu.Unlock()

	infos := s.orchestrator.ListAgents()
	configs := make([]AgentConfig, 0, len(infos))
	for _, info := range infos {
		configs = append(configs, info.Config)
	}
	if len(configs) == 0 {
		deleteAgentRegistry()
		return nil
	}
	if err := saveAgentRegistry(configs); err != nil {
		log.Warn().Err(err).Msg("persist agents registry failed")
		return fmt.Errorf("persist agents registry: %w", err)
	}
	return nil
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

// RelocateProjectRoot 切换 Agent 与内置文件工具使用的项目根（启动默认为 ~/.devpilot/workData）。
func (s *Service) RelocateProjectRoot(path string) error {
	return s.projectCtx.RelocateRoot(path)
}

// Shutdown 关闭服务
func (s *Service) Shutdown() error {
	log.Info().Msg("shutting down agent service")
	var errs []error
	if err := s.persistAgentsRegistry(); err != nil {
		errs = append(errs, err)
	}
	if err := s.orchestrator.Shutdown(); err != nil {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}
