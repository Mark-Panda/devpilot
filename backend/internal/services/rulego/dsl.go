package rulego

import (
	"encoding/json"
	"strings"
)

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

// SubRuleChainFromDefinition 为 true 表示 DSL 中 ruleChain.root === false（子规则链）。
// 与前端 getRuleChainRootKind(definition)==="sub" 一致；解析失败或缺省 root 视为根链。
func SubRuleChainFromDefinition(definition string) bool {
	definition = strings.TrimSpace(definition)
	if definition == "" {
		return false
	}
	var parsed struct {
		RuleChain *struct {
			Root *bool `json:"root"`
		} `json:"ruleChain"`
	}
	if err := json.Unmarshal([]byte(definition), &parsed); err != nil || parsed.RuleChain == nil {
		return false
	}
	if parsed.RuleChain.Root == nil {
		return false
	}
	return !*parsed.RuleChain.Root
}

// AlignDefinitionRuleChainID 将 DSL 顶层 ruleChain.id 设为 engineID（与 rulego.New(engineID, ...) 一致）。
//
// RuleGo 在加载 metadata.endpoints 时，EndpointAspect.OnCreated 里 bindTo 使用的 ruleEngineId 来自
// 链上下文 Id；该 Id 在 InitRuleChainCtx 阶段取自 DSL 的 ruleChain.id，且发生在引擎用 New 的第一个参数
// 覆盖 Id 之前。若 id 为空或与池中的引擎 id 不一致，endpoint 路由的 To 会指向错误链 id，
// 定时/HTTP 等端点无法触发 DefaultPool 中已注册的引擎。
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
