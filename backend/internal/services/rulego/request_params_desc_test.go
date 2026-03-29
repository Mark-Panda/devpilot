package rulego

import (
	"strings"
	"testing"
)

func TestFormatRuleChainParamsForSkillDescription(t *testing.T) {
	meta := `[{"key":"trace_id","value":"","type":"string","required":true,"description":"链路 ID"}]`
	body := `[{"key":"count","value":"0","type":"number","required":false,"description":"数量"}]`
	out := formatRuleChainParamsForSkillDescription(meta, body, "")
	if out == "" {
		t.Fatal("expected non-empty")
	}
	for _, sub := range []string{"trace_id", "string", "必填", "count", "number", "元数据", "消息体"} {
		if !strings.Contains(out, sub) {
			t.Fatalf("missing %q in output: %q", sub, out)
		}
	}
}

func TestFormatRuleChainParamsForSkillDescription_empty(t *testing.T) {
	if formatRuleChainParamsForSkillDescription("", "", "") != "" {
		t.Fatal("expected empty")
	}
}

func TestFormatRuleChainParamsForSkillDescription_responseBody(t *testing.T) {
	resp := `[{"key":"result","value":"","type":"object","required":true,"description":"业务结果"}]`
	out := formatRuleChainParamsForSkillDescription("", "", resp)
	if !strings.Contains(out, "响应消息体") || !strings.Contains(out, "result") {
		t.Fatalf("expected response section: %q", out)
	}
}
