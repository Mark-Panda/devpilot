package rulego

import (
	"context"
	"errors"
	"strings"
	"time"

	"devpilot/backend/internal/llm"
	"devpilot/backend/internal/store/models"
	"devpilot/backend/internal/store/pebble"
)

type Service struct {
	store       *Store
	execLogStore *ExecutionLogStore
}

func NewService(store *Store, execLogStore *ExecutionLogStore) *Service {
	s := &Service{store: store, execLogStore: execLogStore}
	if execLogStore != nil {
		SetGlobalExecutionLogStore(execLogStore)
	}
	return s
}

type CreateRuleGoRuleInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	Definition  string `json:"definition"`
	EditorJSON  string `json:"editor_json"`
}

type UpdateRuleGoRuleInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	Definition  string `json:"definition"`
	EditorJSON  string `json:"editor_json"`
}

func (s *Service) ListRuleGoRules() ([]models.RuleGoRule, error) {
	return s.store.List(context.Background())
}

func (s *Service) CreateRuleGoRule(input CreateRuleGoRuleInput) (models.RuleGoRule, error) {
	rule := models.RuleGoRule{
		Name:        strings.TrimSpace(input.Name),
		Description: strings.TrimSpace(input.Description),
		Enabled:     input.Enabled,
		Definition:  strings.TrimSpace(input.Definition),
		EditorJSON:  strings.TrimSpace(input.EditorJSON),
	}
	if err := validateRule(rule); err != nil {
		return models.RuleGoRule{}, err
	}

	result, err := s.store.Create(context.Background(), rule)
	if err != nil {
		return models.RuleGoRule{}, err
	}
	if result.Enabled && result.Definition != "" {
		_ = s.LoadRuleChain(result.ID)
	}
	return result, nil
}

func (s *Service) UpdateRuleGoRule(id string, input UpdateRuleGoRuleInput) (models.RuleGoRule, error) {
	existing, err := s.store.GetByID(context.Background(), id)
	if err != nil {
		return models.RuleGoRule{}, err
	}

	rule := models.RuleGoRule{
		ID:          id,
		Name:        strings.TrimSpace(input.Name),
		Description: strings.TrimSpace(input.Description),
		Enabled:     input.Enabled,
		Definition:  strings.TrimSpace(input.Definition),
		EditorJSON:  strings.TrimSpace(input.EditorJSON),
		CreatedAt:   existing.CreatedAt,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if err := validateRule(rule); err != nil {
		return models.RuleGoRule{}, err
	}

	result, err := s.store.Update(context.Background(), id, rule)
	if err != nil {
		return models.RuleGoRule{}, err
	}
	if result.Enabled && result.Definition != "" {
		_ = s.LoadRuleChain(id)
	} else {
		_ = s.UnloadRuleChain(id)
	}
	return result, nil
}

func (s *Service) DeleteRuleGoRule(id string) error {
	_ = s.UnloadRuleChain(id)
	return s.store.Delete(context.Background(), id)
}

func (s *Service) GetRuleGoRule(id string) (models.RuleGoRule, error) {
	return s.store.GetByID(context.Background(), id)
}

func validateRule(rule models.RuleGoRule) error {
	if rule.Name == "" {
		return errors.New("name is required")
	}
	if rule.Definition == "" {
		return errors.New("definition is required")
	}
	return nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, pebble.ErrNotFound)
}

// ListExecutionLogsResult 执行日志分页结果
type ListExecutionLogsResult struct {
	Items []models.RuleGoExecutionLog `json:"items"`
	Total int                         `json:"total"`
}

// ListExecutionLogs 分页查询执行日志，按开始时间倒序
func (s *Service) ListExecutionLogs(limit, offset int) (ListExecutionLogsResult, error) {
	if s.execLogStore == nil {
		return ListExecutionLogsResult{Items: nil, Total: 0}, nil
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	items, err := s.execLogStore.ListExecutionLogs(context.Background(), limit, offset)
	if err != nil {
		return ListExecutionLogsResult{}, err
	}
	total, err := s.execLogStore.CountExecutionLogs(context.Background())
	if err != nil {
		return ListExecutionLogsResult{}, err
	}
	return ListExecutionLogsResult{Items: items, Total: total}, nil
}

// GetExecutionLogResponse 单条执行日志及其节点步骤
type GetExecutionLogResponse struct {
	Log   models.RuleGoExecutionLog    `json:"log"`
	Nodes []models.RuleGoExecutionNodeLog `json:"nodes"`
}

// GetExecutionLog 获取单条执行日志及所有节点步骤（入参/出参）
func (s *Service) GetExecutionLog(executionID string) (GetExecutionLogResponse, error) {
	if s.execLogStore == nil {
		return GetExecutionLogResponse{}, pebble.ErrNotFound
	}
	logRow, err := s.execLogStore.GetExecutionLogByID(context.Background(), executionID)
	if err != nil {
		return GetExecutionLogResponse{}, err
	}
	nodes, err := s.execLogStore.GetNodeLogsByExecutionID(context.Background(), executionID)
	if err != nil {
		return GetExecutionLogResponse{}, err
	}
	return GetExecutionLogResponse{Log: logRow, Nodes: nodes}, nil
}

// DeleteExecutionLog 删除一条执行日志及其所有节点步骤
func (s *Service) DeleteExecutionLog(executionID string) error {
	if s.execLogStore == nil {
		return pebble.ErrNotFound
	}
	return s.execLogStore.DeleteExecutionLog(context.Background(), executionID)
}

// AvailableSkillItem 表示 ~/.devpilot/skills/ 下可勾选的一项技能（供 LLM 节点配置使用）
type AvailableSkillItem struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// ListAvailableSkills 返回默认技能目录 ~/.devpilot/skills/ 下所有 SKILL.md 的 name 与 description，供前端勾选启用
func (s *Service) ListAvailableSkills() ([]AvailableSkillItem, error) {
	skills, err := llm.LoadSkills(llm.DefaultSkillDir())
	if err != nil {
		return nil, err
	}
	out := make([]AvailableSkillItem, 0, len(skills))
	for _, sk := range skills {
		out = append(out, AvailableSkillItem{Name: sk.Name, Description: sk.Description})
	}
	return out, nil
}
