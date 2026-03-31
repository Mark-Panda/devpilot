package cursoracp

import (
	"encoding/json"
	"testing"
)

func TestAutoReplyConfig_planOption(t *testing.T) {
	if got := (AutoReplyConfig{}).planOption(); got != "approve" {
		t.Fatalf("default planOption: %q", got)
	}
	if got := (AutoReplyConfig{PlanOptionID: " ok "}).planOption(); got != "ok" {
		t.Fatalf("trim: %q", got)
	}
}

func TestAutoReplyCursorExtension_createPlan(t *testing.T) {
	res := autoReplyCursorExtension("cursor/create_plan", nil, AutoReplyConfig{})
	m, ok := res.(map[string]interface{})
	if !ok {
		t.Fatalf("type %T", res)
	}
	out, _ := json.Marshal(m)
	if !json.Valid(out) {
		t.Fatal("invalid json")
	}
}

func TestAutoReplyAskQuestion(t *testing.T) {
	params := []byte(`{"options":[{"id":"a"},{"id":"b"}]}`)
	res := autoReplyAskQuestion(params, 1)
	m := res.(map[string]interface{})
	outcome := m["outcome"].(map[string]interface{})
	if outcome["optionId"] != "b" {
		t.Fatalf("optionId=%v", outcome["optionId"])
	}
}

func TestAutoReplyAskQuestion_choices(t *testing.T) {
	params := []byte(`{"choices":[{"id":"x"}]}`)
	res := autoReplyAskQuestion(params, 0)
	m := res.(map[string]interface{})
	outcome := m["outcome"].(map[string]interface{})
	if outcome["optionId"] != "x" {
		t.Fatalf("got %v", outcome["optionId"])
	}
}

func TestAutoReplyElicitation_form(t *testing.T) {
	params := []byte(`{"mode":"form","sessionId":"s1","message":"m","requestedSchema":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}}`)
	res := autoReplyElicitation(params, AutoReplyConfig{})
	if res["action"] != "accept" {
		t.Fatalf("action=%v", res["action"])
	}
	content := res["content"].(map[string]interface{})
	if content["name"] != "" {
		t.Fatalf("name=%v", content["name"])
	}
}

func TestAutoReplyElicitation_url(t *testing.T) {
	params := []byte(`{"mode":"url","sessionId":"s1","message":"m","url":"https://example.com"}`)
	res := autoReplyElicitation(params, AutoReplyConfig{})
	if res["action"] != "decline" {
		t.Fatalf("default url action=%v", res["action"])
	}
	res2 := autoReplyElicitation(params, AutoReplyConfig{ElicitationURLAction: "accept"})
	if res2["action"] != "accept" {
		t.Fatalf("accept=%v", res2["action"])
	}
}

func TestElicitationDefaultsFromSchema_enum(t *testing.T) {
	schema := []byte(`{"type":"object","properties":{"pick":{"type":"string","enum":["one","two"]}}}`)
	got := elicitationDefaultsFromSchema(schema)
	if got["pick"] != "one" {
		t.Fatalf("pick=%v", got["pick"])
	}
}
