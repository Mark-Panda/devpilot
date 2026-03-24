// Agent Store (Zustand)

import { create } from 'zustand'
import { agentApi } from './api'
import { errorMessageFromUnknown } from './formatError'

const AGENT_WORKSPACE_STORAGE_KEY = 'devpilot_agent_workspace_root'
import type {
  AgentInfo,
  AgentConfig,
  ChatMessage,
  ProjectInfo,
  AgentTreeNode,
  ChatHistoryEntry,
  ModelConfig,
} from './types'

function chatHistoryToMessages(agentId: string, entries: ChatHistoryEntry[]): ChatMessage[] {
  const base = Date.now() - entries.length * 1000
  return entries.map((e, i) => ({
    id: `hist_${agentId}_${base + i}`,
    role: e.role === 'user' ? 'user' : 'assistant',
    content: e.content,
    timestamp: base + i,
    agentId,
  }))
}

interface AgentState {
  // Agents
  agents: AgentInfo[]
  currentAgentId: string | null
  agentTree: AgentTreeNode | null

  // Chat（当前 Agent 消息 + 各 Agent 本地缓存，切换时与后端记忆同步）
  messages: ChatMessage[]
  messagesByAgent: Record<string, ChatMessage[]>
  /** 各 Agent 是否正在等待 chat 响应（切换 Agent 后仅当前会话显示加载态） */
  loadingByAgent: Record<string, boolean>
  error: string | null

  // Project
  projectInfo: ProjectInfo | null

  // Actions
  loadAgents: () => Promise<void>
  createAgent: (config: AgentConfig) => Promise<AgentInfo>
  selectAgent: (agentId: string) => Promise<void>
  destroyAgent: (agentId: string) => Promise<void>
  sendMessage: (message: string) => Promise<void>
  clearMessages: () => void
  clearAgentMemory: () => Promise<void>
  loadProjectInfo: () => Promise<void>
  /** 若 localStorage 中存有上次选择的目录，则切换到该目录并刷新 projectInfo */
  applyStoredAgentWorkspace: () => Promise<void>
  /** 设置 Agent 工作区根路径并持久化到 localStorage */
  setAgentWorkspaceRoot: (path: string) => Promise<void>
  /** 打开系统目录选择对话框并设为工作区 */
  pickAgentWorkspaceFolder: () => Promise<void>
  loadAgentTree: (rootId: string) => Promise<void>
  updateAgentModel: (agentId: string, mc: ModelConfig) => Promise<void>
  updateAgent: (config: AgentConfig) => Promise<AgentInfo>
}

/** 当前选中 Agent 是否在等模型回复（供 UI 订阅） */
export function selectCurrentAgentLoading(s: AgentState): boolean {
  const id = s.currentAgentId
  if (!id) return false
  return s.loadingByAgent[id] ?? false
}

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  agents: [],
  currentAgentId: null,
  agentTree: null,
  messages: [],
  messagesByAgent: {},
  loadingByAgent: {},
  error: null,
  projectInfo: null,

  // Load all agents
  loadAgents: async () => {
    try {
      const agents = await agentApi.listAgents()
      set({ agents, error: null })
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load agents'
      set({ error })
    }
  },

  // Create agent
  createAgent: async (config: AgentConfig) => {
    try {
      const agent = await agentApi.createAgent(config)
      set((state) => ({
        agents: [...state.agents, agent],
        error: null,
      }))
      return agent
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to create agent'
      set({ error })
      throw err
    }
  },

  // Select agent（从后端拉取持久化记忆，与 OpenClaw session 对齐）
  selectAgent: async (agentId: string) => {
    const prev = get().currentAgentId
    const prevMsgs = get().messages
    if (prev && prevMsgs.length > 0) {
      set((s) => ({
        messagesByAgent: { ...s.messagesByAgent, [prev]: prevMsgs },
      }))
    }
    let messages: ChatMessage[] = []
    try {
      const h = await agentApi.getAgentChatHistory(agentId)
      messages = chatHistoryToMessages(agentId, h)
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to load chat history'
      set({ error })
      messages = get().messagesByAgent[agentId] ?? []
    }
    set((s) => ({
      currentAgentId: agentId,
      messages,
      messagesByAgent: { ...s.messagesByAgent, [agentId]: messages },
      error: null,
    }))
  },

  // Destroy agent
  destroyAgent: async (agentId: string) => {
    try {
      await agentApi.destroyAgent(agentId)
      set((state) => {
        const { [agentId]: _, ...restMsgs } = state.messagesByAgent
        const { [agentId]: __, ...restLoading } = state.loadingByAgent
        return {
          agents: state.agents.filter((a) => a.config.id !== agentId),
          currentAgentId:
            state.currentAgentId === agentId ? null : state.currentAgentId,
          messages: state.currentAgentId === agentId ? [] : state.messages,
          messagesByAgent: restMsgs,
          loadingByAgent: restLoading,
          error: null,
        }
      })
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to destroy agent'
      set({ error })
    }
  },

  // Send message
  sendMessage: async (content: string) => {
    const targetAgentId = get().currentAgentId
    if (!targetAgentId) {
      set({ error: 'No agent selected' })
      return
    }

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      agentId: targetAgentId,
    }

    set((state) => {
      const next = [...state.messages, userMessage]
      return {
        messages: next,
        messagesByAgent: { ...state.messagesByAgent, [targetAgentId]: next },
        loadingByAgent: { ...state.loadingByAgent, [targetAgentId]: true },
        error: null,
      }
    })

    try {
      const response = await agentApi.chat(targetAgentId, content)
      const agentRow = get().agents.find((a) => a.config.id === targetAgentId)

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        agentId: targetAgentId,
        metadata: agentRow
          ? {
              agentName: agentRow.config.name,
              model: agentRow.config.model_config?.model ?? '',
            }
          : undefined,
      }

      // 必须用发起请求时的 targetAgentId 合并回复；切换当前 Agent 后不能把旧回复塞进新会话
      set((s) => {
        const base = s.messagesByAgent[targetAgentId] ?? []
        const nextForTarget = [...base, assistantMessage]
        const { [targetAgentId]: _, ...restLoading } = s.loadingByAgent
        return {
          messages:
            s.currentAgentId === targetAgentId ? nextForTarget : s.messages,
          messagesByAgent: {
            ...s.messagesByAgent,
            [targetAgentId]: nextForTarget,
          },
          loadingByAgent: { ...restLoading },
        }
      })
    } catch (err) {
      const error = errorMessageFromUnknown(err, 'Failed to send message')
      set((s) => {
        const { [targetAgentId]: _, ...restLoading } = s.loadingByAgent
        return { loadingByAgent: { ...restLoading }, error }
      })
    }
  },

  // Clear messages（仅前端列表）
  clearMessages: () => {
    const id = get().currentAgentId
    set((s) => {
      if (!id) return { messages: [] }
      return {
        messages: [],
        messagesByAgent: { ...s.messagesByAgent, [id]: [] },
      }
    })
  },

  // 清空后端持久化记忆与当前会话
  clearAgentMemory: async () => {
    const id = get().currentAgentId
    if (!id) return
    try {
      await agentApi.clearAgentChatHistory(id)
      set((s) => ({
        messages: [],
        messagesByAgent: { ...s.messagesByAgent, [id]: [] },
        error: null,
      }))
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to clear agent memory'
      set({ error })
    }
  },

  // Load project info
  loadProjectInfo: async () => {
    try {
      const projectInfo = await agentApi.getProjectInfo()
      set({ projectInfo, error: null })
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to load project info'
      set({ error })
    }
  },

  applyStoredAgentWorkspace: async () => {
    const p = localStorage.getItem(AGENT_WORKSPACE_STORAGE_KEY)?.trim()
    if (!p) return
    try {
      await agentApi.setAgentWorkspaceRoot(p)
      const projectInfo = await agentApi.getProjectInfo()
      set({ projectInfo, error: null })
    } catch (err) {
      const msg = errorMessageFromUnknown(err)
      set({ error: `恢复已保存的工作区失败（${msg}），仍使用启动目录` })
    }
  },

  setAgentWorkspaceRoot: async (path: string) => {
    const p = path.trim()
    if (!p) return
    try {
      await agentApi.setAgentWorkspaceRoot(p)
      localStorage.setItem(AGENT_WORKSPACE_STORAGE_KEY, p)
      const projectInfo = await agentApi.getProjectInfo()
      set({ projectInfo, error: null })
    } catch (err) {
      const error = errorMessageFromUnknown(err)
      set({ error })
      throw err
    }
  },

  pickAgentWorkspaceFolder: async () => {
    try {
      const p = (await agentApi.openAgentWorkspaceDialog()).trim()
      if (!p) return
      await get().setAgentWorkspaceRoot(p)
    } catch (err) {
      const error = errorMessageFromUnknown(err)
      set({ error })
    }
  },

  // Load agent tree
  loadAgentTree: async (rootId: string) => {
    try {
      const agentTree = await agentApi.getAgentTree(rootId)
      set({ agentTree, error: null })
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to load agent tree'
      set({ error })
    }
  },

  updateAgentModel: async (agentId: string, mc: ModelConfig) => {
    try {
      const info = await agentApi.updateAgentModelConfig(agentId, mc)
      set((s) => ({
        agents: s.agents.map((a) => (a.config.id === agentId ? info : a)),
        error: null,
      }))
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to update agent model'
      set({ error })
      throw err
    }
  },

  updateAgent: async (config: AgentConfig) => {
    try {
      const info = await agentApi.updateAgent(config)
      set((s) => ({
        agents: s.agents.map((a) => (a.config.id === config.id ? info : a)),
        error: null,
      }))
      return info
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to update agent'
      set({ error })
      throw err
    }
  },
}))
