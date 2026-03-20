package agent

import (
	"context"
	"time"
)

// AgentType 代理类型
type AgentType string

const (
	AgentTypeMain   AgentType = "main"   // 主代理
	AgentTypeSub    AgentType = "sub"    // 子代理
	AgentTypeWorker AgentType = "worker" // 工作代理
)

// AgentStatus 代理状态
type AgentStatus string

const (
	AgentStatusIdle    AgentStatus = "idle"    // 空闲
	AgentStatusBusy    AgentStatus = "busy"    // 繁忙
	AgentStatusStopped AgentStatus = "stopped" // 已停止
)

// Message 代理间消息
type Message struct {
	ID        string                 `json:"id"`
	FromAgent string                 `json:"from_agent"`
	ToAgent   string                 `json:"to_agent,omitempty"` // 空表示广播
	Type      MessageType            `json:"type"`
	Content   string                 `json:"content"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
}

// MessageType 消息类型
type MessageType string

const (
	MessageTypeRequest  MessageType = "request"  // 请求
	MessageTypeResponse MessageType = "response" // 响应
	MessageTypeEvent    MessageType = "event"    // 事件
	MessageTypeBroadcast MessageType = "broadcast" // 广播
)

// AgentConfig 代理配置
type AgentConfig struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Role         string                 `json:"role"` // 角色说明（展示与注入系统提示；空串也写入注册表）
	Type         AgentType              `json:"type"`
	ParentID     string                 `json:"parent_id,omitempty"`
	ModelConfig  ModelConfig            `json:"model_config"`
	Skills       []string               `json:"skills"`        // 启用的技能名称列表（从全局技能目录勾选）
	MCPServers   []string               `json:"mcp_servers"`   // 启用的 MCP 预设 id 列表
	SystemPrompt string                 `json:"system_prompt"` // 自定义系统提示
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// MCPServerPreset 全局可选 MCP 能力项（供 Agent 勾选；条目来自 ~/.devpilot/mcp.json）
type MCPServerPreset struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// MCPServerDefinition MCP 服务配置（持久化于 ~/.devpilot/mcp.json）
type MCPServerDefinition struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Description   string            `json:"description,omitempty"`
	Enabled       bool              `json:"enabled"`
	ServerCommand []string          `json:"server_command,omitempty"` // stdio：命令 + 参数，如 npx -y @scope/server ...
	ServerURL     string            `json:"server_url,omitempty"`     // 可选：SSE 端点 URL
	Env           map[string]string `json:"env,omitempty"`            // 子进程环境变量
	ToolNames     []string          `json:"tool_names,omitempty"`     // 非空时仅暴露这些工具
}

// ModelConfig 模型配置
type ModelConfig struct {
	BaseURL     string  `json:"base_url"`
	APIKey      string  `json:"api_key"`
	Model       string  `json:"model"`
	MaxTokens   int     `json:"max_tokens"`   // 与注册表一致持久化（含 0）
	Temperature float64 `json:"temperature"` // 与注册表一致持久化（含 0）
}

// AgentInfo 代理运行时信息
type AgentInfo struct {
	Config      AgentConfig `json:"config"`
	Status      AgentStatus `json:"status"`
	CreatedAt   time.Time   `json:"created_at"`
	LastActiveAt time.Time  `json:"last_active_at"`
	MessageCount int         `json:"message_count"`
	Children    []string    `json:"children,omitempty"` // 子代理 ID 列表
}

// Agent 代理接口
type Agent interface {
	// ID 返回代理唯一标识
	ID() string

	// Config 返回代理配置
	Config() AgentConfig

	// Info 返回代理运行时信息
	Info() AgentInfo

	// SendMessage 发送消息给其他代理
	SendMessage(ctx context.Context, msg Message) error

	// Process 处理用户消息并返回响应
	Process(ctx context.Context, userMessage string) (string, error)

	// Stop 停止代理
	Stop() error
}

// MessageBus 消息总线接口
type MessageBus interface {
	// Subscribe 订阅消息
	Subscribe(agentID string) (<-chan Message, error)

	// Unsubscribe 取消订阅
	Unsubscribe(agentID string) error

	// Publish 发布消息
	Publish(ctx context.Context, msg Message) error

	// PublishToAgent 发送消息给指定代理
	PublishToAgent(ctx context.Context, msg Message, targetAgentID string) error
}

// ProjectContext 项目上下文接口
type ProjectContext interface {
	// RootPath 项目根目录，用于 Agent 对话记忆等本地持久化
	RootPath() string

	// GetProjectInfo 获取项目基本信息
	GetProjectInfo(ctx context.Context) (ProjectInfo, error)

	// SearchCode 搜索代码
	SearchCode(ctx context.Context, query string, limit int) ([]CodeMatch, error)

	// GetFileContent 获取文件内容
	GetFileContent(ctx context.Context, path string) (string, error)

	// UpdateFile 更新文件内容
	UpdateFile(ctx context.Context, path string, content string) error

	// ListFiles 列出项目文件
	ListFiles(ctx context.Context, pattern string) ([]string, error)

	// GetConfig 获取项目配置
	GetConfig(ctx context.Context, key string) (interface{}, error)

	// SetConfig 设置项目配置
	SetConfig(ctx context.Context, key string, value interface{}) error
}

// ProjectInfo 项目信息
type ProjectInfo struct {
	Name        string   `json:"name"`
	Path        string   `json:"path"`
	Language    string   `json:"language"`
	Description string   `json:"description"`
	Files       []string `json:"files,omitempty"`
	TotalLines  int      `json:"total_lines"`
}

// CodeMatch 代码搜索结果
type CodeMatch struct {
	FilePath string `json:"file_path"`
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Content  string `json:"content"`
	Score    float64 `json:"score"`
}
