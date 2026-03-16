package llm

import (
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Skill 表示从 SKILL.md 解析出的技能（参考 claude-code / openclaw 的 Universal Skill Loader 格式）。
// 启动时仅加载 name/description 做匹配，激活后再加载完整内容以节省 token。
type Skill struct {
	Name        string `yaml:"name" json:"name"`
	Description string `yaml:"description" json:"description"` // 用于触发加载，建议 ≤1024 字符
	Content     string `json:"content"`                        // 完整 SKILL.md 正文（含 frontmatter 后的 markdown）
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
