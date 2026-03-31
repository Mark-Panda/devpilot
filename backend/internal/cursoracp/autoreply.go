package cursoracp

import (
	"encoding/json"
	"strconv"
	"strings"
)

// AutoReplyConfig 控制对 Agent 侧发往客户端的请求的自动批复（无人值守模式）。
type AutoReplyConfig struct {
	// PlanOptionID 对应 cursor/create_plan 等待用户选择时的 optionId（与 Cursor CLI 约定一致，常见为 approve）。
	PlanOptionID string
	// AskQuestionOptionIndex 对应 cursor/ask_question 多选项时自动选择的下标（从 0 开始）。
	AskQuestionOptionIndex int
	// ElicitationURLAction 对 session/elicitation 且 mode=url 时的 action：accept / decline / cancel。
	// accept 表示用户已同意打开外链（自动化场景下可能无法完成 OAuth，慎用）。
	ElicitationURLAction string
}

func (a AutoReplyConfig) planOption() string {
	s := strings.TrimSpace(a.PlanOptionID)
	if s == "" {
		return "approve"
	}
	return s
}

func (a AutoReplyConfig) askIndex() int {
	if a.AskQuestionOptionIndex < 0 {
		return 0
	}
	return a.AskQuestionOptionIndex
}

func (a AutoReplyConfig) elicitationURLAction() string {
	switch strings.ToLower(strings.TrimSpace(a.ElicitationURLAction)) {
	case "accept", "decline", "cancel":
		return strings.ToLower(strings.TrimSpace(a.ElicitationURLAction))
	default:
		return "decline"
	}
}

// autoPlanApproveResult 与 session/request_permission 相同 outcome 形状，便于与 Cursor CLI 对齐。
func autoPlanApproveResult(optID string) map[string]interface{} {
	return map[string]interface{}{
		"outcome": map[string]interface{}{
			"outcome":  "selected",
			"optionId": optID,
		},
	}
}

// autoReplyElicitation 根据 session/elicitation 的 params 生成 result（与 ACP ElicitationResponse 一致：顶层 action）。
func autoReplyElicitation(params json.RawMessage, cfg AutoReplyConfig) map[string]interface{} {
	if len(params) == 0 {
		return map[string]interface{}{"action": "cancel"}
	}
	var wrap struct {
		Mode            string          `json:"mode"`
		RequestedSchema json.RawMessage `json:"requestedSchema"`
	}
	_ = json.Unmarshal(params, &wrap)
	mode := strings.ToLower(strings.TrimSpace(wrap.Mode))
	switch mode {
	case "url":
		return map[string]interface{}{"action": cfg.elicitationURLAction()}
	case "form":
		content := elicitationDefaultsFromSchema(wrap.RequestedSchema)
		return map[string]interface{}{
			"action":  "accept",
			"content": content,
		}
	default:
		return map[string]interface{}{"action": "cancel"}
	}
}

func elicitationDefaultsFromSchema(schemaJSON json.RawMessage) map[string]interface{} {
	out := make(map[string]interface{})
	if len(schemaJSON) == 0 {
		return out
	}
	var sch struct {
		Properties map[string]json.RawMessage `json:"properties"`
		Required   []string                   `json:"required"`
	}
	if err := json.Unmarshal(schemaJSON, &sch); err != nil || sch.Properties == nil {
		return out
	}
	for name, propRaw := range sch.Properties {
		if v := elicitationDefaultForProperty(propRaw); v != nil {
			out[name] = v
		}
	}
	for _, name := range sch.Required {
		if _, ok := out[name]; !ok {
			out[name] = ""
		}
	}
	return out
}

func elicitationDefaultForProperty(propRaw json.RawMessage) interface{} {
	var m map[string]interface{}
	if err := json.Unmarshal(propRaw, &m); err != nil {
		return ""
	}
	typ, _ := m["type"].(string)
	switch typ {
	case "string":
		if oneOf, ok := m["oneOf"].([]interface{}); ok && len(oneOf) > 0 {
			if first, ok := oneOf[0].(map[string]interface{}); ok {
				if c, ok := first["const"].(string); ok && c != "" {
					return c
				}
			}
		}
		if enum, ok := m["enum"].([]interface{}); ok && len(enum) > 0 {
			if s, ok := enum[0].(string); ok {
				return s
			}
		}
		return ""
	case "number":
		return 0
	case "integer":
		return 0
	case "boolean":
		return false
	case "array":
		return []string{}
	default:
		return ""
	}
}

// autoReplyCursorExtension 处理 Cursor 文档列出的扩展方法；未知方法返回空对象以免阻塞 JSON-RPC。
func autoReplyCursorExtension(method string, params json.RawMessage, cfg AutoReplyConfig) interface{} {
	switch method {
	case "cursor/create_plan":
		return autoPlanApproveResult(cfg.planOption())
	case "cursor/ask_question":
		return autoReplyAskQuestion(params, cfg.askIndex())
	case "cursor/update_todos", "cursor/task", "cursor/generate_image":
		return map[string]interface{}{}
	default:
		if strings.HasPrefix(method, "cursor/") {
			return map[string]interface{}{}
		}
		return nil
	}
}

func autoReplyAskQuestion(params json.RawMessage, index int) interface{} {
	var wrap struct {
		Options []struct {
			ID string `json:"id"`
		} `json:"options"`
		Choices []struct {
			ID string `json:"id"`
		} `json:"choices"`
	}
	_ = json.Unmarshal(params, &wrap)
	opts := wrap.Options
	if len(opts) == 0 {
		opts = wrap.Choices
	}
	if len(opts) == 0 {
		return autoPlanApproveResult("confirm")
	}
	if index >= len(opts) {
		index = 0
	}
	optID := strings.TrimSpace(opts[index].ID)
	if optID == "" {
		return autoPlanApproveResult(strconv.Itoa(index))
	}
	return autoPlanApproveResult(optID)
}
