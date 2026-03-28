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
// 若含 command，表示直接执行该命令（以技能目录为工作目录），将 tool 的 arguments 作为标准输入传入，返回标准输出。
// 若 command_llm_fallback_exit 为正整数 N，且命令以退出码 N 结束，则忽略命令错误并回退为
// 用 Content 作为系统提示对 userInput 做一次子轮 LLM（用于「可脚本落盘 / 可纯对话」双模式技能）。
type Skill struct {
	Name                   string `yaml:"name" json:"name"`
	Description            string `yaml:"description" json:"description"` // 用于触发加载，建议 ≤1024 字符
	RuleChainID            string `yaml:"rule_chain_id" json:"rule_chain_id"` // 可选，关联规则链 ID，非空时执行规则链
	Command                string `yaml:"command" json:"command"`             // 可选，直接执行的命令（如 scripts/trace_api.sh），以 Dir 为工作目录，arguments 传 stdin
	CommandLLMFallbackExit int    `yaml:"command_llm_fallback_exit" json:"command_llm_fallback_exit"` // 可选，命令退出码 N 时回退 LLM；0 表示禁用
	Content                string `json:"content"`                            // 完整 SKILL.md 正文（含 frontmatter 后的 markdown）
	Dir                    string `json:"dir"`                                // 技能所在目录（含 SKILL.md 的目录），加载时填充，用于 command 的 cwd
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
		s.Dir = filepath.Dir(path)
		if s.Name != "" || s.Description != "" || s.Content != "" || s.Command != "" {
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
	dir = strings.TrimSpace(dir)
	path := filepath.Join(dir, skillFileName)
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
	s.Dir = dir
	if s.Name == "" && s.Description == "" && s.Content == "" && s.Command == "" {
		return nil, nil
	}
	return s, nil
}

// parseSkillFrontmatterLoose 在 YAML 严格解析失败时使用：按行提取 name / description / rule_chain_id。
// 兼容旧版手写 frontmatter：description 单行内含有「: 」等字符时 yaml.Unmarshal 会报错（如 "Required parameter: query"）。
func parseSkillFrontmatterLoose(front string) (name, description, ruleChainID string, ok bool) {
	front = strings.ReplaceAll(strings.TrimSpace(front), "\r\n", "\n")
	for _, line := range strings.Split(front, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		switch {
		case strings.HasPrefix(trimmed, "name:"):
			name = strings.TrimSpace(strings.TrimPrefix(trimmed, "name:"))
		case strings.HasPrefix(trimmed, "rule_chain_id:"):
			ruleChainID = strings.TrimSpace(strings.TrimPrefix(trimmed, "rule_chain_id:"))
		case strings.HasPrefix(trimmed, "description:"):
			description = strings.TrimSpace(strings.TrimPrefix(trimmed, "description:"))
		}
	}
	ok = name != "" || description != "" || ruleChainID != ""
	return name, description, ruleChainID, ok
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
			n, d, r, ok := parseSkillFrontmatterLoose(front)
			if !ok {
				return s, err
			}
			s.Name = n
			s.Description = d
			s.RuleChainID = r
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
