package rulego

import "encoding/json"

// EnabledFromDefinition 从规则链 DSL（definition JSON）中解析启用状态。
// DSL 中 ruleChain.disabled == true 表示停用，false 或未设置表示启用。
func EnabledFromDefinition(definition string) bool {
	if definition == "" {
		return false
	}
	var parsed struct {
		RuleChain *struct {
			Disabled *bool `json:"disabled"`
		} `json:"ruleChain"`
	}
	if err := json.Unmarshal([]byte(definition), &parsed); err != nil || parsed.RuleChain == nil {
		return true // 解析失败或无 ruleChain 时默认启用
	}
	if parsed.RuleChain.Disabled == nil {
		return true
	}
	return !*parsed.RuleChain.Disabled
}
