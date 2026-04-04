package rulegofile

import (
	"encoding/json"
	"strings"
)

// AlignDefinitionRuleChainID 将 DSL 中 ruleChain.id 设为 engineID（与 rulego 包 dsl.go 行为一致，避免 rulegofile 依赖 rulego）。
func AlignDefinitionRuleChainID(definition string, engineID string) string {
	definition = strings.TrimSpace(definition)
	engineID = strings.TrimSpace(engineID)
	if definition == "" || engineID == "" {
		return definition
	}
	var root map[string]interface{}
	if err := json.Unmarshal([]byte(definition), &root); err != nil {
		return definition
	}
	rc, ok := root["ruleChain"].(map[string]interface{})
	if !ok || rc == nil {
		return definition
	}
	cur, _ := rc["id"].(string)
	if strings.TrimSpace(cur) == engineID {
		return definition
	}
	rc["id"] = engineID
	out, err := json.Marshal(root)
	if err != nil {
		return definition
	}
	return string(out)
}
