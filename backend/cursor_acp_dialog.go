package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"unicode/utf8"

	"devpilot/backend/internal/cursoracp"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// CursorACPAfterRoundEvent 推送给前端的弹窗数据（topic: cursor-acp:after-round）。
type CursorACPAfterRoundEvent struct {
	RequestID      string `json:"request_id"`
	RuleID         string `json:"rule_id"`
	RuleName       string `json:"rule_name"`
	ExecutionID    string `json:"execution_id"`
	Round          int    `json:"round"`
	MaxRounds      int    `json:"max_rounds"`
	SessionID      string `json:"session_id"`
	Cwd            string `json:"cwd"`
	LastStreamText string `json:"last_stream_text"`
}

type acpAfterRoundWait struct {
	next      string
	stop      bool
	endMarker bool // stop 为 true 且为 true 时 StopReason=end_marker，否则 user_end
}

// CursorACPAskQuestionEvent topic: cursor-acp:ask-question
type CursorACPAskQuestionEvent struct {
	RequestID   string               `json:"request_id"`
	RuleID      string               `json:"rule_id"`
	RuleName    string               `json:"rule_name"`
	ExecutionID string               `json:"execution_id"`
	Title       string               `json:"title"`
	Options     []CursorACPAskOption `json:"options"`
}

// CursorACPAskOption 问答选项（展示 id + 文案）。
type CursorACPAskOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

var (
	acpDialogMu       sync.Mutex
	acpWailsCtx       context.Context
	acpPending        = map[string]chan acpAfterRoundWait{}
	acpAskPending     = map[string]chan string{} // 收到 optionId，空串表示走节点自动下标
	acpRequestSeq     atomic.Uint64
	acpAskRequestSeq  atomic.Uint64
	acpPreviewRunes   = 8000
)

// BindCursorACPAfterRoundDialog 在 Wails OnStartup 调用：注册 cursoracp 每轮结束后的弹窗桥接。
func BindCursorACPAfterRoundDialog(ctx context.Context) {
	if ctx == nil {
		return
	}
	acpDialogMu.Lock()
	acpWailsCtx = ctx
	acpDialogMu.Unlock()
	cursoracp.SetAfterRoundHook(acpWailsAfterRoundHook)
	cursoracp.SetAskQuestionGlobalPicker(wailsPickAskQuestion)
}

// ClearCursorACPAfterRoundDialogs 关闭时将所有等待中的请求视为「结束对话」，避免 Go 侧永久阻塞。
func ClearCursorACPAfterRoundDialogs() {
	acpDialogMu.Lock()
	defer acpDialogMu.Unlock()
	for id, ch := range acpPending {
		select {
		case ch <- acpAfterRoundWait{stop: true, endMarker: false}:
		default:
		}
		delete(acpPending, id)
	}
	for id, ch := range acpAskPending {
		select {
		case ch <- "":
		default:
		}
		delete(acpAskPending, id)
	}
	acpWailsCtx = nil
	cursoracp.SetAfterRoundHook(nil)
	cursoracp.SetAskQuestionGlobalPicker(nil)
}

// ResolveCursorACPAfterRound 由前端在用户操作弹窗后调用；request_id 与事件中一致。
// stop 为 false 时发送 nextPrompt 继续下一轮；stop 为 true 时结束循环，endMarker 为 true 则 StopReason=end_marker（完成标记结束），否则 user_end（主动结束）。
func ResolveCursorACPAfterRound(requestID string, nextPrompt string, stop bool, endMarker bool) {
	id := trimACPRequestID(requestID)
	if id == "" {
		return
	}
	acpDialogMu.Lock()
	ch := acpPending[id]
	if ch != nil {
		delete(acpPending, id)
	}
	acpDialogMu.Unlock()
	if ch == nil {
		return
	}
	select {
	case ch <- acpAfterRoundWait{next: nextPrompt, stop: stop, endMarker: endMarker && stop}:
	default:
	}
}

func trimACPRequestID(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	return s
}

func acpWailsAfterRoundHook(ctx context.Context, info cursoracp.AfterRoundInfo) (cursoracp.AfterRoundOutcome, error) {
	acpDialogMu.Lock()
	wailsCtx := acpWailsCtx
	acpDialogMu.Unlock()
	if wailsCtx == nil {
		return cursoracp.AfterRoundOutcome{}, fmt.Errorf("cursor ACP 弹窗未绑定（非桌面启动或未调用 BindCursorACPAfterRoundDialog）")
	}

	id := fmt.Sprintf("acp-%d", acpRequestSeq.Add(1))
	ch := make(chan acpAfterRoundWait, 1)

	acpDialogMu.Lock()
	acpPending[id] = ch
	acpDialogMu.Unlock()

	defer func() {
		acpDialogMu.Lock()
		if acpPending[id] == ch {
			delete(acpPending, id)
		}
		acpDialogMu.Unlock()
	}()

	ev := CursorACPAfterRoundEvent{
		RequestID:      id,
		RuleID:         strings.TrimSpace(info.RuleID),
		RuleName:       strings.TrimSpace(info.RuleName),
		ExecutionID:    strings.TrimSpace(info.ExecutionID),
		Round:          info.Round,
		MaxRounds:      info.MaxRounds,
		SessionID:      info.SessionID,
		Cwd:            info.Cwd,
		LastStreamText: truncateACPPreview(info.LastStreamText, acpPreviewRunes),
	}
	runtime.EventsEmit(wailsCtx, "cursor-acp:after-round", ev)

	select {
	case <-ctx.Done():
		return cursoracp.AfterRoundOutcome{Stop: true, StopReason: "user_end"}, ctx.Err()
	case r := <-ch:
		if r.stop {
			sr := "user_end"
			if r.endMarker {
				sr = "end_marker"
			}
			return cursoracp.AfterRoundOutcome{Stop: true, StopReason: sr}, nil
		}
		return cursoracp.AfterRoundOutcome{NextPrompt: r.next}, nil
	}
}

// ResolveCursorACPAskQuestion 用户选定 optionId；optionId 为空表示使用节点 autoAskQuestionOptionIndex。
func ResolveCursorACPAskQuestion(requestID string, optionID string) {
	id := trimACPRequestID(requestID)
	if id == "" {
		return
	}
	acpDialogMu.Lock()
	ch := acpAskPending[id]
	if ch != nil {
		delete(acpAskPending, id)
	}
	acpDialogMu.Unlock()
	if ch == nil {
		return
	}
	select {
	case ch <- strings.TrimSpace(optionID):
	default:
	}
}

func wailsPickAskQuestion(ctx context.Context, params json.RawMessage, task cursoracp.DialogTask) (string, error) {
	acpDialogMu.Lock()
	wailsCtx := acpWailsCtx
	acpDialogMu.Unlock()
	if wailsCtx == nil {
		return "", fmt.Errorf("cursor ACP 问答弹窗未绑定")
	}

	id := fmt.Sprintf("acp-ask-%d", acpAskRequestSeq.Add(1))
	ch := make(chan string, 1)

	acpDialogMu.Lock()
	acpAskPending[id] = ch
	acpDialogMu.Unlock()

	defer func() {
		acpDialogMu.Lock()
		if acpAskPending[id] == ch {
			delete(acpAskPending, id)
		}
		acpDialogMu.Unlock()
	}()

	title, optViews := cursoracp.ParseAskQuestionUI(params)
	ev := CursorACPAskQuestionEvent{
		RequestID:   id,
		RuleID:      strings.TrimSpace(task.RuleID),
		RuleName:    strings.TrimSpace(task.RuleName),
		ExecutionID: strings.TrimSpace(task.ExecutionID),
		Title:       title,
		Options:     make([]CursorACPAskOption, 0, len(optViews)),
	}
	for _, o := range optViews {
		ev.Options = append(ev.Options, CursorACPAskOption{ID: o.ID, Label: o.Label})
	}
	runtime.EventsEmit(wailsCtx, "cursor-acp:ask-question", ev)

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case r := <-ch:
		return r, nil
	}
}

func truncateACPPreview(s string, maxRunes int) string {
	if maxRunes <= 0 || utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	r := []rune(s)
	if len(r) <= maxRunes {
		return s
	}
	return string(r[:maxRunes]) + "\n\n…（输出已截断，完整内容在规则链 metadata cursor_acp_last_stream_text）"
}
