import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { studioApi, subscribeStudioAssistant, subscribeStudioProgress } from '../api'
import { agentApi } from '../../agent/api'
import { ChatMessages } from '../../agent/components/ChatMessages'
import { StudioTeamChatInput } from '../components/StudioTeamChatInput'
import type { ChatMessage } from '../../agent/types'
import type { StudioDetail, StudioProgressEvent, StudioTodoBoardRow } from '../types'

const kindLabels: Record<string, string> = {
  delegation_started: '主 Agent → 委派子 Agent',
  delegation_finished: '子 Agent → 返回结果',
  delegation_failed: '委派失败',
  sub_task_accepted: '子 Agent 开始处理',
  sub_task_finished: '子 Agent 处理完成',
  sub_task_failed: '子 Agent 处理失败',
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}

function entriesToMessages(agentId: string, entries: import('../../agent/types').ChatHistoryEntry[]): ChatMessage[] {
  const base = Date.now() - entries.length * 1000
  return entries.map((e, i) => ({
    id: `hist_${agentId}_${base + i}`,
    role: e.role === 'user' ? 'user' : 'assistant',
    content: e.content,
    timestamp: base + i,
    agentId,
  }))
}

export const StudioWorkspacePage: React.FC = () => {
  const { studioId } = useParams<{ studioId: string }>()
  const [detail, setDetail] = useState<StudioDetail | null>(null)
  const [progress, setProgress] = useState<StudioProgressEvent[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progressFilterAgentId, setProgressFilterAgentId] = useState('')
  const [mentionAppend, setMentionAppend] = useState<{ nonce: number; text: string }>({
    nonce: 0,
    text: '',
  })
  const [todoBoard, setTodoBoard] = useState<StudioTodoBoardRow[]>([])

  const mainId = detail?.studio.main_agent_id ?? ''
  const mainName = useMemo(() => {
    const m = detail?.member_agents.find((a) => a.config.id === mainId)
    return m?.config.name ?? '主 Agent'
  }, [detail, mainId])

  const mergeProgress = useCallback((list: StudioProgressEvent[]) => {
    setProgress((prev) => {
      const byId = new Map<string, StudioProgressEvent>()
      for (const p of prev) {
        byId.set(p.entry_id, p)
      }
      for (const p of list) {
        byId.set(p.entry_id, p)
      }
      return Array.from(byId.values()).sort((a, b) => {
        const ta = new Date(a.timestamp).getTime()
        const tb = new Date(b.timestamp).getTime()
        return ta - tb
      })
    })
  }, [])

  useEffect(() => {
    if (!studioId) return
    setLoading(true)
    ;(async () => {
      try {
        const [d, p] = await Promise.all([
          studioApi.getStudioDetail(studioId),
          studioApi.getStudioProgress(studioId),
        ])
        setDetail(d)
        mergeProgress(p)
        const h = await agentApi.getAgentChatHistory(d.studio.main_agent_id, studioId)
        setMessages(entriesToMessages(d.studio.main_agent_id, h))
        const board = await studioApi.getStudioTodoBoard(studioId)
        setTodoBoard(board)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [studioId, mergeProgress])

  useEffect(() => {
    if (!studioId) return
    const off = subscribeStudioProgress(studioId, (ev) => {
      mergeProgress([ev])
    })
    const t = window.setInterval(() => {
      void studioApi.getStudioProgress(studioId).then(mergeProgress).catch(() => {})
    }, 4000)
    return () => {
      off()
      window.clearInterval(t)
    }
  }, [studioId, mergeProgress])

  useEffect(() => {
    if (!studioId || !mainId) return
    const off = subscribeStudioAssistant(studioId, (ev) => {
      setMessages((m) => [
        ...m,
        {
          id: `studio_auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          role: 'assistant',
          content: ev.content,
          timestamp: Date.now(),
          agentId: mainId,
        },
      ])
    })
    return () => off()
  }, [studioId, mainId])

  useEffect(() => {
    if (!studioId) return
    const refreshBoard = () => {
      void studioApi.getStudioTodoBoard(studioId).then(setTodoBoard).catch(() => {})
    }
    refreshBoard()
    const t = window.setInterval(refreshBoard, 25000)
    return () => window.clearInterval(t)
  }, [studioId])

  useEffect(() => {
    if (!studioId) return
    const t = window.setInterval(() => {
      void studioApi.studioMaybeProgressBrief(studioId)
    }, 105000)
    return () => window.clearInterval(t)
  }, [studioId])

  const filteredProgress = useMemo(() => {
    if (!progressFilterAgentId) return progress
    return progress.filter(
      (ev) =>
        ev.agent_id === progressFilterAgentId || ev.parent_agent_id === progressFilterAgentId
    )
  }, [progress, progressFilterAgentId])

  const onSend = async (displayContent: string, textForMain: string) => {
    if (!studioId || !mainId || !textForMain.trim()) return
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: displayContent,
      timestamp: Date.now(),
      agentId: mainId,
    }
    setMessages((m) => [...m, userMsg])
    setSending(true)
    setError(null)
    try {
      const reply = await studioApi.chatInStudio(studioId, mainId, textForMain)
      setMessages((m) => [
        ...m,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
          agentId: mainId,
        },
      ])
      const p = await studioApi.getStudioProgress(studioId)
      mergeProgress(p)
      void studioApi.getStudioTodoBoard(studioId).then(setTodoBoard).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  if (!studioId) {
    return <p className="p-6 text-sm text-stone-500">无效的工作室</p>
  }

  if (loading && !detail) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-stone-500">加载工作室…</div>
    )
  }

  if (!detail) {
    return (
      <div className="p-6">
        <p className="text-sm text-rose-600">{error ?? '工作室不存在'}</p>
        <Link to="/studios" className="mt-2 inline-block text-sm text-rose-700 underline">
          返回列表
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-stone-50">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 sm:px-6">
        <Link to="/studios" className="text-sm text-stone-500 hover:text-stone-800">
          ← 工作室列表
        </Link>
        <span className="text-stone-300">|</span>
        <h1 className="text-sm font-semibold text-stone-800">{detail.studio.name}</h1>
        <span className="text-xs text-stone-400">
          Team 视图：仅主 Agent「{mainName}」收消息；可用 @ 定向子 Agent
        </span>
      </header>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 sm:mx-6">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-stone-200">
        <section className="flex min-h-0 flex-col border-b border-stone-200 lg:border-b-0">
          <div className="flex-shrink-0 border-b border-stone-100 bg-white px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">任务进度</h2>
                <p className="text-[11px] text-stone-400">按成员筛选，聚焦单个子 Agent 的委派与产出摘要</p>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
                <span className="text-stone-400">成员</span>
                <select
                  className="max-w-[140px] rounded border border-stone-200 bg-white px-2 py-1 text-xs text-stone-800"
                  value={progressFilterAgentId}
                  onChange={(e) => setProgressFilterAgentId(e.target.value)}
                >
                  <option value="">全部</option>
                  {detail.member_agents.map((a) => (
                    <option key={a.config.id} value={a.config.id}>
                      {a.config.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="studio-progress-scroll min-h-[200px] flex-1 overflow-y-auto bg-white px-3 py-3 lg:min-h-0">
            {progress.length === 0 ? (
              <p className="text-xs text-stone-400">暂无进度；主 Agent 使用委派工具后此处会更新。</p>
            ) : filteredProgress.length === 0 ? (
              <p className="text-xs text-stone-400">当前筛选下无事件，请换一名成员或选「全部」。</p>
            ) : (
              <ul className="space-y-3">
                {filteredProgress.map((ev) => (
                  <li
                    key={ev.entry_id}
                    className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-700"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <span className="font-medium text-stone-800">{kindLabels[ev.kind] ?? ev.kind}</span>
                      <span className="text-[10px] text-stone-400">{formatTime(ev.timestamp)}</span>
                    </div>
                    <p className="mt-1 text-stone-600">
                      <span className="text-stone-400">Agent:</span> {ev.agent_name}{' '}
                      <code className="rounded bg-stone-200 px-1 text-[10px]">{ev.agent_id}</code>
                    </p>
                    {ev.task_preview ? (
                      <p className="mt-1 line-clamp-4 text-stone-600">
                        <span className="text-stone-400">任务:</span> {ev.task_preview}
                      </p>
                    ) : null}
                    {ev.result_preview ? (
                      <p className="mt-1 line-clamp-3 text-stone-600">
                        <span className="text-stone-400">结果摘要:</span> {ev.result_preview}
                      </p>
                    ) : null}
                    {ev.error ? <p className="mt-1 text-rose-600">{ev.error}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex-shrink-0 border-t border-stone-100 bg-white px-4 py-2">
            <p className="text-[11px] font-medium text-stone-500">TODO 看板（各 Agent 通过工具维护）</p>
            <div className="mt-1 max-h-40 overflow-y-auto text-[11px] text-stone-600">
              {todoBoard.length === 0 ? (
                <p className="text-stone-400">暂无数据；Agent 在工作室对话中会使用 devpilot_studio_todo 写入清单。</p>
              ) : (
                <ul className="space-y-2">
                  {todoBoard.map((row) => {
                    const items = Array.isArray(row.items) ? row.items : []
                    const rowKey = row.agent_id || `row_${items.length}`
                    return (
                      <li key={rowKey} className="rounded border border-stone-100 bg-stone-50 px-2 py-1.5">
                        <p className="font-medium text-stone-800">{row.agent_name ?? row.agent_id}</p>
                        {items.length === 0 ? (
                          <p className="text-stone-400">未设置 TODO</p>
                        ) : (
                          <ul className="mt-0.5 list-none space-y-0.5 pl-0">
                            {items.map((it, idx) => (
                              <li key={it.id || `todo_${idx}`} className="flex gap-1.5">
                                <span className={it.done ? 'text-emerald-600' : 'text-stone-400'}>
                                  {it.done ? '☑' : '☐'}
                                </span>
                                <span className={it.done ? 'text-stone-500 line-through' : ''}>
                                  <code className="text-[10px] text-stone-400">{it.id}</code> {it.title}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-stone-400">
              约每 105s 请求主 Agent 进度巡检（90s 后端冷却）；简报出现在右侧对话。
            </p>
          </div>
          <div className="flex-shrink-0 border-t border-stone-100 bg-stone-50 px-4 py-2">
            <p className="text-[11px] font-medium text-stone-500">协作成员（当前树）</p>
            <ul className="mt-1 max-h-28 overflow-y-auto text-[11px] text-stone-600">
              {detail.member_agents.map((a) => {
                const isMain = a.config.id === mainId || a.config.type === 'main'
                return (
                  <li key={a.config.id}>
                    <button
                      type="button"
                      disabled={isMain}
                      title={isMain ? '主 Agent 为统一入口，无需 @' : '插入 @ 到输入框'}
                      className={`text-left ${isMain ? 'cursor-default opacity-70' : 'cursor-pointer hover:text-rose-700 hover:underline'}`}
                      onClick={() => {
                        if (isMain) return
                        const token = /\s/.test(a.config.name) ? a.config.id : a.config.name
                        setMentionAppend((x) => ({ nonce: x.nonce + 1, text: `@${token} ` }))
                      }}
                    >
                      {a.config.name}{' '}
                      <span className="text-stone-400">
                        ({a.config.type}) {a.config.id}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section className="flex min-h-0 min-h-[50vh] flex-col bg-white lg:min-h-0">
          <div className="flex-shrink-0 border-b border-stone-100 px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">与主 Agent 对话</h2>
          </div>
          <div className="agent-chat-messages min-h-0 flex-1 overflow-y-auto">
            <ChatMessages
              messages={messages}
              isLoading={sending}
              agentName={mainName}
              modelName={detail.member_agents.find((x) => x.config.id === mainId)?.config.model_config?.model}
            />
          </div>
          <footer className="agent-chat-composer border-t border-stone-200">
            <div className="agent-chat-composer-inner">
              <StudioTeamChatInput
                onSend={(display, payload) => void onSend(display, payload)}
                isLoading={sending}
                placeholder={`发给 ${mainName}（@ 子 Agent 定向）…`}
                members={detail.member_agents}
                mainAgentId={mainId}
                externalAppend={mentionAppend}
              />
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}
