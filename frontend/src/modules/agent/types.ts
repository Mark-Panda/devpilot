// Agent 相关类型定义

export type AgentType = 'main' | 'sub' | 'worker'
export type AgentStatus = 'idle' | 'busy' | 'stopped'
export type MessageType = 'request' | 'response' | 'event' | 'broadcast'

export interface AgentConfig {
  id: string
  name: string
  /** 角色说明，会注入系统提示【角色】前缀 */
  role?: string
  type: AgentType
  parent_id?: string
  model_config: ModelConfig
  skills: string[]
  mcp_servers: string[]
  system_prompt: string
  metadata?: Record<string, any>
}

export interface MCPServerPreset {
  id: string
  name: string
  description: string
}

/** 与后端 MCPServerDefinition 一致；保存至 ~/.devpilot/mcp.json */
export interface MCPServerDefinition {
  id: string
  name: string
  description?: string
  enabled: boolean
  server_command?: string[]
  server_url?: string
  env?: Record<string, string>
  tool_names?: string[]
}

export interface ModelConfig {
  base_url: string
  api_key: string
  model: string
  /** 备用模型，按顺序在当前 model 失败时尝试；空则仅使用 model */
  models?: string[]
  max_tokens?: number
  temperature?: number
}

export interface AgentInfo {
  config: AgentConfig
  status: AgentStatus
  created_at: string
  last_active_at: string
  message_count: number
  children?: string[]
}

export interface AgentMessage {
  id: string
  from_agent: string
  to_agent?: string
  type: MessageType
  content: string
  metadata?: Record<string, any>
  timestamp: string
}

export interface AgentTreeNode {
  agent: AgentInfo
  children?: AgentTreeNode[]
}

/** 后端持久化的对话记忆条目 */
export interface ChatHistoryEntry {
  role: string
  content: string
}

export interface ProjectInfo {
  name: string
  path: string
  language: string
  description: string
  files?: string[]
  total_lines: number
}

export interface CodeMatch {
  file_path: string
  line: number
  column: number
  content: string
  score: number
}

/** 工具调用信息（OpenClaw 风格展示） */
export interface ToolCallBlock {
  name?: string
  summary?: string
  expanded?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  agentId?: string
  /** 助手消息元数据：agent 名称、token 用量、模型等 */
  metadata?: {
    agentName?: string
    inputTokens?: number
    outputTokens?: number
    model?: string
    toolCalls?: ToolCallBlock[]
    [key: string]: unknown
  }
}
