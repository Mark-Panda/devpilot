import '../agent/api'
import type {
  Studio,
  StudioAssistantPush,
  StudioDetail,
  StudioProgressEvent,
  StudioTodoBoardRow,
  StudioTodoItem,
} from './types'

function wailsRuntime(): { EventsOn?: (name: string, cb: (data: unknown) => void) => () => void } | undefined {
  return (window as unknown as { runtime?: { EventsOn?: (n: string, cb: (d: unknown) => void) => () => void } })
    .runtime
}

/** 订阅工作室进度（Wails v2 注入 runtime 时生效） */
export function subscribeStudioProgress(
  studioId: string,
  onEvent: (ev: StudioProgressEvent) => void
): () => void {
  const rt = wailsRuntime()
  const off = rt?.EventsOn?.('studio:progress', (data: unknown) => {
    const ev = data as StudioProgressEvent
    if (ev && typeof ev === 'object' && (ev as StudioProgressEvent).studio_id === studioId) {
      onEvent(ev as StudioProgressEvent)
    }
  })
  return () => {
    off?.()
  }
}

/** 订阅工作室主 Agent 自动续跑回复（topic: studio:assistant） */
export function subscribeStudioAssistant(
  studioId: string,
  onEvent: (ev: StudioAssistantPush) => void
): () => void {
  const rt = wailsRuntime()
  const off = rt?.EventsOn?.('studio:assistant', (data: unknown) => {
    const ev = data as StudioAssistantPush
    if (ev && typeof ev === 'object' && (ev as StudioAssistantPush).studio_id === studioId) {
      onEvent(ev as StudioAssistantPush)
    }
  })
  return () => {
    off?.()
  }
}

export const studioApi = {
  listStudios: async (): Promise<Studio[]> => {
    const v = await window.go.main.App.ListStudios()
    return Array.isArray(v) ? v : []
  },

  createStudio: async (name: string, mainAgentID: string): Promise<Studio> => {
    return await window.go.main.App.CreateStudio(name, mainAgentID)
  },

  deleteStudio: async (studioID: string): Promise<void> => {
    await window.go.main.App.DeleteStudio(studioID)
  },

  getStudioDetail: async (studioID: string): Promise<StudioDetail> => {
    return await window.go.main.App.GetStudioDetail(studioID)
  },

  getStudioProgress: async (studioID: string): Promise<StudioProgressEvent[]> => {
    const v = await window.go.main.App.GetStudioProgress(studioID)
    return Array.isArray(v) ? v : []
  },

  chatInStudio: async (studioID: string, agentID: string, message: string): Promise<string> => {
    const v = await window.go.main.App.ChatInStudio(studioID, agentID, message)
    if (v == null) return ''
    return typeof v === 'string' ? v : String(v)
  },

  getStudioTodoBoard: async (studioID: string): Promise<StudioTodoBoardRow[]> => {
    try {
      const v = await window.go.main.App.GetStudioTodoBoard(studioID)
      if (!Array.isArray(v)) return []
      return v.map((row) => {
        const r = row as StudioTodoBoardRow & { items?: StudioTodoItem[] | null }
        const rawItems = Array.isArray(r.items) ? r.items : []
        return {
          agent_id: typeof r.agent_id === 'string' ? r.agent_id : '',
          agent_name: typeof r.agent_name === 'string' ? r.agent_name : '',
          items: rawItems.map((it) => ({
            id: typeof it?.id === 'string' ? it.id : '',
            title: typeof it?.title === 'string' ? it.title : '',
            done: Boolean(it?.done),
          })),
        }
      })
    } catch {
      return []
    }
  },

  /** 触发主 Agent TODO 巡检（后端 90s 冷却）；成功时经 studio:assistant 推送简报 */
  studioMaybeProgressBrief: async (studioID: string): Promise<void> => {
    try {
      await window.go.main.App.StudioMaybeProgressBrief(studioID)
    } catch {
      /* 冷却中或旧版绑定无此方法 */
    }
  },
}
