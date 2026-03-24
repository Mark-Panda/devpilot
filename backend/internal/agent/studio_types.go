package agent

import "time"

// Studio 工作室：绑定一个主 Agent；成员列表由主 Agent 下属树动态计算
type Studio struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	MainAgentID string    `json:"main_agent_id"`
	CreatedAt   time.Time `json:"created_at"`
}

// StudioDetail 工作室 + 当前主 Agent 树下全部成员（含主 Agent，深度优先）
type StudioDetail struct {
	Studio          Studio            `json:"studio"`
	MemberAgents    []AgentInfo       `json:"member_agents"`
	AgentWorkspaces map[string]string `json:"agent_workspaces,omitempty"` // agent_id -> 绝对路径；仅本工作室内覆盖文件工具根
}

// StudioProgressEvent 工作室任务进度（委派、子 Agent 接单与完成）
type StudioProgressEvent struct {
	EntryID       string    `json:"entry_id"`
	StudioID      string    `json:"studio_id"`
	Timestamp     time.Time `json:"timestamp"`
	Kind          string    `json:"kind"` // delegation_started | delegation_finished | delegation_failed | sub_task_accepted | sub_task_finished | sub_task_failed
	AgentID       string    `json:"agent_id"`       // 事件主体 Agent
	AgentName     string    `json:"agent_name"`     // 展示名
	ParentAgentID string    `json:"parent_agent_id,omitempty"`
	TaskPreview   string    `json:"task_preview,omitempty"`
	ResultPreview string    `json:"result_preview,omitempty"`
	Error         string    `json:"error,omitempty"`
}

// StudioAssistantPush 工作室主 Agent 自动续跑产生的新 assistant 消息，供前端追加展示
type StudioAssistantPush struct {
	StudioID string `json:"studio_id"`
	AgentID  string `json:"agent_id"`
	Content  string `json:"content"`
}

// StudioTodoItem 工作室内某 Agent 的 TODO 项（持久化于 studio-todos.json）
type StudioTodoItem struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

// StudioTodoBoardRow 供前端或总览工具展示：某成员及其 TODO
type StudioTodoBoardRow struct {
	AgentID   string           `json:"agent_id"`
	AgentName string           `json:"agent_name"`
	Items     []StudioTodoItem `json:"items"`
}
