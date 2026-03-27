package rulego

import (
	"encoding/json"
	"strings"
)

// compactCanvasStructureFromRuleGoDSL 从完整规则链 JSON 中提取节点/连线/端点摘要，供 Agent 规划时与大模型对齐拓扑。
func compactCanvasStructureFromRuleGoDSL(fullDSL string) string {
	fullDSL = strings.TrimSpace(fullDSL)
	if fullDSL == "" {
		return ""
	}
	var root map[string]interface{}
	if err := json.Unmarshal([]byte(fullDSL), &root); err != nil {
		return ""
	}
	out := make(map[string]interface{})
	if rc, ok := root["ruleChain"].(map[string]interface{}); ok {
		out["rule_chain"] = map[string]interface{}{
			"id":        rc["id"],
			"name":      rc["name"],
			"debugMode": rc["debugMode"],
			"root":      rc["root"],
			"disabled":  rc["disabled"],
		}
	}
	meta, _ := root["metadata"].(map[string]interface{})
	if meta == nil {
		b, _ := json.Marshal(out)
		return string(b)
	}
	if nodes, ok := meta["nodes"].([]interface{}); ok {
		compact := make([]map[string]interface{}, 0, len(nodes))
		for _, n := range nodes {
			m, ok := n.(map[string]interface{})
			if !ok {
				continue
			}
			compact = append(compact, map[string]interface{}{
				"id":   m["id"],
				"type": m["type"],
				"name": m["name"],
			})
		}
		out["nodes"] = compact
	}
	if conns, ok := meta["connections"].([]interface{}); ok {
		cc := make([]map[string]interface{}, 0, len(conns))
		for _, c := range conns {
			m, ok := c.(map[string]interface{})
			if !ok {
				continue
			}
			entry := map[string]interface{}{
				"fromId": m["fromId"],
				"toId":   m["toId"],
				"type":   m["type"],
			}
			if lbl := m["label"]; lbl != nil && lbl != "" {
				entry["label"] = lbl
			}
			cc = append(cc, entry)
		}
		out["connections"] = cc
	}
	if ep, ok := meta["endpoints"].([]interface{}); ok && len(ep) > 0 {
		sk := make([]map[string]interface{}, 0, len(ep))
		for _, e := range ep {
			m, ok := e.(map[string]interface{})
			if !ok {
				continue
			}
			sk = append(sk, map[string]interface{}{
				"id":   m["id"],
				"type": m["type"],
				"name": m["name"],
			})
		}
		out["endpoints"] = sk
	}
	b, _ := json.Marshal(out)
	return string(b)
}
