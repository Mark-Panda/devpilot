// Agent Wails 绑定
// 使用 Wails 生成的绑定文件

import type {
  AgentConfig,
  AgentInfo,
  AgentTreeNode,
  ProjectInfo,
  CodeMatch,
} from './types'

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
    return await window.go.main.App.CreateAgent(config)
  },

  getAgent: async (agentId: string): Promise<AgentInfo> => {
    return await window.go.main.App.GetAgent(agentId)
  },

  listAgents: async (): Promise<AgentInfo[]> => {
    return await window.go.main.App.ListAgents()
  },

  destroyAgent: async (agentId: string): Promise<void> => {
    return await window.go.main.App.DestroyAgent(agentId)
  },

  // 对话
  chat: async (agentId: string, message: string): Promise<string> => {
    return await window.go.main.App.Chat(agentId, message)
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
