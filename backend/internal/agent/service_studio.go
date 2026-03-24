package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// studioMaxAutoMainContinuations 用户发一条消息后，主 Agent 因「子任务完成」触发的自动续跑最多次数（防无限链式委派）
const studioMaxAutoMainContinuations = 8

// studioProgressBriefCooldown 前端定时触发「进度巡检」的最小间隔
const studioProgressBriefCooldown = 90 * time.Second

var studioProgressBriefLast sync.Map // studioID -> time.Time

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

// agentTreeContainsMember 判断 agentID 是否出现在主 Agent 树（含根）中
func agentTreeContainsMember(root *AgentTreeNode, agentID string) bool {
	agentID = strings.TrimSpace(agentID)
	if root == nil || agentID == "" {
		return false
	}
	if strings.TrimSpace(root.Agent.Config.ID) == agentID {
		return true
	}
	for _, c := range root.Children {
		if agentTreeContainsMember(c, agentID) {
			return true
		}
	}
	return false
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
	studioID = strings.TrimSpace(studioID)
	if studioID == "" {
		return fmt.Errorf("工作室 ID 无效")
	}
	if err := s.studioStore.DeleteStudio(studioID); err != nil {
		return err
	}
	studioProgressBriefLast.Delete(studioID)
	if s.studioTodoStore != nil {
		if err := s.studioTodoStore.DeleteRoom(studioID); err != nil {
			log.Warn().Err(err).Str("studio_id", studioID).Msg("delete studio todos room failed")
		}
	}
	return nil
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
	aws := s.studioStore.ListAgentWorkspaces(studioID)
	return StudioDetail{
		Studio:          st,
		MemberAgents:    flattenAgentTreeMembers(tree),
		AgentWorkspaces: aws,
	}, nil
}

// StudioAgentWorkspaceGet 实现 StudioAgentWorkspaceRuntime（供 Agent 解析工作室内文件工具根）
func (s *Service) StudioAgentWorkspaceGet(studioID, agentID string) string {
	if s.studioStore == nil {
		return ""
	}
	return s.studioStore.GetAgentWorkspace(studioID, agentID)
}

// SetStudioAgentWorkspace 设置或清除（path 为空）工作室内某成员的文件工具根目录
func (s *Service) SetStudioAgentWorkspace(ctx context.Context, studioID, agentID, path string) error {
	studioID = strings.TrimSpace(studioID)
	agentID = strings.TrimSpace(agentID)
	if studioID == "" || agentID == "" {
		return fmt.Errorf("studio_id 与 agent_id 不能为空")
	}
	if s.studioStore == nil {
		return fmt.Errorf("工作室存储未初始化")
	}
	st, err := s.studioStore.GetStudio(studioID)
	if err != nil {
		return err
	}
	tree, err := s.GetAgentTree(ctx, st.MainAgentID)
	if err != nil {
		return fmt.Errorf("加载主 Agent 树: %w", err)
	}
	if !agentTreeContainsMember(tree, agentID) {
		return fmt.Errorf("agent %q 不是该工作室成员", agentID)
	}
	var norm string
	if strings.TrimSpace(path) != "" {
		norm, err = NormalizeAgentWorkspaceRoot(path)
		if err != nil {
			return err
		}
	}
	return s.studioStore.SetAgentWorkspace(studioID, agentID, norm)
}

// buildStudioTodoBoardRows 按成员列表聚合各 Agent TODO（无 todo 存储时返回 nil）
func (s *Service) buildStudioTodoBoardRows(studioID string, members []AgentInfo) []StudioTodoBoardRow {
	if s.studioTodoStore == nil {
		return nil
	}
	studioID = strings.TrimSpace(studioID)
	rows := make([]StudioTodoBoardRow, 0, len(members))
	for _, m := range members {
		rows = append(rows, StudioTodoBoardRow{
			AgentID:   m.Config.ID,
			AgentName: m.Config.Name,
			Items:     s.studioTodoStore.Get(studioID, m.Config.ID),
		})
	}
	return rows
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
	s.resetStudioAutoMainSteps(studioID)
	studioProgressBriefLast.Delete(studioID)
	ctx = WithStudioID(ctx, studioID)
	return s.orchestrator.Chat(ctx, agentID, userMessage)
}

// SetStudioChatEmitter 由 App 注入，将主 Agent 自动续跑回复推到前端（可为 nil）
func (s *Service) SetStudioChatEmitter(fn func(StudioAssistantPush)) {
	s.studioChatEmitMu.Lock()
	defer s.studioChatEmitMu.Unlock()
	s.studioChatEmitter = fn
}

func (s *Service) resetStudioAutoMainSteps(studioID string) {
	s.studioAutoMainSteps.Store(strings.TrimSpace(studioID), 0)
}

func truncateForStudioContinuation(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	if max <= 4 {
		return "…"
	}
	return s[:max-3] + "..."
}

func (s *Service) studioMainAfterChildFinished(parentID, studioID, childID, childName, taskPreview, result string) {
	studioID = strings.TrimSpace(studioID)
	if studioID == "" {
		return
	}
	v, _ := s.studioAutoMainSteps.LoadOrStore(studioID, 0)
	n, _ := v.(int)
	if n >= studioMaxAutoMainContinuations {
		return
	}
	s.studioAutoMainSteps.Store(studioID, n+1)

	ctx := WithStudioID(context.Background(), studioID)
	prompt := fmt.Sprintf(`【工作室·子任务完成】子 Agent「%s」（id=%s）已完成本轮后台执行。

委派任务摘要：%s
返回内容（节选）：
%s

请结合用户在本工作室中的整体需求判断：若仍需其他子 Agent 或后续步骤，请调用工具 %s 继续派发；若本阶段已可交付，请用简短中文说明进度与产出要点，避免不必要的重复委派。`,
		childName, childID, strings.TrimSpace(taskPreview), truncateForStudioContinuation(result, 6000), DelegateToSubAgentToolName)

	reply, err := s.Chat(ctx, parentID, prompt)
	if err != nil {
		log.Warn().Err(err).Str("studio_id", studioID).Str("main_id", parentID).Msg("studio main auto-continuation failed")
		return
	}
	s.studioChatEmitMu.RLock()
	fn := s.studioChatEmitter
	s.studioChatEmitMu.RUnlock()
	if fn != nil && strings.TrimSpace(reply) != "" {
		fn(StudioAssistantPush{
			StudioID: studioID,
			AgentID:  parentID,
			Content:  reply,
		})
	}
}

// StudioTodoGet 实现 StudioTodoRuntime
func (s *Service) StudioTodoGet(studioID, agentID string) []StudioTodoItem {
	if s.studioTodoStore == nil {
		return nil
	}
	return s.studioTodoStore.Get(studioID, agentID)
}

// StudioTodoReplace 实现 StudioTodoRuntime
func (s *Service) StudioTodoReplace(studioID, agentID string, items []StudioTodoItem) error {
	if s.studioTodoStore == nil {
		return fmt.Errorf("工作室 TODO 存储未初始化")
	}
	return s.studioTodoStore.Replace(studioID, agentID, items)
}

// StudioTodoComplete 实现 StudioTodoRuntime
func (s *Service) StudioTodoComplete(studioID, agentID, todoID string) error {
	if s.studioTodoStore == nil {
		return fmt.Errorf("工作室 TODO 存储未初始化")
	}
	return s.studioTodoStore.Complete(studioID, agentID, todoID)
}

// StudioTodoSnapshotJSON 实现 StudioTodoRuntime
func (s *Service) StudioTodoSnapshotJSON(studioID string) (string, error) {
	if s.studioTodoStore == nil {
		return "[]", nil
	}
	ctx := context.Background()
	det, err := s.GetStudioDetail(ctx, studioID)
	if err != nil {
		return "", err
	}
	rows := s.buildStudioTodoBoardRows(studioID, det.MemberAgents)
	b, err := json.MarshalIndent(rows, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// GetStudioTodoBoard 供前端展示各成员 TODO（无 LLM）
func (s *Service) GetStudioTodoBoard(ctx context.Context, studioID string) ([]StudioTodoBoardRow, error) {
	_ = ctx
	studioID = strings.TrimSpace(studioID)
	if studioID == "" {
		return nil, fmt.Errorf("studio_id 无效")
	}
	if s.studioTodoStore == nil {
		return []StudioTodoBoardRow{}, nil
	}
	det, err := s.GetStudioDetail(ctx, studioID)
	if err != nil {
		return nil, err
	}
	rows := s.buildStudioTodoBoardRows(studioID, det.MemberAgents)
	if rows == nil {
		return []StudioTodoBoardRow{}, nil
	}
	return rows, nil
}

// StudioMaybeProgressBrief 由前端定时调用：在冷却内跳过；否则让主 Agent 拉取 TODO 总览并向用户简报（经 studio:assistant 推送）
func (s *Service) StudioMaybeProgressBrief(ctx context.Context, studioID string) error {
	_ = ctx
	studioID = strings.TrimSpace(studioID)
	if studioID == "" || s.studioStore == nil || s.studioTodoStore == nil {
		return nil
	}
	st, err := s.studioStore.GetStudio(studioID)
	if err != nil {
		return err
	}
	mainID := strings.TrimSpace(st.MainAgentID)
	if mainID == "" {
		return nil
	}
	now := time.Now()
	if v, ok := studioProgressBriefLast.Load(studioID); ok {
		if now.Sub(v.(time.Time)) < studioProgressBriefCooldown {
			return nil
		}
	}

	ctx2 := WithStudioID(context.Background(), studioID)
	prompt := "【工作室·定时进度巡检】请先调用工具 " + StudioTodoSnapshotToolName + " 获取本工作室全部成员 TODO 的 JSON 总览。\n" +
		"若整体较上次无明显变化，只回复一行：「进度巡检：暂无新变化。」\n" +
		"若有事项完成、进行中或阻塞，用 2～5 句中文向用户说明；不要无故重复委派。"
	reply, err := s.Chat(ctx2, mainID, prompt)
	if err != nil {
		log.Warn().Err(err).Str("studio_id", studioID).Msg("studio progress brief failed")
		return err
	}
	studioProgressBriefLast.Store(studioID, time.Now())
	s.studioChatEmitMu.RLock()
	fn := s.studioChatEmitter
	s.studioChatEmitMu.RUnlock()
	if fn != nil && strings.TrimSpace(reply) != "" {
		fn(StudioAssistantPush{
			StudioID: studioID,
			AgentID:  mainID,
			Content:  reply,
		})
	}
	return nil
}
