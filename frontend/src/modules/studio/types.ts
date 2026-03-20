import type { AgentInfo } from '../agent/types'

export interface Studio {
  id: string
  name: string
  main_agent_id: string
  created_at: string
}

export interface StudioDetail {
  studio: Studio
  member_agents: AgentInfo[]
}

export interface StudioProgressEvent {
  entry_id: string
  studio_id: string
  timestamp: string
  kind: string
  agent_id: string
  agent_name: string
  parent_agent_id?: string
  task_preview?: string
  result_preview?: string
  error?: string
}

/** 工作室主 Agent 自动续跑推送的 assistant 消息 */
export interface StudioAssistantPush {
  studio_id: string
  agent_id: string
  content: string
}

export interface StudioTodoItem {
  id: string
  title: string
  done: boolean
}

export interface StudioTodoBoardRow {
  agent_id: string
  agent_name: string
  items: StudioTodoItem[]
}
