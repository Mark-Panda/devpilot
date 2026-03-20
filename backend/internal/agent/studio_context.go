package agent

import (
	"context"
	"strings"
)

type studioCtxKey struct{}

// WithStudioID 将工作室 ID 写入 context，供委派链路与进度上报使用
func WithStudioID(ctx context.Context, studioID string) context.Context {
	id := strings.TrimSpace(studioID)
	if id == "" {
		return ctx
	}
	return context.WithValue(ctx, studioCtxKey{}, id)
}

// StudioIDFromContext 读取当前对话所属工作室；非工作室对话返回空串
func StudioIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(studioCtxKey{}).(string)
	return strings.TrimSpace(v)
}
