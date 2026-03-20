package backend

import (
	"context"

	"devpilot/backend/internal/agent"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// BindStudioProgressEvents 将工作室进度事件推到 Wails 前端（topic: studio:progress）
func BindStudioProgressEvents(ctx context.Context, svc *agent.Service) {
	if svc == nil || ctx == nil {
		return
	}
	svc.SetStudioProgressEmitter(func(ev agent.StudioProgressEvent) {
		runtime.EventsEmit(ctx, "studio:progress", ev)
	})
}

// BindStudioAssistantEvents 将工作室主 Agent 自动续跑回复推到前端（topic: studio:assistant）
func BindStudioAssistantEvents(ctx context.Context, svc *agent.Service) {
	if svc == nil || ctx == nil {
		return
	}
	svc.SetStudioChatEmitter(func(ev agent.StudioAssistantPush) {
		runtime.EventsEmit(ctx, "studio:assistant", ev)
	})
}
