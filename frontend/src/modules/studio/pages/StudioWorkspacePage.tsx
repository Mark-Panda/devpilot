import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { studioApi, subscribeStudioAssistant, subscribeStudioProgress } from '../api'
import { agentApi } from '../../agent/api'
import { ChatMessages } from '../../agent/components/ChatMessages'
import { StudioTeamChatInput } from '../components/StudioTeamChatInput'
import { StudioOfficeScene } from '../components/StudioOfficeScene'
import {
  StudioOfficeDashboard,
  StudioOfficeTicker,
  buildStudioMemoLines,
  deriveStudioOfficeMood,
  type StudioOfficeMood,
} from '../components/StudioOfficeDashboard'
import { StudioWorkspaceModalShell, StudioWorkspaceToolbar } from '../components/StudioWorkspaceToolbar'
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
  const [wsSavingAgentId, setWsSavingAgentId] = useState<string | null>(null)
  /** 仪表盘「协作状态」手动固定展示；与 Star-Office 式 HUD 一致，不影响后端 */
  const [moodPin, setMoodPin] = useState<StudioOfficeMood | null>(null)
  const [sceneCollapsed, setSceneCollapsed] = useState(() => {
    try {
      return localStorage.getItem('devpilot-studio-scene-collapsed') === '1'
    } catch {
      return false
    }
  })
  const [helpOpen, setHelpOpen] = useState(false)
  const [memoModalOpen, setMemoModalOpen] = useState(false)
  const [todoModalOpen, setTodoModalOpen] = useState(false)
  const [membersModalOpen, setMembersModalOpen] = useState(false)
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('devpilot-studio-scene-collapsed', sceneCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [sceneCollapsed])

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

  const memoLines = useMemo(
    () => buildStudioMemoLines(progress, todoBoard, 6),
    [progress, todoBoard]
  )

  const memoLinesFull = useMemo(
    () => buildStudioMemoLines(progress, todoBoard, 36),
    [progress, todoBoard]
  )

  const derivedOfficeMood = useMemo(
    () => deriveStudioOfficeMood(sending, !!error, progress),
    [sending, error, progress]
  )
  const displayOfficeMood = moodPin ?? derivedOfficeMood

  const tickerText = useMemo(() => {
    if (!detail) return ''
    if (error) return `⚠ ${error}`
    const last =
      progress.length > 0
        ? [...progress].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )[0]
        : null
    if (!last) {
      return `「${detail.studio.name}」就绪 · 向主 Agent 发消息即可开始协作`
    }
    const label = kindLabels[last.kind] ?? last.kind
    return `${label} · ${last.agent_name} · ${formatTime(last.timestamp)}`
  }, [detail, error, progress])

  const workspaceByAgent = detail?.agent_workspaces ?? {}

  const refreshDetail = useCallback(async () => {
    if (!studioId) return
    const d = await studioApi.getStudioDetail(studioId)
    setDetail(d)
  }, [studioId])

  const setMemberWorkspace = async (agentId: string, path: string) => {
    if (!studioId) return
    setWsSavingAgentId(agentId)
    setError(null)
    try {
      await studioApi.setStudioAgentWorkspace(studioId, agentId, path)
      await refreshDetail()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWsSavingAgentId(null)
    }
  }

  const pickMemberWorkspace = async (agentId: string) => {
    try {
      const p = (await agentApi.openAgentWorkspaceDialog()).trim()
      if (!p) return
      await setMemberWorkspace(agentId, p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleRefreshAll = useCallback(async () => {
    if (!studioId) return
    setRefreshing(true)
    setError(null)
    try {
      const [d, p, board] = await Promise.all([
        studioApi.getStudioDetail(studioId),
        studioApi.getStudioProgress(studioId),
        studioApi.getStudioTodoBoard(studioId),
      ])
      setDetail(d)
      mergeProgress(p)
      setTodoBoard(board)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [studioId, mergeProgress])

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
    return (
      <p className="studio-pixel p-6 text-sm text-[var(--sp-muted)]">无效的工作室</p>
    )
  }

  if (loading && !detail) {
    return (
      <div className="studio-pixel flex flex-1 items-center justify-center p-8 text-sm text-[var(--sp-muted)]">
        加载工作室…
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="studio-pixel p-6">
        <p className="text-sm text-[var(--sp-error-text)]">{error ?? '工作室不存在'}</p>
        <Link
          to="/studios"
          className="mt-2 inline-block border-b-2 border-[var(--sp-border-hot)] text-sm text-[var(--sp-border-hot)]"
        >
          返回列表
        </Link>
      </div>
    )
  }

  return (
    <div className="studio-pixel studio-office-layout studio-workspace-root flex min-h-0 w-full flex-1 flex-col bg-[var(--sp-bg)]">
      <header className="flex flex-shrink-0 flex-col gap-1.5 border-b-2 border-[var(--so-red)] bg-[var(--so-dashboard)] px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            to="/studios"
            className="shrink-0 border border-transparent px-2 py-1 text-sm text-[var(--sp-muted)] transition-colors hover:border-[var(--so-red)] hover:bg-[#252525] hover:text-[var(--sp-text)]"
          >
            ← 工作室列表
          </Link>
          <span className="hidden text-[var(--sp-muted)] sm:inline" aria-hidden>
            /
          </span>
          <h1 className="min-w-0 truncate text-base font-bold text-[var(--sp-text)] sm:text-lg">{detail.studio.name}</h1>
        </div>
        <p className="hidden text-sm leading-relaxed text-[var(--sp-muted)] lg:ml-auto lg:block lg:max-w-xl lg:text-right">
          主 Agent「<span className="font-bold text-[var(--so-red)]">{mainName}</span>」统一收消息；{' '}
          <kbd className="font-mono text-xs">@</kbd> 定向子 Agent。
        </p>
      </header>

      <StudioWorkspaceToolbar
        sceneCollapsed={sceneCollapsed}
        onToggleScene={() => setSceneCollapsed((v) => !v)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenMemo={() => setMemoModalOpen(true)}
        onOpenTodo={() => setTodoModalOpen(true)}
        onOpenMembers={() => setMembersModalOpen(true)}
        onOpenWorkspaces={() => setWorkspaceModalOpen(true)}
        onRefresh={() => void handleRefreshAll()}
        refreshing={refreshing}
      />

      {sceneCollapsed ? (
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b-2 border-[var(--so-red)] bg-[#161616] px-4 py-2 text-sm text-[var(--sp-muted)]">
          <span className="min-w-0 truncate">
            像素场景已收起，下方为任务与对话。当前协作状态：
            <strong className="ml-1 text-[var(--sp-border-hot)]">{displayOfficeMood}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSceneCollapsed(false)}
            className="shrink-0 border border-[var(--so-red)] bg-[var(--so-red)]/20 px-2.5 py-1 text-sm text-[var(--sp-error-text)] hover:bg-[var(--so-red)]/30"
          >
            展开场景
          </button>
        </div>
      ) : (
        <>
          <StudioOfficeScene
            studioName={detail.studio.name}
            mood={displayOfficeMood}
            mainAgentName={mainName}
            subAgents={detail.member_agents
              .filter((a) => a.config.id !== mainId && a.config.type !== 'main')
              .slice(0, 2)
              .map((a) => ({ id: a.config.id, name: a.config.name }))}
            progress={progress}
          />

          <StudioOfficeDashboard
            memoLines={memoLines}
            mood={displayOfficeMood}
            onMoodSelect={(m) => setMoodPin((prev) => (prev === m ? null : m))}
            members={detail.member_agents}
            mainAgentId={mainId}
            onMentionMember={(token) =>
              setMentionAppend((x) => ({ nonce: x.nonce + 1, text: `@${token} ` }))
            }
            onExpandMemo={() => setMemoModalOpen(true)}
            onExpandMembers={() => setMembersModalOpen(true)}
          />

          <StudioOfficeTicker text={tickerText} />
        </>
      )}

      {error && (
        <div className="mx-4 mt-2 border-2 border-[var(--sp-error-border)] bg-[var(--sp-error-bg)] px-3 py-2 text-sm text-[var(--sp-error-text)] sm:mx-6">
          {error}
        </div>
      )}

      <div className="studio-workspace-grid grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.15fr)] lg:divide-x lg:divide-[var(--sp-border)]">
        <section className="flex min-h-0 flex-col border-b-2 border-[var(--sp-border)] lg:min-h-0 lg:border-b-0">
          <div className="flex-shrink-0 border-b-2 border-[var(--sp-border)] bg-[var(--sp-panel)] px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--sp-text)]">任务进度</h2>
                <p className="text-xs text-[var(--sp-muted)]">按成员筛选，聚焦单个子 Agent 的委派与产出摘要</p>
              </div>
              <label className="flex items-center gap-1.5 text-sm text-[var(--sp-text)]">
                <span className="text-[var(--sp-muted)]">成员</span>
                <select
                  className="max-w-[140px] border-2 border-[var(--sp-border)] bg-[var(--sp-code)] px-2 py-1 text-sm text-[var(--sp-text)]"
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
          <div className="studio-progress-scroll min-h-[200px] flex-1 overflow-y-auto bg-[var(--sp-bg-deep)] px-3 py-3 lg:min-h-0">
            {progress.length === 0 ? (
              <p className="text-sm text-[var(--sp-muted)]">暂无进度；主 Agent 使用委派工具后此处会更新。</p>
            ) : filteredProgress.length === 0 ? (
              <p className="text-sm text-[var(--sp-muted)]">当前筛选下无事件，请换一名成员或选「全部」。</p>
            ) : (
              <ul className="space-y-3">
                {filteredProgress.map((ev) => (
                  <li
                    key={ev.entry_id}
                    className="border-2 border-[var(--sp-border)] bg-[var(--sp-panel)] px-3 py-2 text-sm text-[var(--sp-text)] shadow-[var(--sp-pixel-shadow-sm)]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <span className="font-bold text-[var(--sp-text)]">{kindLabels[ev.kind] ?? ev.kind}</span>
                      <span className="text-xs text-[var(--sp-muted)]">{formatTime(ev.timestamp)}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--sp-muted)]">
                      <span className="text-[var(--sp-border)]">Agent:</span> {ev.agent_name}{' '}
                      <code className="border border-[var(--sp-border)] bg-[var(--sp-code)] px-1 text-xs text-[var(--sp-text)]">
                        {ev.agent_id}
                      </code>
                    </p>
                    {ev.task_preview ? (
                      <p className="mt-1 line-clamp-4 text-sm text-[var(--sp-muted)]">
                        <span className="text-[var(--sp-border)]">任务:</span> {ev.task_preview}
                      </p>
                    ) : null}
                    {ev.result_preview ? (
                      <p className="mt-1 line-clamp-3 text-sm text-[var(--sp-muted)]">
                        <span className="text-[var(--sp-border)]">结果摘要:</span> {ev.result_preview}
                      </p>
                    ) : null}
                    {ev.error ? <p className="mt-1 text-sm text-[var(--sp-error-text)]">{ev.error}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <details className="group border-t-2 border-[var(--sp-border)] bg-[var(--sp-panel)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-bold text-[var(--sp-text)] marker:content-none [&::-webkit-details-marker]:hidden hover:bg-[var(--sp-panel-2)]">
              <span>TODO 看板</span>
              <span className="flex items-center gap-2 text-xs font-normal text-[var(--sp-muted)]">
                {todoBoard.length > 0 ? `${todoBoard.length} 名 Agent` : '暂无'}
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-[var(--sp-muted)] transition-transform group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="border-t-2 border-[var(--sp-border)] px-4 pb-3 pt-1">
              <p className="mb-2 text-xs text-[var(--sp-muted)]">
                各 Agent 通过工具维护；约每 105s 主 Agent 进度巡检，简报出现在右侧对话。
              </p>
              <div className="max-h-40 overflow-y-auto text-sm text-[var(--sp-muted)]">
                {todoBoard.length === 0 ? (
                  <p className="text-[var(--sp-muted)]">暂无数据；对话中可使用 devpilot_studio_todo 写入清单。</p>
                ) : (
                  <ul className="space-y-2">
                    {todoBoard.map((row) => {
                      const items = Array.isArray(row.items) ? row.items : []
                      const rowKey = row.agent_id || `row_${items.length}`
                      return (
                        <li
                          key={rowKey}
                          className="border-2 border-[var(--sp-border)] bg-[var(--sp-panel-2)] px-2 py-1.5 shadow-[var(--sp-pixel-shadow-sm)]"
                        >
                          <p className="font-bold text-[var(--sp-text)]">{row.agent_name ?? row.agent_id}</p>
                          {items.length === 0 ? (
                            <p className="text-[var(--sp-muted)]">未设置 TODO</p>
                          ) : (
                            <ul className="mt-0.5 list-none space-y-0.5 pl-0">
                              {items.map((it, idx) => (
                                <li key={it.id || `todo_${idx}`} className="flex gap-1.5">
                                  <span
                                    className={
                                      it.done ? 'text-[#3ecf8e]' : 'text-[var(--sp-muted)]'
                                    }
                                  >
                                    {it.done ? '☑' : '☐'}
                                  </span>
                                  <span
                                    className={
                                      it.done ? 'text-[var(--sp-muted)] line-through' : 'text-[var(--sp-text)]'
                                    }
                                  >
                                    <code className="font-mono text-xs text-[var(--sp-border)]">{it.id}</code> {it.title}
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
            </div>
          </details>

          <details className="group border-t-2 border-[var(--sp-border)] bg-[var(--sp-panel)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-bold text-[var(--sp-text)] marker:content-none [&::-webkit-details-marker]:hidden hover:bg-[var(--sp-panel-2)]">
              <span>成员工作区目录</span>
              <svg
                className="h-3.5 w-3.5 shrink-0 text-[var(--sp-muted)] transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="border-t-2 border-[var(--sp-border)] px-4 pb-3 pt-1">
              <p className="mb-2 text-xs leading-relaxed text-[var(--sp-muted)]">
                本工作室内为每名成员单独设置文件工具根目录；未设置则沿用 Agent 全局「专属工作区」或应用默认。
              </p>
              <ul className="max-h-36 space-y-2 overflow-y-auto text-sm">
                {detail.member_agents.map((a) => {
                  const id = a.config.id
                  const cur = workspaceByAgent[id] ?? ''
                  const busy = wsSavingAgentId === id
                  return (
                    <li
                      key={id}
                      className="border-2 border-[var(--sp-border)] bg-[var(--sp-panel-2)] px-2 py-1.5 shadow-[var(--sp-pixel-shadow-sm)]"
                    >
                      <div className="font-bold text-[var(--sp-text)]">
                        {a.config.name}{' '}
                        <code className="text-xs font-normal text-[var(--sp-muted)]">{id}</code>
                      </div>
                      <p
                        className="mt-0.5 truncate font-mono text-xs text-[var(--sp-muted)]"
                        title={cur || '（未设置）'}
                      >
                        {cur || '— 未单独设置 —'}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void pickMemberWorkspace(id)}
                          className="border-2 border-[var(--sp-border)] bg-[var(--sp-code)] px-2 py-0.5 text-sm text-[var(--sp-text)] hover:border-[var(--sp-border-hot)] disabled:opacity-50"
                        >
                          {busy ? '…' : '选择目录'}
                        </button>
                        {cur ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setMemberWorkspace(id, '')}
                            className="border-2 border-[var(--sp-border)] px-2 py-0.5 text-sm text-[var(--sp-muted)] hover:text-[var(--sp-border-hot)] disabled:opacity-50"
                          >
                            清除
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </details>

          <details className="group border-t-2 border-[var(--sp-border)] bg-[var(--sp-bg-deep)]" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-bold text-[var(--sp-text)] marker:content-none [&::-webkit-details-marker]:hidden hover:bg-[var(--sp-panel)]">
              <span>协作成员 · 点击插入 @</span>
              <svg
                className="h-3.5 w-3.5 shrink-0 text-[var(--sp-muted)] transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="border-t-2 border-[var(--sp-border)] px-4 pb-3 pt-2">
              <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-[var(--sp-muted)]">
                {detail.member_agents.map((a) => {
                  const isMain = a.config.id === mainId || a.config.type === 'main'
                  return (
                    <li key={a.config.id}>
                      <button
                        type="button"
                        disabled={isMain}
                        title={isMain ? '主 Agent 为统一入口，无需 @' : '插入 @ 到输入框'}
                        className={`w-full border-2 border-transparent px-1.5 py-1 text-left transition-colors ${isMain ? 'cursor-default opacity-70' : 'cursor-pointer hover:border-[var(--sp-border)] hover:bg-[var(--sp-panel)] hover:text-[var(--sp-border-hot)]'}`}
                        onClick={() => {
                          if (isMain) return
                          const token = /\s/.test(a.config.name) ? a.config.id : a.config.name
                          setMentionAppend((x) => ({ nonce: x.nonce + 1, text: `@${token} ` }))
                        }}
                      >
                        <span className="font-bold text-[var(--sp-text)]">{a.config.name}</span>{' '}
                        <span className="text-[var(--sp-muted)]">({a.config.type})</span>
                        <code className="ml-1 font-mono text-xs text-[var(--sp-border)]">{a.config.id}</code>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </details>
        </section>

        <section className="studio-chat-column flex min-h-[50vh] flex-col bg-[var(--sp-bg-deep)] lg:min-h-0">
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b-2 border-[var(--sp-border)] bg-[var(--sp-panel)] px-4 py-2.5">
            <div className="min-w-0">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--sp-text)]">对话</h2>
              <p className="mt-0.5 text-sm text-[var(--sp-muted)]">
                主 Agent：<span className="font-bold text-[var(--sp-border-hot)]">{mainName}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title="工作室使用说明"
              className="shrink-0 border-2 border-[var(--sp-border)] bg-[var(--sp-code)] px-2.5 py-1 text-sm text-[var(--sp-text)] hover:border-[var(--so-red)]"
            >
              说明
            </button>
          </div>
          <div className="agent-chat-messages min-h-0 flex-1 overflow-y-auto">
            <ChatMessages
              messages={messages}
              isLoading={sending}
              agentName={mainName}
              modelName={detail.member_agents.find((x) => x.config.id === mainId)?.config.model_config?.model}
              pixelMode
            />
          </div>
          <footer className="agent-chat-composer">
            <div className="agent-chat-composer-inner">
              <StudioTeamChatInput
                onSend={(display, payload) => void onSend(display, payload)}
                isLoading={sending}
                placeholder={`发给 ${mainName}（@ 子 Agent 定向）…`}
                members={detail.member_agents}
                mainAgentId={mainId}
                externalAppend={mentionAppend}
                pixelStyle
              />
            </div>
          </footer>
        </section>
      </div>

      <StudioWorkspaceModalShell open={helpOpen} title="工作室使用说明" onClose={() => setHelpOpen(false)}>
        <ul className="list-none space-y-3 pl-0 text-sm leading-relaxed text-[var(--sp-text)]">
          <li className="border-l-2 border-[var(--so-red)] pl-3">
            <strong className="text-[var(--sp-text)]">对话入口</strong>
            ：仅主 Agent 接收你的消息；子任务由主 Agent 通过委派工具下发，你在左侧「任务进度」可看到状态。
          </li>
          <li className="border-l-2 border-[var(--so-red)] pl-3">
            <strong className="text-[var(--sp-text)]">@ 定向</strong>
            ：在输入框输入 <kbd className="rounded bg-[var(--sp-code)] px-1">@</kbd> 子 Agent 名称或 id，消息仍发给主 Agent，但会附带定向说明。
          </li>
          <li className="border-l-2 border-[var(--so-red)] pl-3">
            <strong className="text-[var(--sp-text)]">顶栏工具</strong>
            ：可收起像素场景以腾出纵向空间专注对话；「刷新数据」会同步详情、进度与 TODO 看板。
          </li>
          <li className="border-l-2 border-[var(--so-red)] pl-3">
            <strong className="text-[var(--sp-text)]">TODO 与巡检</strong>
            ：各 Agent 可用工具维护清单；约每 105s 主 Agent 会做进度巡检，简报出现在右侧对话。
          </li>
          <li className="border-l-2 border-[var(--so-red)] pl-3">
            <strong className="text-[var(--sp-text)]">工作区目录</strong>
            ：可为每名成员单独设置文件工具根目录；未设置则沿用 Agent 全局或应用默认。
          </li>
        </ul>
      </StudioWorkspaceModalShell>

      <StudioWorkspaceModalShell open={memoModalOpen} title="工作室小记（全文）" onClose={() => setMemoModalOpen(false)}>
        {memoLinesFull.length === 0 ? (
          <p className="text-sm text-[var(--sp-muted)]">暂无摘要；委派子 Agent 或写入 TODO 后会出现条目。</p>
        ) : (
          <ul className="list-none space-y-2 pl-0">
            {memoLinesFull.map((line, i) => (
              <li
                key={i}
                className="border border-[var(--sp-border)] bg-[var(--sp-panel-2)] px-3 py-2 text-sm text-[var(--sp-text)]"
              >
                {line}
              </li>
            ))}
          </ul>
        )}
      </StudioWorkspaceModalShell>

      <StudioWorkspaceModalShell open={todoModalOpen} title="TODO 看板" onClose={() => setTodoModalOpen(false)} wide>
        <p className="mb-3 text-sm text-[var(--sp-muted)]">
          数据来自各 Agent 的工具调用；可在左侧折叠栏同步查看。
        </p>
        {todoBoard.length === 0 ? (
          <p className="text-sm text-[var(--sp-muted)]">暂无数据；对话中可使用 devpilot_studio_todo 写入清单。</p>
        ) : (
          <ul className="space-y-3">
            {todoBoard.map((row) => {
              const items = Array.isArray(row.items) ? row.items : []
              const rowKey = row.agent_id || `row_${items.length}`
              return (
                <li
                  key={rowKey}
                  className="border-2 border-[var(--sp-border)] bg-[var(--sp-bg-deep)] px-3 py-2 text-sm"
                >
                  <p className="font-bold text-[var(--sp-text)]">{row.agent_name ?? row.agent_id}</p>
                  {items.length === 0 ? (
                    <p className="mt-1 text-[var(--sp-muted)]">未设置 TODO</p>
                  ) : (
                    <ul className="mt-2 list-none space-y-1 pl-0">
                      {items.map((it, idx) => (
                        <li key={it.id || `todo_${idx}`} className="flex gap-2 text-[var(--sp-text)]">
                          <span className={it.done ? 'text-emerald-400' : 'text-[var(--sp-muted)]'}>
                            {it.done ? '☑' : '☐'}
                          </span>
                          <span className={it.done ? 'text-[var(--sp-muted)] line-through' : ''}>
                            <code className="text-xs text-[var(--sp-muted)]">{it.id}</code> {it.title}
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
      </StudioWorkspaceModalShell>

      <StudioWorkspaceModalShell open={membersModalOpen} title="协作成员" onClose={() => setMembersModalOpen(false)} wide>
        <p className="mb-3 text-sm text-[var(--sp-muted)]">
          主 Agent 为统一入口；点击下方「插入 @」可将定向前缀写入输入框。
        </p>
        <ul className="space-y-2">
          {detail.member_agents.map((a) => {
            const isMain = a.config.id === mainId || a.config.type === 'main'
            const token = /\s/.test(a.config.name) ? a.config.id : a.config.name
            return (
              <li
                key={a.config.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-[var(--sp-border)] bg-[var(--sp-panel-2)] px-3 py-2"
              >
                <div>
                  <span className="font-semibold text-[var(--sp-text)]">{a.config.name}</span>
                  <span className="ml-2 text-sm text-[var(--sp-muted)]">
                    {a.config.type}
                    {isMain ? ' · 主入口' : ''}
                  </span>
                  <div className="mt-0.5 font-mono text-xs text-[var(--sp-muted)]">{a.config.id}</div>
                </div>
                {!isMain ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMentionAppend((x) => ({ nonce: x.nonce + 1, text: `@${token} ` }))
                      setMembersModalOpen(false)
                    }}
                    className="border-2 border-[var(--so-red)] bg-[var(--so-red)]/20 px-3 py-1.5 text-sm font-medium text-[var(--sp-error-text)] hover:bg-[var(--so-red)]/35"
                  >
                    插入 @ 并关闭
                  </button>
                ) : (
                  <span className="text-sm text-[var(--sp-muted)]">无需 @</span>
                )}
              </li>
            )
          })}
        </ul>
      </StudioWorkspaceModalShell>

      <StudioWorkspaceModalShell
        open={workspaceModalOpen}
        title="成员工作区目录"
        onClose={() => setWorkspaceModalOpen(false)}
        wide
      >
        <p className="mb-3 text-sm text-[var(--sp-muted)]">
          为每名成员设置文件工具根目录；留空则沿用 Agent 全局「专属工作区」或应用默认。
        </p>
        <ul className="space-y-3">
          {detail.member_agents.map((a) => {
            const id = a.config.id
            const cur = workspaceByAgent[id] ?? ''
            const busy = wsSavingAgentId === id
            return (
              <li
                key={id}
                className="border-2 border-[var(--sp-border)] bg-[var(--sp-panel-2)] px-3 py-2 text-sm"
              >
                <div className="font-bold text-[var(--sp-text)]">
                  {a.config.name}{' '}
                  <code className="text-xs font-normal text-[var(--sp-muted)]">{id}</code>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-[var(--sp-muted)]">{cur || '— 未单独设置 —'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pickMemberWorkspace(id)}
                    className="border-2 border-[var(--sp-border)] bg-[var(--sp-code)] px-3 py-1 text-sm text-[var(--sp-text)] hover:border-[var(--so-red)] disabled:opacity-50"
                  >
                    {busy ? '…' : '选择目录'}
                  </button>
                  {cur ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setMemberWorkspace(id, '')}
                      className="border-2 border-[var(--sp-border)] px-3 py-1 text-sm text-[var(--sp-muted)] hover:text-[var(--so-red)] disabled:opacity-50"
                    >
                      清除
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </StudioWorkspaceModalShell>
    </div>
  )
}
