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
	Studio       Studio      `json:"studio"`
	MemberAgents []AgentInfo `json:"member_agents"`
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
