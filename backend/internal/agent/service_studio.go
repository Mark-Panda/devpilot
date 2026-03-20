package agent

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

func flattenAgentTreeMembers(root *AgentTreeNode) []AgentInfo {
	if root == nil {
		return nil
	}
	out := []AgentInfo{root.Agent}
	for _, c := range root.Children {
		out = append(out, flattenAgentTreeMembers(c)...)
	}
	return out
}

// SetStudioProgressEmitter 由 App 注入，用于 Wails EventsEmit（可为 nil）
func (s *Service) SetStudioProgressEmitter(fn func(StudioProgressEvent)) {
	s.studioEmitMu.Lock()
	defer s.studioEmitMu.Unlock()
	s.studioEmitter = fn
}

func (s *Service) onStudioProgress(ev StudioProgressEvent) {
	if s.studioStore != nil {
		if err := s.studioStore.AppendProgress(ev); err != nil {
			log.Warn().Err(err).Str("studio_id", ev.StudioID).Msg("append studio progress failed")
		}
	}
	s.studioEmitMu.RLock()
	fn := s.studioEmitter
	s.studioEmitMu.RUnlock()
	if fn != nil {
		fn(ev)
	}
}

// ListStudios 列出全部工作室
func (s *Service) ListStudios(ctx context.Context) []Studio {
	_ = ctx
	if s.studioStore == nil {
		return []Studio{}
	}
	return s.studioStore.ListStudios()
}

// CreateStudio 创建工作室：主 Agent 须为 main；成员由当前主 Agent 树动态计算（不单独存成员表）
func (s *Service) CreateStudio(ctx context.Context, name, mainAgentID string) (Studio, error) {
	if s.studioStore == nil {
		return Studio{}, fmt.Errorf("工作室存储未初始化")
	}
	mainAgentID = strings.TrimSpace(mainAgentID)
	ag, err := s.orchestrator.GetAgent(mainAgentID)
	if err != nil {
		return Studio{}, err
	}
	if ag.Config().Type != AgentTypeMain {
		return Studio{}, fmt.Errorf("请选择类型为 main 的主 Agent")
	}
	st := Studio{
		ID:          fmt.Sprintf("studio_%d", time.Now().UnixNano()),
		MainAgentID: mainAgentID,
		CreatedAt:   time.Now(),
	}
	st.Name = strings.TrimSpace(name)
	if st.Name == "" {
		st.Name = ag.Config().Name
	}
	if err := s.studioStore.AddStudio(st); err != nil {
		return Studio{}, err
	}
	return st, nil
}

// DeleteStudio 删除工作室
func (s *Service) DeleteStudio(ctx context.Context, studioID string) error {
	_ = ctx
	if s.studioStore == nil {
		return fmt.Errorf("工作室存储未初始化")
	}
	return s.studioStore.DeleteStudio(studioID)
}

// GetStudioDetail 工作室信息 + 主 Agent 树下全部成员
func (s *Service) GetStudioDetail(ctx context.Context, studioID string) (StudioDetail, error) {
	if s.studioStore == nil {
		return StudioDetail{}, fmt.Errorf("工作室存储未初始化")
	}
	st, err := s.studioStore.GetStudio(studioID)
	if err != nil {
		return StudioDetail{}, err
	}
	tree, err := s.GetAgentTree(ctx, st.MainAgentID)
	if err != nil {
		return StudioDetail{}, fmt.Errorf("加载主 Agent 树: %w", err)
	}
	return StudioDetail{
		Studio:       st,
		MemberAgents: flattenAgentTreeMembers(tree),
	}, nil
}

// GetStudioProgress 工作室进度时间线
func (s *Service) GetStudioProgress(ctx context.Context, studioID string) []StudioProgressEvent {
	_ = ctx
	if s.studioStore == nil {
		return []StudioProgressEvent{}
	}
	return s.studioStore.GetProgress(studioID)
}

// ChatInStudio 仅允许与工作室主 Agent 对话；context 注入工作室 ID 以记录委派进度
func (s *Service) ChatInStudio(ctx context.Context, studioID, agentID, userMessage string) (string, error) {
	if s.studioStore == nil {
		return "", fmt.Errorf("工作室存储未初始化")
	}
	st, err := s.studioStore.GetStudio(studioID)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(agentID) != st.MainAgentID {
		return "", fmt.Errorf("工作室内仅能与主 Agent 对话")
	}
	ctx = WithStudioID(ctx, studioID)
	return s.orchestrator.Chat(ctx, agentID, userMessage)
}
