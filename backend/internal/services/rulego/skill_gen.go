package rulego

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"devpilot/backend/internal/llm"
	"devpilot/backend/internal/store/models"
)

// createSkillToolName 用于“根据规则链生成技能”流程的工具名，与 initSkills/skill-creator 的 name 一致。
const createSkillToolName = "skill-creator"

// GenerateSkillFromRuleChain 使用大模型调用 skill-creator 技能，生成 SKILL.md 并写入 ~/.devpilot/skills/{dirName}，
// 同时更新规则的 SkillDirName。baseURL、apiKey、model 为调用大模型所需；models 为可选备用模型（按顺序故障转移）。
// 注意：供 Wails 绑定时由前端调用，不要将 context.Context 作为首参，否则 JSON 参数会绑定错误。
func (s *Service) GenerateSkillFromRuleChain(ruleID string, baseURL, apiKey, model string, models []string) (skillDirName string, err error) {
	ctx := context.Background()
	baseURL = strings.TrimSpace(baseURL)
	apiKey = strings.TrimSpace(apiKey)
	model = strings.TrimSpace(model)
	var modelsTrimmed []string
	for _, m := range models {
		if t := strings.TrimSpace(m); t != "" {
			modelsTrimmed = append(modelsTrimmed, t)
		}
	}
	chain := llm.NormalizeModelChain(model, modelsTrimmed)
	log.Printf("[rulego] GenerateSkillFromRuleChain 开始 ruleID=%s baseURL=%s models=%v", ruleID, baseURL, chain)
	if baseURL == "" || apiKey == "" || len(chain) == 0 {
		log.Printf("[rulego] GenerateSkillFromRuleChain 参数无效: baseURL/apiKey 或模型链为空")
		return "", fmt.Errorf("base_url、api_key 与至少一个模型为必填")
	}

	rule, err := s.store.GetByID(ctx, ruleID)
	if err != nil {
		log.Printf("[rulego] GenerateSkillFromRuleChain 获取规则失败 ruleID=%s err=%v", ruleID, err)
		return "", err
	}
	if rule.Definition == "" {
		log.Printf("[rulego] GenerateSkillFromRuleChain 规则链定义为空 ruleID=%s", ruleID)
		return "", fmt.Errorf("规则链定义为空")
	}

	skillDir := filepath.Join(llm.DefaultSkillDir(), createSkillToolName)
	createSkill, err := llm.LoadSkillFromDir(skillDir)
	if err != nil {
		log.Printf("[rulego] GenerateSkillFromRuleChain 加载 skill-creator 失败 dir=%s err=%v", skillDir, err)
		return "", fmt.Errorf("加载 skill-creator 失败: %w", err)
	}
	if createSkill == nil {
		log.Printf("[rulego] GenerateSkillFromRuleChain skill-creator 未找到 dir=%s", skillDir)
		return "", fmt.Errorf("skill-creator 未找到，请确保已初始化（启动时会从 initSkills 同步到 ~/.devpilot/skills/）")
	}

	cfg := llm.Config{BaseURL: baseURL, APIKey: apiKey, Model: model, Models: modelsTrimmed}
	client, err := llm.NewClientWithSkills(ctx, cfg, []llm.Skill{*createSkill})
	if err != nil {
		log.Printf("[rulego] GenerateSkillFromRuleChain 创建 LLM 客户端失败 err=%v", err)
		return "", fmt.Errorf("创建 LLM 客户端失败: %w", err)
	}

	log.Printf("[rulego] GenerateSkillFromRuleChain 调用大模型 tool loop ruleID=%s name=%s", ruleID, rule.Name)
	userMsg := buildCreateSkillUserMessage(rule)
	systemPrompt := llm.BuildSkillSystemPrompt([]llm.Skill{*createSkill}, false)
	messages := llm.BuildSystemUserMessages(systemPrompt, userMsg)

	tools := llm.SkillsToTools([]llm.Skill{*createSkill})
	executor := &createSkillExecutor{s: s, ruleID: ruleID, rule: rule}
	_, err = client.GenerateWithToolLoop(ctx, messages, tools, nil, executor, 4)
	if err != nil {
		log.Printf("[rulego] GenerateSkillFromRuleChain 大模型调用失败 ruleID=%s err=%v", ruleID, err)
		return "", llm.FormatErrorForUser(err)
	}
	if executor.writtenDir == "" {
		log.Printf("[rulego] GenerateSkillFromRuleChain 模型未调用 skill-creator ruleID=%s", ruleID)
		return "", fmt.Errorf("模型未调用 skill-creator 提交内容，请重试")
	}
	log.Printf("[rulego] GenerateSkillFromRuleChain 完成 ruleID=%s skillDir=%s", ruleID, executor.writtenDir)
	return executor.writtenDir, nil
}

// createSkillExecutor 在模型调用 skill-creator 时解析参数并写入 SKILL.md、更新规则关联。
type createSkillExecutor struct {
	s          *Service
	ruleID     string
	rule       models.RuleGoRule
	writtenDir string
}

func (e *createSkillExecutor) Execute(ctx context.Context, name, arguments string) (string, error) {
	if name != createSkillToolName {
		return "", fmt.Errorf("未知工具: %s", name)
	}
	log.Printf("[rulego] skill-creator 被调用 ruleID=%s argumentsLen=%d", e.ruleID, len(arguments))
	args := []byte(arguments)
	var nameStr, descStr, bodyStr string
	// 先尝试直接解析为 { "name", "description", "body" }
	var direct struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Body        string `json:"body"`
	}
	if err := json.Unmarshal(args, &direct); err == nil && (direct.Name != "" || direct.Description != "") {
		nameStr, descStr, bodyStr = direct.Name, direct.Description, direct.Body
	} else {
		var input struct {
			Input string `json:"input"`
		}
		if err := json.Unmarshal(args, &input); err != nil {
			return "", fmt.Errorf("解析 skill-creator 参数失败: %w", err)
		}
		var payload struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Body        string `json:"body"`
		}
		if err := json.Unmarshal([]byte(input.Input), &payload); err != nil {
			return "", fmt.Errorf("解析 input 内容失败: %w", err)
		}
		nameStr, descStr, bodyStr = payload.Name, payload.Description, payload.Body
	}
	return e.writeSkillFile(nameStr, descStr, bodyStr)
}

func (e *createSkillExecutor) writeSkillFile(name, description, body string) (string, error) {
	name = strings.TrimSpace(name)
	description = strings.TrimSpace(description)
	body = strings.TrimSpace(body)
	if name == "" || description == "" {
		return "", fmt.Errorf("name 与 description 为必填")
	}
	if body == "" {
		body = "This skill runs the linked DevPilot rule chain; user input is passed as the chain's data."
	}

	content := buildSkillMDContent(name, description, body, e.ruleID)
	dirName := skillDirNameForRule(e.rule)
	skillDir := filepath.Join(llm.DefaultSkillDir(), dirName)
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		return "", fmt.Errorf("创建技能目录失败: %w", err)
	}
	skillPath := filepath.Join(skillDir, "SKILL.md")
	if err := os.WriteFile(skillPath, []byte(content), 0644); err != nil {
		log.Printf("[rulego] skill-creator 写入 SKILL.md 失败 path=%s err=%v", skillPath, err)
		return "", fmt.Errorf("写入 SKILL.md 失败: %w", err)
	}
	log.Printf("[rulego] skill-creator 已写入 path=%s name=%s", skillPath, name)

	e.rule.SkillDirName = dirName
	if _, err := e.s.store.Update(context.Background(), e.ruleID, e.rule); err != nil {
		_ = os.Remove(skillPath)
		_ = os.Remove(skillDir)
		return "", fmt.Errorf("更新规则关联失败: %w", err)
	}
	e.writtenDir = dirName
	log.Printf("[rulego] skill-creator 完成 ruleID=%s dirName=%s", e.ruleID, dirName)
	return "技能已创建：" + dirName, nil
}

func buildSkillMDContent(name, description, body, ruleChainID string) string {
	var b strings.Builder
	b.WriteString("---\n")
	b.WriteString("name: ")
	b.WriteString(strings.ReplaceAll(name, "\n", " "))
	b.WriteString("\ndescription: ")
	b.WriteString(strings.ReplaceAll(description, "\n", " "))
	b.WriteString("\nrule_chain_id: ")
	b.WriteString(ruleChainID)
	b.WriteString("\n---\n\n")
	b.WriteString(body)
	return b.String()
}

func buildCreateSkillUserMessage(rule models.RuleGoRule) string {
	var b strings.Builder
	b.WriteString("请根据以下规则链信息，调用 skill-creator 工具提交生成的技能。\n\n")
	b.WriteString("规则链 ID：")
	b.WriteString(rule.ID)
	b.WriteString("\n\n规则链名称：")
	b.WriteString(rule.Name)
	b.WriteString("\n\n规则链描述：")
	b.WriteString(rule.Description)
	paramsBlock := formatRuleChainParamsForSkillDescription(rule.RequestMetadataParamsJSON, rule.RequestMessageBodyParamsJSON)
	if paramsBlock != "" {
		b.WriteString("\n\n以下「规则链请求参数」章节必须完整并入你在 skill-creator 中提交的 description 字段（可与触发场景说明合并为一段连贯英文描述，但不要省略参数名、类型、是否必填与说明）：\n\n")
		b.WriteString(paramsBlock)
	}
	b.WriteString("\n\n规则链 DSL（JSON）：\n")
	b.WriteString(rule.Definition)
	b.WriteString("\n\n请在 input 中传入 JSON：{\"name\": \"英文技能名\", \"description\": \"英文描述（何时使用）\", \"body\": \"简短 Markdown 正文\"}。")
	return b.String()
}

// DeleteSkillForRuleChain 删除规则链关联的技能目录并清空规则的 SkillDirName。
// 供 Wails 绑定时由前端调用，不接收 context.Context 以免 JSON 参数绑定错误。
func (s *Service) DeleteSkillForRuleChain(ruleID string) error {
	log.Printf("[rulego] DeleteSkillForRuleChain 开始 ruleID=%s", ruleID)
	ctx := context.Background()
	rule, err := s.store.GetByID(ctx, ruleID)
	if err != nil {
		log.Printf("[rulego] DeleteSkillForRuleChain 获取规则失败 ruleID=%s err=%v", ruleID, err)
		return err
	}
	if rule.SkillDirName == "" {
		log.Printf("[rulego] DeleteSkillForRuleChain 无关联技能 ruleID=%s", ruleID)
		return nil
	}
	skillDir := filepath.Join(llm.DefaultSkillDir(), rule.SkillDirName)
	_ = os.RemoveAll(skillDir)
	log.Printf("[rulego] DeleteSkillForRuleChain 已删除目录 ruleID=%s skillDir=%s", ruleID, skillDir)
	rule.SkillDirName = ""
	_, err = s.store.Update(ctx, ruleID, rule)
	if err != nil {
		log.Printf("[rulego] DeleteSkillForRuleChain 更新规则失败 ruleID=%s err=%v", ruleID, err)
		return err
	}
	log.Printf("[rulego] DeleteSkillForRuleChain 完成 ruleID=%s", ruleID)
	return err
}

// skillDirNameForRule 生成规则链对应技能目录名，固定为 rule-{id} 避免重名且可追溯。
func skillDirNameForRule(rule models.RuleGoRule) string {
	return "rule-" + rule.ID
}
