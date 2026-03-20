package agent

import (
	"context"
	"fmt"
	"strings"
)

// StudioTaskCompleteToken 子 Agent 在工作室委派任务全部完成时须在回复首行输出此标记（大小写不敏感匹配）
const StudioTaskCompleteToken = "__STUDIO_TASK_COMPLETE__"

// studioAutonomousMaxOuterRounds 工作室子任务外循环上限：每轮内仍有最多 DefaultToolLoopMaxRounds 次工具调用
const studioAutonomousMaxOuterRounds = 10

func studioOutputDeclaresTaskComplete(reply string) bool {
	return strings.Contains(strings.ToUpper(reply), strings.ToUpper(StudioTaskCompleteToken))
}

// processStudioDelegatedTask 在工作室异步委派下，驱动子 Agent 多轮 Process，直到声明完成或达到外循环上限
func (a *agentImpl) processStudioDelegatedTask(ctx context.Context, initial string) (string, error) {
	userMsg := strings.TrimSpace(initial)
	if userMsg == "" {
		return "", fmt.Errorf("empty delegated task")
	}
	var lastReply string
	for round := 0; round < studioAutonomousMaxOuterRounds; round++ {
		reply, err := a.Process(ctx, userMsg)
		if err != nil {
			return "", err
		}
		lastReply = reply
		if studioOutputDeclaresTaskComplete(reply) {
			return reply, nil
		}
		if round == studioAutonomousMaxOuterRounds-1 {
			break
		}
		userMsg = fmt.Sprintf(
			"[工作室自动续跑 %d/%d] 上一轮未声明任务完成。请继续调用工具（技能、MCP、%s 等）推进，直至委派目标达成；若已全部完成，请在回复第一行单独输出 %s，然后空一行写总结。\n\n（上一轮摘录）\n%s",
			round+2,
			studioAutonomousMaxOuterRounds,
			DelegateToSubAgentToolName,
			StudioTaskCompleteToken,
			previewTaskText(reply),
		)
	}
	return lastReply, nil
}
