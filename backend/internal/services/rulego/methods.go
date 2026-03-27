package rulego

import (
	"context"
	"encoding/json"
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

type GenerateRuleGoPlanInput struct {
	Prompt              string   `json:"prompt"`
	CurrentDSL          string   `json:"current_dsl"`
	NodeTypes           []string `json:"node_types"`
	BaseURL             string   `json:"base_url,omitempty"`
	APIKey              string   `json:"api_key,omitempty"`
	Model               string   `json:"model,omitempty"`
	FallbackModels      []string `json:"fallback_models,omitempty"`
	ConversationHistory []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	} `json:"conversation_history,omitempty"`
}

type RuleGoPlanNode struct {
	ID            string                 `json:"id,omitempty"`
	NodeType      string                 `json:"node_type"`
	Name          string                 `json:"name,omitempty"`
	Configuration map[string]interface{} `json:"configuration,omitempty"`
	Confidence    float64                `json:"confidence,omitempty"`
	Reason        string                 `json:"reason,omitempty"`
}

type RuleGoPlanEdge struct {
	FromID     string  `json:"from_id"`
	ToID       string  `json:"to_id"`
	Type       string  `json:"type,omitempty"`
	Confidence float64 `json:"confidence,omitempty"`
	Reason     string  `json:"reason,omitempty"`
}

type GenerateRuleGoPlanResult struct {
	Nodes             []RuleGoPlanNode `json:"nodes"`
	Edges             []RuleGoPlanEdge `json:"edges"`
	Warnings          []string         `json:"warnings,omitempty"`
	OverallConfidence float64          `json:"overall_confidence,omitempty"`
	Thought           string           `json:"thought,omitempty"`
	Questions         []string         `json:"questions,omitempty"`
	NeedClarification bool             `json:"need_clarification,omitempty"`
	RawResponse       string           `json:"raw_response,omitempty"`
}

// GenerateRuleGoPlan 根据自然语言需求生成可预览的规则链计划（节点+连线），供前端勾选后应用。
func (s *Service) GenerateRuleGoPlan(input GenerateRuleGoPlanInput) (GenerateRuleGoPlanResult, error) {
	prompt := strings.TrimSpace(input.Prompt)
	if prompt == "" {
		return GenerateRuleGoPlanResult{}, fmt.Errorf("prompt 不能为空")
	}
	baseURL := strings.TrimSpace(input.BaseURL)
	apiKey := strings.TrimSpace(input.APIKey)
	model := strings.TrimSpace(input.Model)
	fallbackModels := make([]string, 0, len(input.FallbackModels))
	for _, m := range input.FallbackModels {
		if t := strings.TrimSpace(m); t != "" {
			fallbackModels = append(fallbackModels, t)
		}
	}
	if baseURL == "" || apiKey == "" || model == "" {
		if s.llmConfigLister == nil {
			return GenerateRuleGoPlanResult{}, fmt.Errorf("未配置模型管理，无法调用 Agent 规划")
		}
		configs, err := s.llmConfigLister.ListLLMConfigs(context.Background())
		if err != nil {
			return GenerateRuleGoPlanResult{}, fmt.Errorf("读取模型配置失败: %w", err)
		}
		if len(configs) == 0 {
			return GenerateRuleGoPlanResult{}, fmt.Errorf("未找到可用模型配置，请先在模型管理中配置")
		}
		var chosen LLMConfigEntry
		for _, c := range configs {
			if strings.TrimSpace(c.BaseURL) != "" && strings.TrimSpace(c.APIKey) != "" && len(c.Models) > 0 {
				chosen = c
				break
			}
		}
		if strings.TrimSpace(chosen.BaseURL) == "" || strings.TrimSpace(chosen.APIKey) == "" || len(chosen.Models) == 0 {
			return GenerateRuleGoPlanResult{}, fmt.Errorf("模型配置不完整：需要 base_url、api_key、models")
		}
		baseURL = strings.TrimSpace(chosen.BaseURL)
		apiKey = strings.TrimSpace(chosen.APIKey)
		model = strings.TrimSpace(chosen.Models[0])
		if len(chosen.Models) > 1 {
			fallbackModels = chosen.Models[1:]
		}
	}

	cfg := llm.Config{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
		Models:  fallbackModels,
	}
	client, err := llm.NewClient(context.Background(), cfg)
	if err != nil {
		return GenerateRuleGoPlanResult{}, fmt.Errorf("创建 LLM 客户端失败: %w", err)
	}
	systemPrompt := "你是 RuleGo 可视化编辑器规划助手。请严格返回 JSON 对象，不要输出任何额外文本。\n" +
		"JSON 结构: {\"thought\":\"你的思考摘要\",\"need_clarification\":false,\"questions\":[\"可选追问\"],\"nodes\":[{\"id\":\"可选\",\"node_type\":\"必填\",\"name\":\"可选\",\"configuration\":{},\"confidence\":0~1,\"reason\":\"可选\"}],\"edges\":[{\"from_id\":\"必填\",\"to_id\":\"必填\",\"type\":\"可选默认Success\",\"confidence\":0~1,\"reason\":\"可选\"}],\"warnings\":[\"可选\"],\"overall_confidence\":0~1}\n" +
		"规则: 1) 若用户需求信息不足，need_clarification=true，给出1-3个高价值追问，nodes/edges可为空；2) 若信息充分，need_clarification=false，并输出尽可能完整计划；3) node_type 必须优先使用可用节点类型；4) edges 必须引用 nodes 或当前 DSL 里的节点 id。"
	history := make([]map[string]string, 0, len(input.ConversationHistory))
	for _, h := range input.ConversationHistory {
		r := strings.TrimSpace(h.Role)
		if r == "" {
			continue
		}
		history = append(history, map[string]string{
			"role":    r,
			"content": strings.TrimSpace(h.Content),
		})
	}
	userPayload, _ := json.Marshal(map[string]interface{}{
		"requirement":            prompt,
		"conversation_history":   history,
		"current_dsl":            strings.TrimSpace(input.CurrentDSL),
		"node_types":             input.NodeTypes,
		"clarification_strategy": "ask_high_value_questions_first_if_needed",
	})
	raw, err := client.ChatWithSystem(context.Background(), systemPrompt, string(userPayload))
	if err != nil {
		return GenerateRuleGoPlanResult{}, llm.FormatErrorForUser(err)
	}
	clean := strings.TrimSpace(raw)
	start := strings.Index(clean, "{")
	end := strings.LastIndex(clean, "}")
	if start >= 0 && end > start {
		clean = clean[start : end+1]
	}
	var out GenerateRuleGoPlanResult
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return GenerateRuleGoPlanResult{}, fmt.Errorf("解析模型返回 JSON 失败: %w", err)
	}
	out.RawResponse = raw
	return out, nil
}
