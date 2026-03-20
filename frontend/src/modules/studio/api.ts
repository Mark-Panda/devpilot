import '../agent/api'
import type { Studio, StudioDetail, StudioProgressEvent } from './types'

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
}
