package rulego

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const devPilotDSLSchemaVersion = 1

type devPilotMirror struct {
	Description                   string
	EditorJSON                    string
	RequestMetadataParamsJSON     string
	RequestMessageBodyParamsJSON  string
	ResponseMessageBodyParamsJSON string
	SkillDirName                  string
}

func mirrorFromDevPilotMap(dp map[string]interface{}) devPilotMirror {
	var m devPilotMirror
	if s, ok := dp["description"].(string); ok {
		m.Description = strings.TrimSpace(s)
	}
	io, ok := dp["io"].(map[string]interface{})
	if !ok || io == nil {
		io = map[string]interface{}{}
	}
	if v, ok := io["request_metadata_params"]; ok {
		if raw, err := json.Marshal(v); err == nil {
			m.RequestMetadataParamsJSON = strings.TrimSpace(string(raw))
		}
	}
	if v, ok := io["request_message_body_params"]; ok {
		if raw, err := json.Marshal(v); err == nil {
			m.RequestMessageBodyParamsJSON = strings.TrimSpace(string(raw))
		}
	}
	if v, ok := io["response_message_body_params"]; ok {
		if raw, err := json.Marshal(v); err == nil {
			m.ResponseMessageBodyParamsJSON = strings.TrimSpace(string(raw))
		}
	}
	if ed, ok := dp["editor"].(map[string]interface{}); ok && ed != nil {
		if s, ok := ed["scratch_json"].(string); ok {
			m.EditorJSON = strings.TrimSpace(s)
		}
	}
	if sk, ok := dp["skill"].(map[string]interface{}); ok && sk != nil {
		if s, ok := sk["dir_name"].(string); ok {
			m.SkillDirName = strings.TrimSpace(s)
		}
	}
	return m
}

func devPilotMapFromMirror(m devPilotMirror) map[string]interface{} {
	meta := normalizeParamsJSONArray(m.RequestMetadataParamsJSON)
	body := normalizeParamsJSONArray(m.RequestMessageBodyParamsJSON)
	resp := normalizeParamsJSONArray(m.ResponseMessageBodyParamsJSON)
	return map[string]interface{}{
		"schema_version": devPilotDSLSchemaVersion,
		"description":    strings.TrimSpace(m.Description),
		"io": map[string]interface{}{
			"request_metadata_params":       meta,
			"request_message_body_params":   body,
			"response_message_body_params": resp,
		},
		"editor": map[string]interface{}{
			"scratch_json": strings.TrimSpace(m.EditorJSON),
		},
		"skill": map[string]interface{}{
			"dir_name": strings.TrimSpace(m.SkillDirName),
		},
	}
}

// NormalizeRuleGoDefinitionString 规范化 DSL 中的 devpilot 块。
// skillDirNameOverride 非 nil 时覆盖 devpilot.skill.dir_name（清空技能关联时传入指向空串的指针）。
func NormalizeRuleGoDefinitionString(definition string, ruleID string, skillDirNameOverride *string) (string, error) {
	_ = ruleID // 保留参数供调用方与 AlignDefinitionRuleChainID 配合使用
	def := strings.TrimSpace(definition)
	if def == "" {
		return "", nil
	}

	var root map[string]interface{}
	if err := json.Unmarshal([]byte(def), &root); err != nil {
		return "", err
	}

	rc, ok := root["ruleChain"].(map[string]interface{})
	if !ok || rc == nil {
		return def, nil
	}

	cfg, ok := rc["configuration"].(map[string]interface{})
	if !ok || cfg == nil {
		cfg = make(map[string]interface{})
		rc["configuration"] = cfg
	}

	var m devPilotMirror
	if dp, ok := cfg["devpilot"].(map[string]interface{}); ok && dp != nil {
		m = mirrorFromDevPilotMap(dp)
	}
	if skillDirNameOverride != nil {
		m.SkillDirName = strings.TrimSpace(*skillDirNameOverride)
	}

	cfg["devpilot"] = devPilotMapFromMirror(m)

	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func normalizeParamsJSONArray(raw string) []interface{} {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []interface{}{}
	}
	var arr []interface{}
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return []interface{}{}
	}
	return arr
}

// RuleChainNameFromDefinition 返回 ruleChain.name。
func RuleChainNameFromDefinition(definition string) string {
	definition = strings.TrimSpace(definition)
	if definition == "" {
		return ""
	}
	var parsed struct {
		RuleChain *struct {
			Name string `json:"name"`
		} `json:"ruleChain"`
	}
	if err := json.Unmarshal([]byte(definition), &parsed); err != nil || parsed.RuleChain == nil {
		return ""
	}
	return strings.TrimSpace(parsed.RuleChain.Name)
}

// SkillDirNameFromDefinition 返回 devpilot.skill.dir_name。
func SkillDirNameFromDefinition(definition string) string {
	definition = strings.TrimSpace(definition)
	if definition == "" {
		return ""
	}
	var root map[string]interface{}
	if err := json.Unmarshal([]byte(definition), &root); err != nil {
		return ""
	}
	rc, _ := root["ruleChain"].(map[string]interface{})
	if rc == nil {
		return ""
	}
	cfg, _ := rc["configuration"].(map[string]interface{})
	if cfg == nil {
		return ""
	}
	dp, _ := cfg["devpilot"].(map[string]interface{})
	if dp == nil {
		return ""
	}
	sk, _ := dp["skill"].(map[string]interface{})
	if sk == nil {
		return ""
	}
	s, _ := sk["dir_name"].(string)
	return strings.TrimSpace(s)
}

// DocFieldsFromDefinition 供技能生成等从 DSL 读取展示与参数表字段。
func DocFieldsFromDefinition(definition string) (name, desc, reqMeta, reqBody, resp string) {
	name = RuleChainNameFromDefinition(definition)
	definition = strings.TrimSpace(definition)
	if definition == "" {
		return name, "", "", "", ""
	}
	var root map[string]interface{}
	if err := json.Unmarshal([]byte(definition), &root); err != nil {
		return name, "", "", "", ""
	}
	rc, _ := root["ruleChain"].(map[string]interface{})
	if rc == nil {
		return name, "", "", "", ""
	}
	cfg, _ := rc["configuration"].(map[string]interface{})
	if cfg == nil {
		return name, "", "", "", ""
	}
	dp, _ := cfg["devpilot"].(map[string]interface{})
	if dp == nil {
		return name, "", "", "", ""
	}
	m := mirrorFromDevPilotMap(dp)
	return name, m.Description, m.RequestMetadataParamsJSON, m.RequestMessageBodyParamsJSON, m.ResponseMessageBodyParamsJSON
}

func validateRuleChainDefinition(def string) error {
	def = strings.TrimSpace(def)
	if def == "" {
		return errors.New("definition is required")
	}
	var root map[string]interface{}
	if err := json.Unmarshal([]byte(def), &root); err != nil {
		return fmt.Errorf("definition 不是合法 JSON: %w", err)
	}
	if RuleChainNameFromDefinition(def) == "" {
		return errors.New("ruleChain.name 不能为空")
	}
	rc, _ := root["ruleChain"].(map[string]interface{})
	if rc == nil {
		return nil
	}
	cfg, _ := rc["configuration"].(map[string]interface{})
	if cfg == nil {
		return nil
	}
	dp, _ := cfg["devpilot"].(map[string]interface{})
	if dp == nil {
		return nil
	}
	m := mirrorFromDevPilotMap(dp)
	if err := validateRuleChainParamsJSON(m.RequestMetadataParamsJSON); err != nil {
		return err
	}
	if err := validateRuleChainParamsJSON(m.RequestMessageBodyParamsJSON); err != nil {
		return err
	}
	if err := validateRuleChainParamsJSON(m.ResponseMessageBodyParamsJSON); err != nil {
		return err
	}
	return nil
}
