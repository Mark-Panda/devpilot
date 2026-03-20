// Agent Store (Zustand)

import { create } from 'zustand'
import { agentApi } from './api'
import type {
  AgentInfo,
  AgentConfig,
  ChatMessage,
  ProjectInfo,
  AgentTreeNode,
} from './types'

interface AgentState {
  // Agents
  agents: AgentInfo[]
  currentAgentId: string | null
  agentTree: AgentTreeNode | null

  // Chat
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null

  // Project
  projectInfo: ProjectInfo | null

  // Actions
  loadAgents: () => Promise<void>
  createAgent: (config: AgentConfig) => Promise<AgentInfo>
  selectAgent: (agentId: string) => void
  destroyAgent: (agentId: string) => Promise<void>
  sendMessage: (message: string) => Promise<void>
  clearMessages: () => void
  loadProjectInfo: () => Promise<void>
  loadAgentTree: (rootId: string) => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  agents: [],
  currentAgentId: null,
  agentTree: null,
  messages: [],
  isLoading: false,
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

  // Select agent
  selectAgent: (agentId: string) => {
    set({ currentAgentId: agentId, messages: [] })
  },

  // Destroy agent
  destroyAgent: async (agentId: string) => {
    try {
      await agentApi.destroyAgent(agentId)
      set((state) => ({
        agents: state.agents.filter((a) => a.config.id !== agentId),
        currentAgentId:
          state.currentAgentId === agentId ? null : state.currentAgentId,
        error: null,
      }))
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'Failed to destroy agent'
      set({ error })
    }
  },

  // Send message
  sendMessage: async (content: string) => {
    const { currentAgentId } = get()
    if (!currentAgentId) {
      set({ error: 'No agent selected' })
      return
    }

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      agentId: currentAgentId,
    }

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null,
    }))

    try {
      const response = await agentApi.chat(currentAgentId, content)
      const state = get()
      const currentAgent = state.agents.find((a) => a.config.id === currentAgentId)

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        agentId: currentAgentId,
        metadata: currentAgent
          ? { agentName: currentAgent.config.name, model: currentAgent.config.model_config.model }
          : undefined,
      }

      set((s) => ({
        messages: [...s.messages, assistantMessage],
        isLoading: false,
      }))
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to send message'
      set({ isLoading: false, error })
    }
  },

  // Clear messages
  clearMessages: () => {
    set({ messages: [] })
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
}))
