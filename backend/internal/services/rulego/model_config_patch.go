package rulego

import (
	"context"
	"encoding/json"
	"log"
	"strings"

	"devpilot/backend/internal/llm"
)

// LLMConfigEntry 用于从「模型管理」解析 ai/llm 节点 API Key 的条目，与 store 解耦。
type LLMConfigEntry struct {
	BaseURL string   `json:"base_url"`
	APIKey  string   `json:"api_key"`
	Models  []string `json:"models"`
}

// LLMConfigLister 列出模型配置，供规则链执行时用其 API Key 覆盖 ai/llm 节点中存储的 key。
// 若设置，则与「生成技能」使用同一套凭证，避免规则链内 key 与模型管理不一致导致 401。
type LLMConfigLister interface {
	ListLLMConfigs(ctx context.Context) ([]LLMConfigEntry, error)
}

// findAPIKeyByBaseURLAndModel 在配置列表中按 baseURL 与 model 匹配，返回 APIKey；未匹配返回空。
func findAPIKeyByBaseURLAndModel(configs []LLMConfigEntry, baseURL, model string) string {
	baseURL = strings.TrimSpace(baseURL)
	model = strings.TrimSpace(model)
	for _, c := range configs {
		if strings.TrimSpace(c.BaseURL) != baseURL {
			continue
		}
		for _, m := range c.Models {
			if strings.TrimSpace(m) == model {
				return strings.TrimSpace(c.APIKey)
			}
		}
	}
	return ""
}

func modelChainFromConfiguration(configuration map[string]interface{}) []string {
	model, _ := configuration["model"].(string)
	var extras []string
	if raw, ok := configuration["models"].([]interface{}); ok {
		for _, v := range raw {
			if s, ok := v.(string); ok {
				extras = append(extras, s)
			}
		}
	}
	return llm.NormalizeModelChain(model, extras)
}

// PatchDefinitionWithLLMKeys 将 definition JSON 中所有 ai/llm 节点的 configuration.key
// 用模型管理里匹配 baseURL+model 的 APIKey 覆盖，使执行时与「生成技能」使用同一套凭证。
// 若 configs 为空或 lister 为 nil，返回原 definition 不变。
func PatchDefinitionWithLLMKeys(ctx context.Context, definition string, lister LLMConfigLister) (string, error) {
	if lister == nil || definition == "" {
		return definition, nil
	}
	configs, err := lister.ListLLMConfigs(ctx)
	if err != nil {
		log.Printf("[rulego] PatchDefinitionWithLLMKeys 获取模型配置失败: %v", err)
		return definition, nil
	}
	if len(configs) == 0 {
		return definition, nil
	}

	var root map[string]interface{}
	if err := json.Unmarshal([]byte(definition), &root); err != nil {
		return definition, nil
	}
	metadata, _ := root["metadata"].(map[string]interface{})
	if metadata == nil {
		return definition, nil
	}
	nodes, _ := metadata["nodes"].([]interface{})
	if len(nodes) == 0 {
		return definition, nil
	}

	patched := 0
	for _, n := range nodes {
		node, _ := n.(map[string]interface{})
		if node == nil {
			continue
		}
		nodeType, _ := node["type"].(string)
		if nodeType != "ai/llm" {
			continue
		}
		configuration, _ := node["configuration"].(map[string]interface{})
		if configuration == nil {
			continue
		}
		url, _ := configuration["url"].(string)
		chain := modelChainFromConfiguration(configuration)
		var key string
		for _, m := range chain {
			if k := findAPIKeyByBaseURLAndModel(configs, url, m); k != "" {
				key = k
				break
			}
		}
		if key == "" {
			continue
		}
		configuration["key"] = key
		patched++
	}
	if patched > 0 {
		log.Printf("[rulego] PatchDefinitionWithLLMKeys 已用模型管理覆盖 %d 个 ai/llm 节点的 key", patched)
	}
	out, err := json.Marshal(root)
	if err != nil {
		return definition, nil
	}
	return string(out), nil
}
