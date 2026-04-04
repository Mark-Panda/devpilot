package rulego

import "testing"

func TestNormalizeRuleGoDefinitionString_InjectsDevPilot(t *testing.T) {
	def := `{
  "ruleChain": {
    "id": "r1",
    "name": "Test",
    "debugMode": false,
    "root": true,
    "disabled": false,
    "configuration": {}
  },
  "metadata": { "firstNodeIndex": 0, "nodes": [], "connections": [], "ruleChainConnections": [] }
}`
	out, err := NormalizeRuleGoDefinitionString(def, "r1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if RuleChainNameFromDefinition(out) != "Test" {
		t.Fatalf("name = %q", RuleChainNameFromDefinition(out))
	}
	if SkillDirNameFromDefinition(out) != "" {
		t.Fatalf("skill dir = %q", SkillDirNameFromDefinition(out))
	}
}

func TestNormalizeRuleGoDefinitionString_SkillOverride(t *testing.T) {
	def := `{
  "ruleChain": {
    "id": "r1",
    "name": "N",
    "configuration": {
      "devpilot": {
        "schema_version": 1,
        "description": "d",
        "io": {
          "request_metadata_params": [],
          "request_message_body_params": [],
          "response_message_body_params": []
        },
        "editor": { "scratch_json": "" },
        "skill": { "dir_name": "old" }
      }
    }
  },
  "metadata": { "firstNodeIndex": 0, "nodes": [], "connections": [], "ruleChainConnections": [] }
}`
	newSkill := "new-dir"
	out, err := NormalizeRuleGoDefinitionString(def, "r1", &newSkill)
	if err != nil {
		t.Fatal(err)
	}
	if SkillDirNameFromDefinition(out) != "new-dir" {
		t.Fatalf("skill = %q", SkillDirNameFromDefinition(out))
	}
}

func TestValidateRuleChainDefinition_requiresName(t *testing.T) {
	if err := validateRuleChainDefinition(`{"ruleChain":{"name":""}}`); err == nil {
		t.Fatal("expected error")
	}
	if err := validateRuleChainDefinition(`{"ruleChain":{"name":"ok"},"metadata":{}}`); err != nil {
		t.Fatal(err)
	}
}
