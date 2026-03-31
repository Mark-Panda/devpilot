package cursoracp

import (
	"context"
	"encoding/json"
	"sync"
)

var (
	askQuestionGlobalMu sync.RWMutex
	askQuestionGlobalFn func(ctx context.Context, params json.RawMessage, task DialogTask) (optionID string, err error)
)

// SetAskQuestionGlobalPicker 由桌面进程注册；与节点 useAskQuestionDialog 联用。
func SetAskQuestionGlobalPicker(fn func(ctx context.Context, params json.RawMessage, task DialogTask) (optionID string, err error)) {
	askQuestionGlobalMu.Lock()
	defer askQuestionGlobalMu.Unlock()
	askQuestionGlobalFn = fn
}

// AskQuestionGlobalPicker 返回已注册的弹窗选择器；未注册时为 nil。
func AskQuestionGlobalPicker() func(ctx context.Context, params json.RawMessage, task DialogTask) (string, error) {
	askQuestionGlobalMu.RLock()
	defer askQuestionGlobalMu.RUnlock()
	return askQuestionGlobalFn
}
