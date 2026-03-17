package llm

import "context"

// skillExecutor 实现 ToolExecutor：当模型返回 tool_call 且 name 为某技能名时，
// 用该技能的 Content 作为 system、arguments 作为 user 做一次子轮 LLM 调用，返回结果。
type skillExecutor struct {
	client *Client
	skills []Skill
}

// NewSkillExecutor 返回一个 ToolExecutor，用于在 GenerateWithToolLoop 中执行“技能调用”。
// 执行时：按 name 查找技能，以技能 Content 为系统提示、arguments 为用户输入，调用 client 生成并返回。
func NewSkillExecutor(client *Client, skills []Skill) ToolExecutor {
	if client == nil || len(skills) == 0 {
		return nil
	}
	return &skillExecutor{client: client, skills: skills}
}

// Execute 实现 ToolExecutor。根据 name 查找技能，用技能正文做一次子轮对话，返回模型回复。
func (e *skillExecutor) Execute(ctx context.Context, name, arguments string) (string, error) {
	var skill *Skill
	for i := range e.skills {
		if e.skills[i].Name == name {
			skill = &e.skills[i]
			break
		}
	}
	if skill == nil {
		return "", ErrSkillNotFound
	}
	userInput := arguments
	if userInput == "" {
		userInput = "(no input)"
	}
	return e.client.ChatWithSystem(ctx, skill.Content, userInput)
}
