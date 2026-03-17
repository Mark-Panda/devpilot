package backend

import (
	"context"
	"errors"
	"log"

	"devpilot/backend/internal/llm"
	"devpilot/backend/internal/services/rulego"
)

// InitRuleChainExecutor 将规则链执行能力注入到 LLM 技能执行器，使带 rule_chain_id 的技能被调用时执行对应规则链。
func InitRuleChainExecutor(r *Runtime) {
	if r == nil {
		return
	}
	svc, ok := r.RuleGoService().(*rulego.Service)
	if !ok {
		return
	}
	llm.RuleChainExecutor = func(ctx context.Context, ruleChainID string, userInput string) (string, error) {
		log.Printf("[rulechain] 执行规则链 ruleChainID=%s inputLen=%d", ruleChainID, len(userInput))
		out, err := svc.ExecuteRule(ruleChainID, rulego.ExecuteRuleInput{Data: userInput})
		if err != nil {
			log.Printf("[rulechain] 执行规则链失败 ruleChainID=%s err=%v", ruleChainID, err)
			return "", err
		}
		if !out.Success {
			log.Printf("[rulechain] 规则链执行返回失败 ruleChainID=%s error=%s", ruleChainID, out.Error)
			return "", errors.New(out.Error)
		}
		log.Printf("[rulechain] 规则链执行完成 ruleChainID=%s elapsed=%dms", ruleChainID, out.Elapsed)
		return out.Data, nil
	}
	log.Printf("[rulechain] RuleChainExecutor 已注入")
}
