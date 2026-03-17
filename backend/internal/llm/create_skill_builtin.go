package llm

import (
	"log"
	"os"
	"path/filepath"
)

// BuiltinCreateSkillName 内置“根据规则链生成技能”技能的名称，大模型通过调用该技能提交生成的 SKILL.md 内容。
const BuiltinCreateSkillName = "create-skill"

// builtinCreateSkillMD 内置 create-skill 的 SKILL.md 内容。
// 大模型根据规则链信息生成 name/description/body 后，通过调用本技能（传入 input 为 JSON）提交，由 executor 写文件。
const builtinCreateSkillMD = `---
name: ` + BuiltinCreateSkillName + `
description: >-
  Create a DevPilot skill file for a rule chain. Use when you are asked to generate
  a SKILL.md for a rule chain. You must call this skill with a JSON object in the
  "input" argument containing: "name" (English, short identifier), "description"
  (English, when to use, ≤512 chars), "body" (markdown, short explanation). The
  rule_chain_id will be set by the system; do not include it in your output.
---

# Create Skill for Rule Chain

When the user provides rule chain info (id, name, description, DSL), analyze the DSL and the purpose of the rule chain, then call this skill with:

- **name**: A short English identifier for the skill (e.g. "my-http-handler", "data-transform").
- **description**: One to three sentences in English describing when to use this skill (for LLM tool selection). Keep under 512 characters.
- **body**: A brief markdown body (1-3 sentences) stating that this skill runs the DevPilot rule chain and that user input is passed as the chain's data.

Output only the JSON for the tool call; do not add extra explanation.
`

// GetBuiltinCreateSkill 返回内置的 create-skill 技能（用于“根据规则链生成技能”流程中供大模型调用）。
func GetBuiltinCreateSkill() (*Skill, error) {
	return parseSkillMD([]byte(builtinCreateSkillMD))
}

// EnsureBuiltinCreateSkillDir 将内置 create-skill 写入 ~/.devpilot/skills/create-skill/SKILL.md（若不存在），
// 便于在技能列表中展示并可被其他流程加载。
func EnsureBuiltinCreateSkillDir() error {
	dir := filepath.Join(DefaultSkillDir(), "create-skill")
	path := filepath.Join(dir, skillFileName)
	if _, err := os.Stat(path); err == nil {
		log.Printf("[llm] 内置 create-skill 已存在 path=%s", path)
		return nil
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("[llm] 创建 create-skill 目录失败 dir=%s err=%v", dir, err)
		return err
	}
	if err := os.WriteFile(path, []byte(builtinCreateSkillMD), 0644); err != nil {
		log.Printf("[llm] 写入 create-skill 失败 path=%s err=%v", path, err)
		return err
	}
	log.Printf("[llm] 已写入内置 create-skill path=%s", path)
	return nil
}
