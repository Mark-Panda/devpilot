package llm

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/tmc/langchaingo/llms"
	"gopkg.in/yaml.v3"
)

// Skill 表示从 SKILL.md 解析出的技能（参考 claude-code / openclaw 的 Universal Skill Loader 格式）。
// 启动时仅加载 name/description 做匹配，激活后再加载完整内容以节省 token。
// 若 frontmatter 含 rule_chain_id，表示该技能为“规则链技能”，执行时调用规则链而非 LLM。
type Skill struct {
	Name         string `yaml:"name" json:"name"`
	Description  string `yaml:"description" json:"description"`   // 用于触发加载，建议 ≤1024 字符
	RuleChainID  string `yaml:"rule_chain_id" json:"rule_chain_id"` // 可选，关联规则链 ID，非空时执行规则链
	Content      string `json:"content"`                          // 完整 SKILL.md 正文（含 frontmatter 后的 markdown）
}

const skillFileName = "SKILL.md"

// LoadSkills 从 dir 下递归查找 SKILL.md，解析 YAML frontmatter（name, description）与正文。
// 返回所有解析成功的技能列表。若目录不存在或为空，返回 nil 且无错误。
func LoadSkills(dir string) ([]Skill, error) {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return nil, nil
	}
	info, err := os.Stat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	if !info.IsDir() {
		return nil, nil
	}

	var skills []Skill
	err = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if info.Name() != skillFileName {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		s, err := parseSkillMD(data)
		if err != nil {
			return nil // 单文件解析失败则跳过，不中断整个扫描
		}
		if s.Name != "" || s.Description != "" || s.Content != "" {
			skills = append(skills, *s)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return skills, nil
}

// LoadSkillFromDir 从指定目录加载单个技能（读取 dir/SKILL.md）。若目录不存在或无有效 SKILL.md 则返回 nil, nil。
func LoadSkillFromDir(dir string) (*Skill, error) {
	path := filepath.Join(strings.TrimSpace(dir), skillFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	s, err := parseSkillMD(data)
	if err != nil {
		return nil, err
	}
	if s.Name == "" && s.Description == "" && s.Content == "" {
		return nil, nil
	}
	return s, nil
}

// parseSkillMD 解析 SKILL.md 内容：首段为 YAML frontmatter（---...---），其余为 Content。
func parseSkillMD(data []byte) (*Skill, error) {
	content := string(data)
	parts := strings.SplitN(content, "---", 3)
	var front string
	var body string
	switch len(parts) {
	case 1:
		body = strings.TrimSpace(parts[0])
	case 2:
		body = strings.TrimSpace(parts[1])
	case 3:
		front = strings.TrimSpace(parts[1])
		body = strings.TrimSpace(parts[2])
	}

	s := &Skill{Content: body}
	if front != "" {
		if err := yaml.Unmarshal([]byte(front), s); err != nil {
			return s, err // 仍返回已有 body
		}
	}
	return s, nil
}

// FilterSkillsByNames 只保留 name 在 names 中的技能（names 为空则返回原列表，表示全部启用）。
func FilterSkillsByNames(skills []Skill, names []string) []Skill {
	if len(names) == 0 {
		return skills
	}
	set := make(map[string]bool, len(names))
	for _, n := range names {
		set[strings.TrimSpace(n)] = true
	}
	var out []Skill
	for _, s := range skills {
		if set[s.Name] {
			out = append(out, s)
		}
	}
	return out
}

// skillToolParams 技能作为 tool 时的参数 schema，供模型传入输入/上下文
var skillToolParams = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"input": map[string]any{
			"type":        "string",
			"description": "Input or context for this skill (e.g. user request, task description)",
		},
	},
}

// SkillsToTools 将技能列表转为 langchaingo 的 llms.Tool，供 WithTools 与 GenerateWithToolLoop 使用。
// 模型返回 tool_calls 时，可通过 ToolExecutor（如 NewSkillExecutor）真正执行对应技能。
func SkillsToTools(skills []Skill) []llms.Tool {
	if len(skills) == 0 {
		return nil
	}
	tools := make([]llms.Tool, 0, len(skills))
	for i := range skills {
		s := &skills[i]
		tools = append(tools, llms.Tool{
			Type: "function",
			Function: &llms.FunctionDefinition{
				Name:        s.Name,
				Description: s.Description,
				Parameters:  skillToolParams,
			},
		})
	}
	return tools
}

// BuildSkillSystemPrompt 将已加载的 skills 拼成一段系统提示，供 LLM 使用。
// 若 onlyDescriptions 为 true，仅拼接 name+description（节省 token）；否则拼接完整 Content。
func BuildSkillSystemPrompt(skills []Skill, onlyDescriptions bool) string {
	if len(skills) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("## Available skills\n\n")
	for i := range skills {
		s := &skills[i]
		b.WriteString("### ")
		b.WriteString(s.Name)
		b.WriteString("\n")
		b.WriteString("- **Description**: ")
		b.WriteString(s.Description)
		b.WriteString("\n\n")
		if !onlyDescriptions && s.Content != "" {
			b.WriteString(s.Content)
			b.WriteString("\n\n")
		}
	}
	return strings.TrimSpace(b.String())
}
