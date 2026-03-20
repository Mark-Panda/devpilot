package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

const (
	// StudioTodoToolName 工作室内维护个人 TODO（list / replace / complete）
	StudioTodoToolName = "devpilot_studio_todo"
	// StudioTodoSnapshotToolName 主 Agent 拉取本工作室全部成员的 TODO 总览（JSON）
	StudioTodoSnapshotToolName = "devpilot_studio_progress_snapshot"
)

var studioTodoToolParams = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"operation": map[string]any{
			"type":        "string",
			"enum":        []string{"list", "replace", "complete"},
			"description": "list=查看本人当前清单；replace=整表覆盖（至少一条）；complete=将某 id 标为已完成",
		},
		"items": map[string]any{
			"type": "array",
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"id": map[string]any{"type": "string"},
					"title": map[string]any{
						"type":        "string",
						"description": "步骤描述；replace 时必填，complete 可省略",
					},
					"done": map[string]any{
						"type":        "boolean",
						"description": "replace 时可设初值；一般用 complete 勾选",
					},
				},
				"required": []string{"id"},
			},
			"description": "replace 时必填且 id 唯一；complete 时仅需一条且含 id",
		},
	},
	"required": []string{"operation"},
}

func studioTodoTool() llms.Tool {
	return llms.Tool{
		Type: "function",
		Function: &llms.FunctionDefinition{
			Name:        StudioTodoToolName,
			Description: "工作室强制 TODO：list 查看当前 Agent 在本工作室的任务清单；replace 覆盖整表（接到任务后必须先写入可执行步骤）；complete 勾选完成项（传对应 id）。id 仅字母数字下划线连字符。",
			Parameters:  studioTodoToolParams,
		},
	}
}

func studioTodoSnapshotTool() llms.Tool {
	return llms.Tool{
		Type: "function",
		Function: &llms.FunctionDefinition{
			Name:        StudioTodoSnapshotToolName,
			Description: "（仅主 Agent）获取本工作室全部成员当前 TODO 清单的 JSON 总览，用于向用户汇报进度或发现阻塞。",
			Parameters: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
		},
	}
}

func (a *agentImpl) executeStudioTodoTool(ctx context.Context, arguments string) (string, error) {
	sid := strings.TrimSpace(StudioIDFromContext(ctx))
	if sid == "" || a.studioTodoRuntime == nil {
		return "", fmt.Errorf("当前不在工作室或未启用 TODO")
	}
	var payload struct {
		Operation string            `json:"operation"`
		Items     []StudioTodoItem  `json:"items"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(arguments)), &payload); err != nil {
		return "", fmt.Errorf("参数须为 JSON: %w", err)
	}
	op := strings.ToLower(strings.TrimSpace(payload.Operation))
	a.mu.RLock()
	agentID := a.config.ID
	a.mu.RUnlock()

	switch op {
	case "list":
		items := a.studioTodoRuntime.StudioTodoGet(sid, agentID)
		b, _ := json.MarshalIndent(items, "", "  ")
		return string(b), nil
	case "replace":
		if err := a.studioTodoRuntime.StudioTodoReplace(sid, agentID, payload.Items); err != nil {
			return "", err
		}
		items := a.studioTodoRuntime.StudioTodoGet(sid, agentID)
		b, _ := json.MarshalIndent(items, "", "  ")
		return "已更新 TODO 清单：\n" + string(b), nil
	case "complete":
		if len(payload.Items) != 1 {
			return "", fmt.Errorf("complete 时 items 须恰好包含一条且带 id")
		}
		tid := strings.TrimSpace(payload.Items[0].ID)
		if err := a.studioTodoRuntime.StudioTodoComplete(sid, agentID, tid); err != nil {
			return "", err
		}
		items := a.studioTodoRuntime.StudioTodoGet(sid, agentID)
		b, _ := json.MarshalIndent(items, "", "  ")
		return "已勾选完成，当前清单：\n" + string(b), nil
	default:
		return "", fmt.Errorf("operation 须为 list、replace 或 complete")
	}
}

func (a *agentImpl) executeStudioTodoSnapshotTool(ctx context.Context, _ string) (string, error) {
	sid := strings.TrimSpace(StudioIDFromContext(ctx))
	if sid == "" || a.studioTodoRuntime == nil {
		return "", fmt.Errorf("当前不在工作室或未启用 TODO")
	}
	a.mu.RLock()
	isMain := a.config.Type == AgentTypeMain
	a.mu.RUnlock()
	if !isMain {
		return "", fmt.Errorf("仅主 Agent 可调用进度总览工具")
	}
	return a.studioTodoRuntime.StudioTodoSnapshotJSON(sid)
}
