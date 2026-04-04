package rulego

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/rulego/rulego"
)

func TestDefinitionForcedEnabledForRuleEngine(t *testing.T) {
	raw := `{"ruleChain":{"id":"x","name":"n","disabled":true},"metadata":{"firstNodeIndex":0,"nodes":[],"connections":[]}}`
	out := DefinitionForcedEnabledForRuleEngine(raw)
	if !strings.Contains(out, `"disabled":false`) {
		t.Fatalf("expected disabled false in JSON, got %q", out)
	}
	if EnabledFromDefinition(raw) != false {
		t.Fatal("sanity: original should parse as disabled")
	}
	if EnabledFromDefinition(out) != true {
		t.Fatal("patched DSL should parse as enabled")
	}
}

// RuleGo 在 DSL 中 disabled:true 时会拒绝 New；LoadRuleChainAllowDisabled 传入的内存 DSL 需先强制 enabled。
func TestRulegoNewDisabledVsForcedEnabled(t *testing.T) {
	const id = "_test_disabled_flag_"
	t.Cleanup(func() {
		if eng, ok := rulego.Get(id); ok {
			eng.Stop(nil)
		}
		rulego.Del(id)
	})
	minDef := `{"ruleChain":{"id":"` + id + `","name":"t","root":true,"disabled":true},"metadata":{"firstNodeIndex":0,"nodes":[],"connections":[]}}`
	_, err := rulego.New(id, []byte(minDef), ruleEngineOpts()...)
	if err == nil {
		t.Fatal("expected rulego.New to fail when disabled:true")
	}
	if !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("expected disabled-related error, got %v", err)
	}
	rulego.Del(id)

	fixed := DefinitionForcedEnabledForRuleEngine(AlignDefinitionRuleChainID(minDef, id))
	eng, err := rulego.New(id, []byte(fixed), ruleEngineOpts()...)
	if err != nil {
		t.Fatalf("expected rulego.New to succeed after force-enabled: %v", err)
	}
	eng.Stop(nil)
	rulego.Del(id)
}

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

func TestSubRuleChainFromDefinition(t *testing.T) {
	if !SubRuleChainFromDefinition(`{"ruleChain":{"root":false,"name":"x"},"metadata":{}}`) {
		t.Fatal("root:false should be sub chain")
	}
	if SubRuleChainFromDefinition(`{"ruleChain":{"root":true,"name":"x"},"metadata":{}}`) {
		t.Fatal("root:true should not be sub")
	}
	if SubRuleChainFromDefinition(`{"ruleChain":{"name":"x"},"metadata":{}}`) {
		t.Fatal("missing root should default to main chain")
	}
	if SubRuleChainFromDefinition("") {
		t.Fatal("empty definition is not sub")
	}
}
