package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"unicode"

	"github.com/tmc/langchaingo/llms"
)

const (
	// CreateAgentTeamToolName 主 Agent 一次性创建新的主 Agent 及其下属子/worker（写入 agents.json）
	CreateAgentTeamToolName = "devpilot_create_agent_team"
)

var createAgentTeamToolParams = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"main_agent": map[string]any{
			"type": "object",
			"description": "新主 Agent（独立项目组根节点，无 parent）",
			"properties": map[string]any{
				"id": map[string]any{
					"type":        "string",
					"description": "唯一 id，仅字母、数字、下划线、连字符，建议前缀如 team_ / proj_",
				},
				"name": map[string]any{
					"type":        "string",
					"description": "展示名称",
				},
				"role": map[string]any{
					"type":        "string",
					"description": "职责说明，写入系统提示【角色】",
				},
				"system_prompt": map[string]any{
					"type":        "string",
					"description": "可选补充系统提示（空则使用默认助手描述）",
				},
			},
			"required": []string{"id", "name", "role"},
		},
		"sub_agents": map[string]any{
			"type":        "array",
			"description": "挂在新主 Agent 下的子 Agent；可为空数组表示仅创建主 Agent",
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"id": map[string]any{
						"type":        "string",
						"description": "子 Agent 唯一 id",
					},
					"name": map[string]any{"type": "string"},
					"role": map[string]any{"type": "string", "description": "分工说明"},
					"agent_type": map[string]any{
						"type":        "string",
						"enum":        []string{"sub", "worker"},
						"description": "sub=子代理；worker=工作代理",
					},
					"system_prompt": map[string]any{
						"type":        "string",
						"description": "可选补充系统提示",
					},
				},
				"required": []string{"id", "name", "role", "agent_type"},
			},
		},
	},
	"required": []string{"main_agent", "sub_agents"},
}

func createAgentTeamTool() llms.Tool {
	return llms.Tool{
		Type: "function",
		Function: &llms.FunctionDefinition{
			Name: CreateAgentTeamToolName,
			Description: "根据用户需求分析并**创建一套新的 Agent 团队**：一个新的主 Agent（type=main）及其下属子 Agent 或 worker。" +
				"新 Agent 的模型、API Key、温度等与**当前主 Agent**一致，并继承当前主 Agent 已勾选的技能与 MCP 列表。" +
				"调用前应先理清分工，为用户生成语义清晰的 id（如 team_fe_main、team_fe_sub_ui）。" +
				"创建完成后用户可在侧栏 Agent 树中看到新团队；若需协作可再为**新主 Agent** 创建工作室。" +
				"不可用于删除或修改已有 Agent。",
			Parameters: createAgentTeamToolParams,
		},
	}
}

func validateNewAgentIDForTool(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("id 不能为空")
	}
	if len(id) > 64 {
		return fmt.Errorf("id 过长（最多 64 字符）")
	}
	for _, r := range id {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' {
			continue
		}
		return fmt.Errorf("id 仅允许字母、数字、下划线与连字符: %q", id)
	}
	return nil
}

func parseAgentTypeForTool(s string) (AgentType, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "sub":
		return AgentTypeSub, nil
	case "worker":
		return AgentTypeWorker, nil
	default:
		return "", fmt.Errorf("agent_type 须为 sub 或 worker，收到 %q", s)
	}
}

func (a *agentImpl) executeCreateAgentTeamTool(ctx context.Context, arguments string) (string, error) {
	if a.createAgentTool == nil {
		return "", fmt.Errorf("当前环境未启用创建团队工具")
	}
	if a.config.Type != AgentTypeMain {
		return "", fmt.Errorf("仅主 Agent 可创建 Agent 团队")
	}

	var payload struct {
		MainAgent struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			Role         string `json:"role"`
			SystemPrompt string `json:"system_prompt"`
		} `json:"main_agent"`
		SubAgents []struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			Role         string `json:"role"`
			AgentType    string `json:"agent_type"`
			SystemPrompt string `json:"system_prompt"`
		} `json:"sub_agents"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(arguments)), &payload); err != nil {
		return "", fmt.Errorf("参数须为 JSON（main_agent + sub_agents）: %w", err)
	}

	mainID := strings.TrimSpace(payload.MainAgent.ID)
	if err := validateNewAgentIDForTool(mainID); err != nil {
		return "", fmt.Errorf("main_agent.id: %w", err)
	}
	mainName := strings.TrimSpace(payload.MainAgent.Name)
	if mainName == "" {
		return "", fmt.Errorf("main_agent.name 不能为空")
	}
	mainRole := strings.TrimSpace(payload.MainAgent.Role)
	if mainRole == "" {
		return "", fmt.Errorf("main_agent.role 不能为空")
	}

	seen := map[string]struct{}{mainID: {}}
	for i, sub := range payload.SubAgents {
		sid := strings.TrimSpace(sub.ID)
		if err := validateNewAgentIDForTool(sid); err != nil {
			return "", fmt.Errorf("sub_agents[%d].id: %w", i, err)
		}
		if _, dup := seen[sid]; dup {
			return "", fmt.Errorf("重复的 agent id: %s", sid)
		}
		seen[sid] = struct{}{}
		if strings.TrimSpace(sub.Name) == "" {
			return "", fmt.Errorf("sub_agents[%d].name 不能为空", i)
		}
		if strings.TrimSpace(sub.Role) == "" {
			return "", fmt.Errorf("sub_agents[%d].role 不能为空", i)
		}
		if _, err := parseAgentTypeForTool(sub.AgentType); err != nil {
			return "", fmt.Errorf("sub_agents[%d]: %w", i, err)
		}
	}

	a.mu.RLock()
	mc := a.config.ModelConfig
	skills := append([]string(nil), a.config.Skills...)
	mcpServers := append([]string(nil), a.config.MCPServers...)
	callerID := a.config.ID
	a.mu.RUnlock()

	mainCfg := AgentConfig{
		ID:           mainID,
		Name:         mainName,
		Role:         mainRole,
		Type:         AgentTypeMain,
		ParentID:     "",
		ModelConfig:  mc,
		Skills:       skills,
		MCPServers:   mcpServers,
		SystemPrompt: strings.TrimSpace(payload.MainAgent.SystemPrompt),
	}

	if _, err := a.createAgentTool(ctx, callerID, mainCfg); err != nil {
		return "", fmt.Errorf("创建主 Agent: %w", err)
	}

	var subLines []string
	for i, sub := range payload.SubAgents {
		at, err := parseAgentTypeForTool(sub.AgentType)
		if err != nil {
			return "", err
		}
		subCfg := AgentConfig{
			ID:           strings.TrimSpace(sub.ID),
			Name:         strings.TrimSpace(sub.Name),
			Role:         strings.TrimSpace(sub.Role),
			Type:         at,
			ParentID:     mainID,
			ModelConfig:  mc,
			Skills:       skills,
			MCPServers:   mcpServers,
			SystemPrompt: strings.TrimSpace(sub.SystemPrompt),
		}
		if _, err := a.createAgentTool(ctx, callerID, subCfg); err != nil {
			return "", fmt.Errorf("已创建主 Agent %q，但在创建 sub_agents[%d]（%q）失败: %w；请在前端检查或删除已创建的 Agent", mainID, i, subCfg.ID, err)
		}
		subLines = append(subLines, fmt.Sprintf("%s（%s，%s）", subCfg.Name, subCfg.ID, subCfg.Type))
	}

	if len(subLines) == 0 {
		return fmt.Sprintf("已创建新主 Agent「%s」（id=%s）。未创建子 Agent；你可继续对话或稍后再调用本工具补充下属。", mainName, mainID), nil
	}
	return fmt.Sprintf("已创建新主 Agent「%s」（id=%s），及 %d 名下属：%s。用户可在侧栏刷新 Agent 列表；可为新主 Agent 新建工作室以便委派。",
		mainName, mainID, len(subLines), strings.Join(subLines, "；")), nil
}
