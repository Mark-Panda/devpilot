package llm

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseSkillMD(t *testing.T) {
	data := []byte(`---
name: test-skill
description: Use when you need to test something.
---

# Test Skill

Do this and that.
`)
	s, err := parseSkillMD(data)
	if err != nil {
		t.Fatal(err)
	}
	if s.Name != "test-skill" {
		t.Errorf("name: got %q", s.Name)
	}
	if s.Description != "Use when you need to test something." {
		t.Errorf("description: got %q", s.Description)
	}
	if s.Content != "# Test Skill\n\nDo this and that." {
		t.Errorf("content: got %q", s.Content)
	}
}

// 旧版规则链技能曾把 description 写成未加引号的单行 YAML，其中含「Required parameter: query」等子串会破坏 yaml.Unmarshal。
func TestParseSkillMD_looseFallbackWhenDescriptionContainsColon(t *testing.T) {
	data := []byte(`---
name: query-channel-platform-server-logs
description: Query Volcano TLS logs for the channel-platform-server service. Use when users need to search, retrieve, or analyze logs from the channel-platform-server service in Volcano Cloud TLS. Required parameter: query (string, required) - the Volcano Cloud log query statement to execute.
rule_chain_id: 4c4d581e-f80a-4ba9-89e6-ccb3c1be23c2
---

# Body
`)
	s, err := parseSkillMD(data)
	if err != nil {
		t.Fatalf("expected loose fallback, got err: %v", err)
	}
	if s.Name != "query-channel-platform-server-logs" {
		t.Errorf("name: %q", s.Name)
	}
	if !strings.Contains(s.Description, "Required parameter: query") {
		t.Errorf("description should preserve colon phrase, got: %q", s.Description)
	}
	if s.RuleChainID != "4c4d581e-f80a-4ba9-89e6-ccb3c1be23c2" {
		t.Errorf("rule_chain_id: %q", s.RuleChainID)
	}
}

func TestLoadSkills_emptyDir(t *testing.T) {
	dir := t.TempDir()
	skills, err := LoadSkills(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 0 {
		t.Errorf("expected 0 skills, got %d", len(skills))
	}
}

func TestLoadSkills_oneFile(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "myskill")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}
	content := `---
name: my-skill
description: My description.
---

# Body
`
	if err := os.WriteFile(filepath.Join(sub, "SKILL.md"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	skills, err := LoadSkills(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill, got %d", len(skills))
	}
	if skills[0].Name != "my-skill" || skills[0].Description != "My description." {
		t.Errorf("skill: %+v", skills[0])
	}
}

func TestBuildSkillSystemPrompt(t *testing.T) {
	skills := []Skill{
		{Name: "a", Description: "Desc A", Content: "Content A"},
	}
	out := BuildSkillSystemPrompt(skills, true)
	if out == "" {
		t.Error("expected non-empty prompt")
	}
	if len(out) > 0 && (out[:2] != "##" || len(out) < 20) {
		t.Errorf("unexpected prompt: %s", out)
	}
}
