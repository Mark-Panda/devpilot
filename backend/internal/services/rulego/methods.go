package rulego

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"devpilot/backend/internal/llm"
	"devpilot/backend/internal/store/models"
	"devpilot/backend/internal/store/pebble"
)

type Service struct {
	store           *Store
	execLogStore    *ExecutionLogStore
	llmConfigLister LLMConfigLister // 可选：用于执行时用模型管理中的 API Key 覆盖 ai/llm 节点 key
}

// NewService 创建 RuleGo 服务。llmConfigLister 可选，非 nil 时执行/加载规则链前会用模型管理中的配置覆盖 ai/llm 的 key。
func NewService(store *Store, execLogStore *ExecutionLogStore, llmConfigLister LLMConfigLister) *Service {
	s := &Service{store: store, execLogStore: execLogStore, llmConfigLister: llmConfigLister}
	if execLogStore != nil {
		SetGlobalExecutionLogStore(execLogStore)
	}
	return s
}

type CreateRuleGoRuleInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Definition  string `json:"definition"`
	EditorJSON  string `json:"editor_json"`
}

type UpdateRuleGoRuleInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Definition  string `json:"definition"`
	EditorJSON  string `json:"editor_json"`
}

func (s *Service) ListRuleGoRules() ([]models.RuleGoRule, error) {
	return s.store.List(context.Background())
}

func (s *Service) CreateRuleGoRule(input CreateRuleGoRuleInput) (models.RuleGoRule, error) {
	ctx := context.Background()
	rule := models.RuleGoRule{
		Name:        strings.TrimSpace(input.Name),
		Description: strings.TrimSpace(input.Description),
		Definition:  strings.TrimSpace(input.Definition),
		EditorJSON:  strings.TrimSpace(input.EditorJSON),
	}
	if err := validateRule(rule); err != nil {
		return models.RuleGoRule{}, err
	}

	result, err := s.store.Create(ctx, rule)
	if err != nil {
		return models.RuleGoRule{}, err
	}
	if EnabledFromDefinition(result.Definition) && result.Definition != "" {
		if err := s.LoadRuleChain(result.ID); err != nil {
			return result, fmt.Errorf("规则已保存但加载到引擎失败: %w", err)
		}
	}
	return result, nil
}

func (s *Service) UpdateRuleGoRule(id string, input UpdateRuleGoRuleInput) (models.RuleGoRule, error) {
	ctx := context.Background()
	existing, err := s.store.GetByID(ctx, id)
	if err != nil {
		return models.RuleGoRule{}, err
	}

	rule := models.RuleGoRule{
		ID:           id,
		Name:         strings.TrimSpace(input.Name),
		Description:  strings.TrimSpace(input.Description),
		Definition:   strings.TrimSpace(input.Definition),
		EditorJSON:   strings.TrimSpace(input.EditorJSON),
		SkillDirName: existing.SkillDirName, // 保留关联技能目录，仅通过 GenerateSkillFromRuleChain / DeleteSkillForRuleChain 变更
		CreatedAt:    existing.CreatedAt,
		UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
	}
	if err := validateRule(rule); err != nil {
		return models.RuleGoRule{}, err
	}

	result, err := s.store.Update(ctx, id, rule)
	if err != nil {
		return models.RuleGoRule{}, err
	}
	enabled := EnabledFromDefinition(result.Definition)
	if enabled && result.Definition != "" {
		if err := s.LoadRuleChain(id); err != nil {
			return result, fmt.Errorf("规则已更新但加载到引擎失败: %w", err)
		}
	} else {
		if err := s.UnloadRuleChain(id); err != nil {
			return result, err
		}
		if result.SkillDirName != "" {
			if err := s.DeleteSkillForRuleChain(id); err != nil {
				return result, fmt.Errorf("规则已更新但清理关联技能失败: %w", err)
			}
			refreshed, gerr := s.store.GetByID(ctx, id)
			if gerr != nil {
				return models.RuleGoRule{}, fmt.Errorf("规则已更新但重新读取失败: %w", gerr)
			}
			result = refreshed
		}
	}
	return result, nil
}

func (s *Service) DeleteRuleGoRule(id string) error {
	if err := s.UnloadRuleChain(id); err != nil {
		return err
	}
	if err := s.DeleteSkillForRuleChain(id); err != nil {
		return fmt.Errorf("清理关联技能: %w", err)
	}
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
	ctx := context.Background()
	items, err := s.execLogStore.ListExecutionLogs(ctx, limit, offset)
	if err != nil {
		return ListExecutionLogsResult{}, err
	}
	total, err := s.execLogStore.CountExecutionLogs(ctx)
	if err != nil {
		return ListExecutionLogsResult{}, err
	}
	return ListExecutionLogsResult{Items: items, Total: total}, nil
}

// GetExecutionLogResponse 单条执行日志及其节点步骤
type GetExecutionLogResponse struct {
	Log   models.RuleGoExecutionLog       `json:"log"`
	Nodes []models.RuleGoExecutionNodeLog `json:"nodes"`
}

// GetExecutionLog 获取单条执行日志及所有节点步骤（入参/出参）
func (s *Service) GetExecutionLog(executionID string) (GetExecutionLogResponse, error) {
	if s.execLogStore == nil {
		return GetExecutionLogResponse{}, pebble.ErrNotFound
	}
	ctx := context.Background()
	logRow, err := s.execLogStore.GetExecutionLogByID(ctx, executionID)
	if err != nil {
		return GetExecutionLogResponse{}, err
	}
	nodes, err := s.execLogStore.GetNodeLogsByExecutionID(ctx, executionID)
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
