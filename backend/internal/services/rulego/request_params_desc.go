package rulego

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ruleChainParamItem 与前端存储的 JSON 数组元素一致。
type ruleChainParamItem struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
	Children    []ruleChainParamItem `json:"children"`
}

func parseRuleChainParamsJSONArray(raw string) ([]ruleChainParamItem, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var items []ruleChainParamItem
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, err
	}
	return items, nil
}

// formatRuleChainParamsForSkillDescription 将元数据/消息体参数表格式化为 Markdown，供生成技能时并入 description。
func formatRuleChainParamsForSkillDescription(metadataJSON, messageBodyJSON string) string {
	meta, err1 := parseRuleChainParamsJSONArray(metadataJSON)
	body, err2 := parseRuleChainParamsJSONArray(messageBodyJSON)
	if err1 != nil {
		meta = nil
	}
	if err2 != nil {
		body = nil
	}
	var b strings.Builder
	flatten := func(items []ruleChainParamItem) []ruleChainParamItem {
		var out []ruleChainParamItem
		var walk func(nodes []ruleChainParamItem, prefix string)
		walk = func(nodes []ruleChainParamItem, prefix string) {
			for _, n := range nodes {
				key := strings.TrimSpace(n.Key)
				if key == "" {
					continue
				}
				full := key
				if prefix != "" {
					full = prefix + "." + key
				}
				curr := n
				curr.Key = full
				out = append(out, curr)
				if len(n.Children) > 0 {
					nextPrefix := full
					if strings.TrimSpace(n.Type) == "array" {
						nextPrefix = full + "[]"
					}
					walk(n.Children, nextPrefix)
				}
			}
		}
		walk(items, "")
		return out
	}
	writeSection := func(title string, items []ruleChainParamItem) {
		if len(items) == 0 {
			return
		}
		flat := flatten(items)
		if len(flat) == 0 {
			return
		}
		b.WriteString("### ")
		b.WriteString(title)
		b.WriteString("\n\n")
		for _, it := range flat {
			k := strings.TrimSpace(it.Key)
			if k == "" {
				continue
			}
			typ := strings.TrimSpace(it.Type)
			if typ == "" {
				typ = "string"
			}
			req := ""
			if it.Required {
				req = "，必填"
			}
			desc := strings.TrimSpace(it.Description)
			line := fmt.Sprintf("- `%s`（%s%s）", k, typ, req)
			if desc != "" {
				line += "：" + desc
			}
			b.WriteString(line)
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}
	writeSection("元数据（metadata）参数", meta)
	writeSection("消息体（data）参数", body)
	return strings.TrimSpace(b.String())
}
