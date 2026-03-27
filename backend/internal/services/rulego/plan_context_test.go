package rulego

import (
	"encoding/json"
	"testing"
)

func TestCompactCanvasStructureFromRuleGoDSL(t *testing.T) {
	raw := `{
  "ruleChain": {"id": "r1", "name": "Test", "debugMode": false, "root": true, "disabled": false},
  "metadata": {
    "nodes": [
      {"id": "n1", "type": "startTrigger", "name": "S", "configuration": {"x": 1}},
      {"id": "n2", "type": "log", "name": "L", "configuration": {}}
    ],
    "connections": [{"fromId": "n1", "toId": "n2", "type": "Success"}]
  }
}`
	out := compactCanvasStructureFromRuleGoDSL(raw)
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(out), &m); err != nil {
		t.Fatal(err)
	}
	nodes, _ := m["nodes"].([]interface{})
	if len(nodes) != 2 {
		t.Fatalf("nodes len: %d", len(nodes))
	}
	if compactCanvasStructureFromRuleGoDSL("") != "" {
		t.Fatal("empty in should give empty out")
	}
}
