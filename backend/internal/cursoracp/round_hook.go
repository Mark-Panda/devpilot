package cursoracp

import (
	"context"
	"sync"
)

// AfterRoundInfo 单轮 session/prompt 完成后的上下文，供宿主决定下一轮输入或结束。
type AfterRoundInfo struct {
	DialogTask
	Round          int
	MaxRounds      int
	SessionID      string
	Cwd            string
	LastStreamText string
	LastPrompt     *PromptResult
}

// AfterRoundOutcome 每轮结束后的决策：继续下一轮或成功结束（StopReason 见 RunAgentLoop）。
type AfterRoundOutcome struct {
	// NextPrompt 继续下一轮时发送的文本；可与空字符串配合由循环回退到 ContinuationPrompt。
	NextPrompt string
	// Stop 为 true 时结束循环并成功 TellSuccess；StopReason 取 StopReason 字段。
	Stop bool
	// StopReason 在 Stop 为 true 时有效：user_end（用户结束对话）或 end_marker（结束标记语义，原流式检测已迁至 UI）。
	StopReason string
}

// AfterRoundFunc 由宿主实现（如 Wails 弹窗）；返回错误时整轮循环失败。
type AfterRoundFunc func(ctx context.Context, info AfterRoundInfo) (AfterRoundOutcome, error)

var (
	afterRoundMu sync.RWMutex
	afterRoundFn AfterRoundFunc
)

// SetAfterRoundHook 由桌面进程注册（如 Wails 启动时）。与 RuleGo 节点配置 useRegisteredAfterRoundHook 联用。
func SetAfterRoundHook(fn AfterRoundFunc) {
	afterRoundMu.Lock()
	defer afterRoundMu.Unlock()
	afterRoundFn = fn
}

// AfterRoundHook 返回当前注册的回调；未注册时为 nil。
func AfterRoundHook() AfterRoundFunc {
	afterRoundMu.RLock()
	defer afterRoundMu.RUnlock()
	return afterRoundFn
}
