package rulego

import (
	"os"
	"path/filepath"
	"testing"

	"devpilot/backend/internal/llm"
)

func TestBuildSkillMDContent_YAMLParsesWithColons(t *testing.T) {
	body := "## Steps\n\nRun chain."
	desc := `Query logs when: service is "channel-platform-server" — use **Volc TLS**; params: time range, keyword.`
	md := buildSkillMDContent("query-channel-platform-server-logs", desc, body, "4c4d581e-f80a-4ba9-89e6-ccb3c1be23c2")

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(md), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := llm.LoadSkillFromDir(dir)
	if err != nil {
		t.Fatalf("LoadSkillFromDir: %v\n--- file ---\n%s", err, md)
	}
	if s == nil {
		t.Fatal("expected skill")
	}
	if s.Name != "query-channel-platform-server-logs" {
		t.Errorf("name: %q", s.Name)
	}
	if s.Description != desc {
		t.Errorf("description mismatch:\ngot: %q", s.Description)
	}
	if s.RuleChainID != "4c4d581e-f80a-4ba9-89e6-ccb3c1be23c2" {
		t.Errorf("rule_chain_id: %q", s.RuleChainID)
	}
	if s.Content != body {
		t.Errorf("content: %q", s.Content)
	}
}

func TestYamlScalarFallback(t *testing.T) {
	raw := "a\"b\\c\nd:e"
	q := yamlScalarFallback(raw)
	if q != `"a\"b\\c\nd:e"` {
		t.Errorf("got %q", q)
	}
}
