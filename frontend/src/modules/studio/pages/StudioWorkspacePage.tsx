import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { studioApi, subscribeStudioProgress } from '../api'
import { agentApi } from '../../agent/api'
import { ChatMessages } from '../../agent/components/ChatMessages'
import { ChatInput } from '../../agent/components/ChatInput'
import type { ChatMessage } from '../../agent/types'
import type { StudioDetail, StudioProgressEvent } from '../types'

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

  const onSend = async (text: string) => {
    if (!studioId || !mainId || !text.trim()) return
    const content = text.trim()
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      agentId: mainId,
    }
    setMessages((m) => [...m, userMsg])
    setSending(true)
    setError(null)
    try {
      const reply = await studioApi.chatInStudio(studioId, mainId, content)
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
        <span className="text-xs text-stone-400">仅与主 Agent「{mainName}」对话</span>
      </header>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 sm:mx-6">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-stone-200">
        <section className="flex min-h-0 flex-col border-b border-stone-200 lg:border-b-0">
          <div className="flex-shrink-0 border-b border-stone-100 bg-white px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">任务进度</h2>
            <p className="text-[11px] text-stone-400">委派与子 Agent 执行节点（含实时事件与定时同步）</p>
          </div>
          <div className="studio-progress-scroll min-h-[200px] flex-1 overflow-y-auto bg-white px-3 py-3 lg:min-h-0">
            {progress.length === 0 ? (
              <p className="text-xs text-stone-400">暂无进度；主 Agent 使用委派工具后此处会更新。</p>
            ) : (
              <ul className="space-y-3">
                {progress.map((ev) => (
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
          <div className="flex-shrink-0 border-t border-stone-100 bg-stone-50 px-4 py-2">
            <p className="text-[11px] font-medium text-stone-500">协作成员（当前树）</p>
            <ul className="mt-1 max-h-24 overflow-y-auto text-[11px] text-stone-600">
              {detail.member_agents.map((a) => (
                <li key={a.config.id}>
                  {a.config.name}{' '}
                  <span className="text-stone-400">
                    ({a.config.type}) {a.config.id}
                  </span>
                </li>
              ))}
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
              <ChatInput onSend={(msg) => void onSend(msg)} isLoading={sending} placeholder={`发送给 ${mainName}…`} />
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}
