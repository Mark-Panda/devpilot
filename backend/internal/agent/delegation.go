package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"devpilot/backend/internal/llm"
	"github.com/tmc/langchaingo/llms"
)

const (
	// DelegateToSubAgentToolName 主/父 Agent 通过 function calling 派发任务给子 Agent（与技能/MCP 并列）
	DelegateToSubAgentToolName = "devpilot_delegate_to_sub_agent"
	defaultDelegateTimeout     = 15 * time.Minute
)

type delegateRPCResult struct {
	text string
	err  error
}

var delegateToolParams = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"sub_agent_id": map[string]any{
			"type":        "string",
			"description": "子 Agent 的 id（与系统提示【下属子 Agent】中一致）",
		},
		"task": map[string]any{
			"type":        "string",
			"description": "要交给子 Agent 独立完成的具体任务说明（子 Agent 会单独调用模型处理）",
		},
	},
	"required": []string{"sub_agent_id", "task"},
}

func delegateToSubAgentTool() llms.Tool {
	return llms.Tool{
		Type: "function",
		Function: &llms.FunctionDefinition{
			Name: DelegateToSubAgentToolName,
			Description: "将一项任务派发给已注册的子 Agent。子 Agent 会使用自己的模型、技能与记忆独立处理；" +
				"在工作室模式下工具会立即返回（子任务后台执行）；在普通聊天模式下会等待子 Agent 完成后将结果写入观察，你再向用户整合答案。" +
				"仅当 sub_agent_id 确为当前【下属子 Agent】列表中的 id 时方可调用。",
			Parameters: delegateToolParams,
		},
	}
}

// agentToolRouter 先处理委派工具，再交给技能/MCP 合成执行器
type agentToolRouter struct {
	agent *agentImpl
	inner llm.ToolExecutor // 可能为 nil（无技能且无 MCP 时）
}

func (r *agentToolRouter) Execute(ctx context.Context, name, arguments string) (string, error) {
	if name == DelegateToSubAgentToolName {
		return r.agent.executeDelegateTool(ctx, arguments)
	}
	if name == CreateAgentTeamToolName {
		return r.agent.executeCreateAgentTeamTool(ctx, arguments)
	}
	if name == StudioTodoToolName {
		return r.agent.executeStudioTodoTool(ctx, arguments)
	}
	if name == StudioTodoSnapshotToolName {
		return r.agent.executeStudioTodoSnapshotTool(ctx, arguments)
	}
	if r.inner != nil {
		return r.inner.Execute(ctx, name, arguments)
	}
	return "", fmt.Errorf("unknown tool %q", name)
}

func (a *agentImpl) executeDelegateTool(ctx context.Context, arguments string) (string, error) {
	var payload struct {
		SubAgentID string `json:"sub_agent_id"`
		Task       string `json:"task"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(arguments)), &payload); err != nil {
		return "", fmt.Errorf("参数须为 JSON，包含 sub_agent_id 与 task: %w", err)
	}
	return a.delegateToChild(ctx, strings.TrimSpace(payload.SubAgentID), strings.TrimSpace(payload.Task))
}

func (a *agentImpl) delegateToChild(ctx context.Context, childID, task string) (string, error) {
	if childID == "" {
		return "", fmt.Errorf("sub_agent_id 不能为空")
	}
	if task == "" {
		return "", fmt.Errorf("task 不能为空")
	}

	a.mu.RLock()
	ok := a.children[childID]
	a.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("目标不是已注册的子 Agent: %q（请仅使用【下属子 Agent】中的 id）", childID)
	}

	reqID := generateMessageID()
	sid := StudioIDFromContext(ctx)
	childName := childID
	if a.peerLookup != nil {
		if sum, ok := a.peerLookup(childID); ok && strings.TrimSpace(sum.Name) != "" {
			childName = sum.Name
		}
	}
	if sid != "" {
		a.fireStudioProgress(StudioProgressEvent{
			StudioID:      sid,
			Kind:          "delegation_started",
			AgentID:       childID,
			AgentName:     childName,
			ParentAgentID: a.config.ID,
			TaskPreview:   previewTaskText(task),
		})
	}

	msg := Message{
		ID:      reqID,
		Type:    MessageTypeRequest,
		Content: task,
		ToAgent: childID,
	}
	if sid != "" {
		msg.Metadata = map[string]interface{}{"studio_id": sid}
	}
	if err := a.SendMessage(ctx, msg); err != nil {
		if sid != "" {
			a.fireStudioProgress(StudioProgressEvent{
				StudioID:      sid,
				Kind:          "delegation_failed",
				AgentID:       childID,
				AgentName:     childName,
				ParentAgentID: a.config.ID,
				TaskPreview:   previewTaskText(task),
				Error:         err.Error(),
			})
		}
		return "", fmt.Errorf("派发消息失败: %w", err)
	}

	// 工作室：不注册 delegateWaiter，子 Agent 在 messageLoop 的 goroutine 中 Process；主 Agent 立即继续对话
	if sid != "" {
		return fmt.Sprintf(
			"[委派已提交后台] 子 Agent「%s」正在独立处理（左侧「任务进度」会显示开始/完成/失败）。本次工具调用不等待其最终结果；请据此向用户说明可边等进度边继续提问，若需汇总子任务产出可在其完成后再组织答复。",
			childName,
		), nil
	}

	resultCh := make(chan delegateRPCResult, 1)
	a.delegateMu.Lock()
	if a.delegateWaiters == nil {
		a.delegateWaiters = make(map[string]chan delegateRPCResult)
	}
	a.delegateWaiters[reqID] = resultCh
	a.delegateMu.Unlock()

	defer func() {
		a.delegateMu.Lock()
		delete(a.delegateWaiters, reqID)
		a.delegateMu.Unlock()
	}()

	waitCtx, cancel := context.WithTimeout(ctx, defaultDelegateTimeout)
	defer cancel()

	select {
	case res := <-resultCh:
		return res.text, res.err
	case <-waitCtx.Done():
		err := fmt.Errorf("等待子 Agent 响应超时或已取消: %w", waitCtx.Err())
		return "", err
	}
}

// handleStudioAsyncDelegateResult 工作室异步委派：主 Agent 未等待子 Agent 时，由子 Agent 的 Response 触发 delegation_finished / delegation_failed
func (a *agentImpl) handleStudioAsyncDelegateResult(msg Message) bool {
	if msg.Metadata == nil {
		return false
	}
	sid, ok := msg.Metadata["studio_id"].(string)
	if !ok || strings.TrimSpace(sid) == "" {
		return false
	}
	a.mu.RLock()
	_, isChild := a.children[msg.FromAgent]
	a.mu.RUnlock()
	if !isChild {
		return false
	}
	childID := msg.FromAgent
	childName := childID
	if a.peerLookup != nil {
		if sum, ok := a.peerLookup(childID); ok && strings.TrimSpace(sum.Name) != "" {
			childName = sum.Name
		}
	}
	taskPreview := previewTaskText(msg.Content)
	if v, ok := msg.Metadata["task_preview"].(string); ok && strings.TrimSpace(v) != "" {
		taskPreview = v
	}
	content := msg.Content
	const failPrefix = "[子 Agent 处理失败]"
	if strings.HasPrefix(content, failPrefix) {
		errText := strings.TrimSpace(strings.TrimPrefix(content, failPrefix))
		errText = strings.TrimPrefix(errText, ":")
		errText = strings.TrimSpace(errText)
		a.fireStudioProgress(StudioProgressEvent{
			StudioID:      sid,
			Kind:          "delegation_failed",
			AgentID:       childID,
			AgentName:     childName,
			ParentAgentID: a.config.ID,
			TaskPreview:   taskPreview,
			Error:         errText,
		})
		return true
	}
	a.fireStudioProgress(StudioProgressEvent{
		StudioID:      sid,
		Kind:          "delegation_finished",
		AgentID:       childID,
		AgentName:     childName,
		ParentAgentID: a.config.ID,
		TaskPreview:   taskPreview,
		ResultPreview: previewTaskText(content),
	})
	if a.studioSubFinished != nil {
		a.studioSubFinished(a.config.ID, sid, childID, childName, taskPreview, content)
	}
	return true
}

// completeDelegateWait 由 messageLoop 收到子 Agent 的 Response 时调用，唤醒 delegateToChild（非工作室同步委派）
func (a *agentImpl) completeDelegateWait(msg Message) bool {
	reqID := ""
	if msg.Metadata != nil {
		if v, ok := msg.Metadata["request_id"].(string); ok {
			reqID = strings.TrimSpace(v)
		}
	}
	if reqID == "" {
		return false
	}

	a.delegateMu.Lock()
	ch, ok := a.delegateWaiters[reqID]
	if ok {
		delete(a.delegateWaiters, reqID)
	}
	a.delegateMu.Unlock()
	if !ok {
		return false
	}

	res := delegateRPCResult{text: msg.Content}
	select {
	case ch <- res:
	default:
	}
	return true
}
