package backend

import "devpilot/backend/internal/agent"

// 工作室相关类型别名，供 Wails 绑定与前端生成 TS 类型

type (
	Studio               = agent.Studio
	StudioDetail         = agent.StudioDetail
	StudioProgressEvent  = agent.StudioProgressEvent
	StudioAssistantPush  = agent.StudioAssistantPush
	StudioTodoItem       = agent.StudioTodoItem
	StudioTodoBoardRow   = agent.StudioTodoBoardRow
)
