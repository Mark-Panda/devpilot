package cursoracp

import (
	"encoding/json"
	"strings"
)

// AskQuestionUIOption 供弹窗展示的选项（cursor/ask_question）。
type AskQuestionUIOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// ParseAskQuestionUI 从 RPC params 解析问题文案与选项（兼容 options / choices 及常见文案字段）。
func ParseAskQuestionUI(params json.RawMessage) (title string, options []AskQuestionUIOption) {
	if len(params) == 0 {
		return "", nil
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(params, &raw); err != nil {
		return "", nil
	}
	for _, key := range []string{"message", "prompt", "question", "title", "text"} {
		if v, ok := raw[key]; ok {
			var s string
			_ = json.Unmarshal(v, &s)
			if strings.TrimSpace(s) != "" {
				title = strings.TrimSpace(s)
				break
			}
		}
	}
	type optRow struct {
		ID          string `json:"id"`
		Label       string `json:"label"`
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	var rows []optRow
	if v, ok := raw["options"]; ok {
		_ = json.Unmarshal(v, &rows)
	}
	if len(rows) == 0 {
		if v, ok := raw["choices"]; ok {
			_ = json.Unmarshal(v, &rows)
		}
	}
	for _, r := range rows {
		id := strings.TrimSpace(r.ID)
		if id == "" {
			continue
		}
		label := strings.TrimSpace(r.Label)
		if label == "" {
			label = strings.TrimSpace(r.Title)
		}
		if label == "" {
			label = strings.TrimSpace(r.Description)
		}
		if label == "" {
			label = id
		}
		options = append(options, AskQuestionUIOption{ID: id, Label: label})
	}
	return title, options
}
