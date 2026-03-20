// Agent Wails 绑定
// 使用 Wails 生成的绑定文件

import type {
  AgentConfig,
  AgentInfo,
  AgentTreeNode,
  ProjectInfo,
  CodeMatch,
  ChatHistoryEntry,
  ModelConfig,
  MCPServerPreset,
  MCPServerDefinition,
} from './types'

function normalizeModelConfig(mc: ModelConfig | null | undefined): ModelConfig {
  if (!mc || typeof mc !== 'object') {
    return {
      base_url: '',
      api_key: '',
      model: '',
      max_tokens: 4096,
      temperature: 0.7,
    }
  }
  return {
    base_url: typeof mc.base_url === 'string' ? mc.base_url : '',
    api_key: typeof mc.api_key === 'string' ? mc.api_key : '',
    model: typeof mc.model === 'string' ? mc.model : '',
    max_tokens: typeof mc.max_tokens === 'number' ? mc.max_tokens : 4096,
    temperature: typeof mc.temperature === 'number' ? mc.temperature : 0.7,
  }
}

/** Go nil slice / 缺字段 → JS null；统一成安全默认值避免 UI 与 sendMessage 崩溃 */
function normalizeAgentConfig(c: AgentConfig): AgentConfig {
  return {
    ...c,
    skills: Array.isArray(c.skills) ? c.skills : [],
    mcp_servers: Array.isArray(c.mcp_servers) ? c.mcp_servers : [],
    model_config: normalizeModelConfig(c.model_config),
  }
}

function normalizeAgentInfo(a: AgentInfo): AgentInfo {
  if (!a?.config) {
    return a
  }
  return { ...a, config: normalizeAgentConfig(a.config) }
}

// 导入 Wails 生成的方法(编译后会生成)
declare global {
  interface Window {
    go: {
      main: {
        App: {
          CreateAgent: (config: AgentConfig) => Promise<AgentInfo>
          GetAgent: (agentId: string) => Promise<AgentInfo>
          ListAgents: () => Promise<AgentInfo[]>
          DestroyAgent: (agentId: string) => Promise<void>
          Chat: (agentId: string, message: string) => Promise<string>
          SendMessage: (fromAgentId: string, toAgentId: string, content: string, msgType: string) => Promise<void>
          GetAgentTree: (rootId: string) => Promise<AgentTreeNode>
          GetAgentChatHistory: (agentId: string) => Promise<ChatHistoryEntry[]>
          ClearAgentChatHistory: (agentId: string) => Promise<void>
          UpdateAgentModelConfig: (agentId: string, mc: ModelConfig) => Promise<AgentInfo>
          UpdateAgent: (config: AgentConfig) => Promise<AgentInfo>
          ListMCPServerPresets: () => Promise<MCPServerPreset[]>
          GetMCPServerDefinitions: () => Promise<MCPServerDefinition[]>
          SaveMCPServerDefinitions: (servers: MCPServerDefinition[]) => Promise<void>
          GetProjectInfo: () => Promise<ProjectInfo>
          SearchCode: (query: string, limit: number) => Promise<CodeMatch[]>
          GetFileContent: (path: string) => Promise<string>
          UpdateFile: (path: string, content: string) => Promise<void>
          ListFiles: (pattern: string) => Promise<string[]>
          GetProjectConfig: (key: string) => Promise<any>
          SetProjectConfig: (key: string, value: any) => Promise<void>
        }
      }
    }
  }
}

export const agentApi = {
  // Agent 管理
  createAgent: async (config: AgentConfig): Promise<AgentInfo> => {
    const v = await window.go.main.App.CreateAgent(config)
    return normalizeAgentInfo(v)
  },

  getAgent: async (agentId: string): Promise<AgentInfo> => {
    const v = await window.go.main.App.GetAgent(agentId)
    return normalizeAgentInfo(v)
  },

  listAgents: async (): Promise<AgentInfo[]> => {
    const v = await window.go.main.App.ListAgents()
    if (!Array.isArray(v)) return []
    return v.map((x) => normalizeAgentInfo(x))
  },

  destroyAgent: async (agentId: string): Promise<void> => {
    return await window.go.main.App.DestroyAgent(agentId)
  },

  // 对话
  chat: async (agentId: string, message: string): Promise<string> => {
    const v = await window.go.main.App.Chat(agentId, message)
    if (v == null) return ''
    return typeof v === 'string' ? v : String(v)
  },

  // 消息通信
  sendMessage: async (
    fromAgentId: string,
    toAgentId: string,
    content: string,
    type: string
  ): Promise<void> => {
    return await window.go.main.App.SendMessage(fromAgentId, toAgentId, content, type)
  },

  // Agent 树
  getAgentTree: async (rootId: string): Promise<AgentTreeNode> => {
    return await window.go.main.App.GetAgentTree(rootId)
  },

  getAgentChatHistory: async (agentId: string): Promise<ChatHistoryEntry[]> => {
    return await window.go.main.App.GetAgentChatHistory(agentId)
  },

  clearAgentChatHistory: async (agentId: string): Promise<void> => {
    return await window.go.main.App.ClearAgentChatHistory(agentId)
  },

  updateAgentModelConfig: async (agentId: string, mc: ModelConfig): Promise<AgentInfo> => {
    const v = await window.go.main.App.UpdateAgentModelConfig(agentId, mc)
    return normalizeAgentInfo(v)
  },

  updateAgent: async (config: AgentConfig): Promise<AgentInfo> => {
    const v = await window.go.main.App.UpdateAgent(config)
    return normalizeAgentInfo(v)
  },

  listMCPServerPresets: async (): Promise<MCPServerPreset[]> => {
    const v = await window.go.main.App.ListMCPServerPresets()
    return Array.isArray(v) ? v : []
  },

  getMCPServerDefinitions: async (): Promise<MCPServerDefinition[]> => {
    const v = await window.go.main.App.GetMCPServerDefinitions()
    return Array.isArray(v) ? v : []
  },

  saveMCPServerDefinitions: async (servers: MCPServerDefinition[]): Promise<void> => {
    await window.go.main.App.SaveMCPServerDefinitions(servers)
  },

  // 项目上下文
  getProjectInfo: async (): Promise<ProjectInfo> => {
    return await window.go.main.App.GetProjectInfo()
  },

  searchCode: async (query: string, limit: number): Promise<CodeMatch[]> => {
    return await window.go.main.App.SearchCode(query, limit)
  },

  getFileContent: async (path: string): Promise<string> => {
    return await window.go.main.App.GetFileContent(path)
  },

  updateFile: async (path: string, content: string): Promise<void> => {
    return await window.go.main.App.UpdateFile(path, content)
  },

  listFiles: async (pattern: string): Promise<string[]> => {
    return await window.go.main.App.ListFiles(pattern)
  },

  getProjectConfig: async (key: string): Promise<any> => {
    return await window.go.main.App.GetProjectConfig(key)
  },

  setProjectConfig: async (key: string, value: any): Promise<void> => {
    return await window.go.main.App.SetProjectConfig(key, value)
  },
}
