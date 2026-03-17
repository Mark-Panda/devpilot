package llm

import "context"

// RuleChainExecutor 当技能带 rule_chain_id 时，用此回调执行规则链并返回结果。由业务层（如 rulego.Service）注入。
var RuleChainExecutor func(ctx context.Context, ruleChainID string, userInput string) (string, error)

// skillExecutor 实现 ToolExecutor：当模型返回 tool_call 且 name 为某技能名时，
// 若技能有 rule_chain_id 则执行规则链，否则用 Content 做一次子轮 LLM 调用。
type skillExecutor struct {
	client *Client
	skills []Skill
}

// NewSkillExecutor 返回一个 ToolExecutor，用于在 GenerateWithToolLoop 中执行“技能调用”。
// 执行时：按 name 查找技能；若技能有 RuleChainID 则调用 RuleChainExecutor；否则以 Content 为系统提示、arguments 为用户输入调用 client。
func NewSkillExecutor(client *Client, skills []Skill) ToolExecutor {
	if client == nil || len(skills) == 0 {
		return nil
	}
	return &skillExecutor{client: client, skills: skills}
}

// Execute 实现 ToolExecutor。根据 name 查找技能；若为规则链技能则执行规则链，否则做一次子轮 LLM 对话。
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
	if skill.RuleChainID != "" && RuleChainExecutor != nil {
		return RuleChainExecutor(ctx, skill.RuleChainID, userInput)
	}
	return e.client.ChatWithSystem(ctx, skill.Content, userInput)
}
