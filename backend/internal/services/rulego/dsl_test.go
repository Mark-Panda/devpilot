package rulego

import (
	"encoding/json"
	"testing"
)

func TestAlignDefinitionRuleChainID(t *testing.T) {
	const engine = "db-rule-uuid-1"
	raw := `{
  "ruleChain": {
    "id": "wrong-id",
    "name": "t",
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [],
    "connections": []
  }
}`
	out := AlignDefinitionRuleChainID(raw, engine)
	var doc struct {
		RuleChain struct {
			ID string `json:"id"`
		} `json:"ruleChain"`
	}
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.RuleChain.ID != engine {
		t.Fatalf("expected ruleChain.id %q, got %q", engine, doc.RuleChain.ID)
	}
}

func TestAlignDefinitionRuleChainID_alreadyAligned(t *testing.T) {
	const engine = "same"
	raw := `{"ruleChain":{"id":"same","name":"n"},"metadata":{}}`
	out := AlignDefinitionRuleChainID(raw, engine)
	if out != raw {
		t.Fatalf("expected unchanged string when already aligned")
	}
}

func TestAlignDefinitionRuleChainID_invalidJSON(t *testing.T) {
	raw := `{not json`
	out := AlignDefinitionRuleChainID(raw, "x")
	if out != raw {
		t.Fatalf("invalid json should be returned as-is")
	}
}
