package llm

import (
	"os"
	"path/filepath"
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
