import React from 'react'
import type { AgentInfo } from '../../agent/types'
import type { StudioProgressEvent, StudioTodoBoardRow } from '../types'

const kindLabels: Record<string, string> = {
  delegation_started: '委派开始',
  delegation_finished: '委派完成',
  delegation_failed: '委派失败',
  sub_task_accepted: '子 Agent 接单',
  sub_task_finished: '子 Agent 完成',
  sub_task_failed: '子 Agent 失败',
}

export type StudioOfficeMood = 'idle' | 'work' | 'sync' | 'alarm'

interface StudioOfficeDashboardProps {
  memoLines: string[]
  mood: StudioOfficeMood
  onMoodSelect: (m: StudioOfficeMood) => void
  members: AgentInfo[]
  mainAgentId: string
  onMentionMember: (token: string) => void
  /** 在弹窗中查看完整小记 */
  onExpandMemo?: () => void
  /** 在弹窗中查看全部成员 */
  onExpandMembers?: () => void
}

const MOOD_META: Record<
  StudioOfficeMood,
  { label: string; hint: string }
> = {
  idle: { label: '待命', hint: '等待指令' },
  work: { label: '工作', hint: '主 Agent 处理中' },
  sync: { label: '同步', hint: '委派 / 子任务流转' },
  alarm: { label: '报警', hint: '错误或失败事件' },
}

export function StudioOfficeDashboard({
  memoLines,
  mood,
  onMoodSelect,
  members,
  mainAgentId,
  onMentionMember,
  onExpandMemo,
  onExpandMembers,
}: StudioOfficeDashboardProps) {
  return (
    <div className="studio-office-dashboard grid shrink-0 grid-cols-1 gap-3 border-b-2 border-[var(--so-red)] bg-[var(--so-dashboard)] px-3 py-3 sm:grid-cols-3 sm:gap-4 sm:px-4">
      {/* 昨日小记风格 */}
      <div className="studio-office-card studio-office-card--paper flex min-h-[140px] flex-col border border-[var(--so-red)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#c4b49a] pb-1">
          <h3 className="text-sm font-bold text-[var(--so-paper-ink)]">工作室小记</h3>
          {onExpandMemo ? (
            <button
              type="button"
              onClick={onExpandMemo}
              className="shrink-0 border border-[#a16207] bg-[#fef3c7]/80 px-2 py-0.5 text-xs font-medium text-[#713f12] hover:bg-[#fde68a]"
            >
              弹窗查看
            </button>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto text-left text-sm leading-relaxed text-[var(--so-paper-ink)]">
          {memoLines.length === 0 ? (
            <p className="text-[#7d6b5a]">暂无近期动态；委派子 Agent 后这里会记下摘要。</p>
          ) : (
            <ul className="list-none space-y-1.5 pl-0">
              {memoLines.map((line, i) => (
                <li key={i} className="border-l-2 border-[#c9a227] pl-2">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Star 状态风格 */}
      <div className="studio-office-card flex min-h-[140px] flex-col border border-[var(--so-red)] bg-[var(--so-charcoal)] p-3">
        <h3 className="mb-2 text-sm font-bold text-[var(--sp-text)]">协作状态</h3>
        <p className="mb-2 text-xs text-[var(--sp-muted)]">根据发送与进度推断；点击可固定展示（再点同一项取消固定）</p>
        <div className="grid flex-1 grid-cols-2 gap-2">
          {(Object.keys(MOOD_META) as StudioOfficeMood[]).map((m) => {
            const active = mood === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => onMoodSelect(m)}
                className={`border px-2 py-2 text-center text-sm font-semibold transition-colors ${
                  active
                    ? 'border-[var(--so-red)] bg-[var(--so-red)] text-white'
                    : 'border-[#444] bg-[#252525] text-[var(--sp-text)] hover:border-[var(--so-red)] hover:text-white'
                }`}
              >
                {MOOD_META[m].label}
                <span className="mt-0.5 block text-xs font-normal opacity-90">{MOOD_META[m].hint}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 访客列表风格 */}
      <div className="studio-office-card flex min-h-[140px] flex-col border border-[var(--so-red)] bg-[var(--so-charcoal)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--sp-text)]">成员一览</h3>
          {onExpandMembers ? (
            <button
              type="button"
              onClick={onExpandMembers}
              className="shrink-0 border border-[#555] bg-[#333] px-2 py-0.5 text-xs text-[var(--sp-text)] hover:border-[var(--so-red)]"
            >
              弹窗查看
            </button>
          ) : null}
        </div>
        <ul className="max-h-[100px] flex-1 space-y-1.5 overflow-y-auto text-sm">
          {members.map((a) => {
            const isMain = a.config.id === mainAgentId || a.config.type === 'main'
            return (
              <li
                key={a.config.id}
                className="flex flex-wrap items-center justify-between gap-1 border-b border-[#333] py-1 last:border-0"
              >
                <div>
                  <span className="font-semibold text-[var(--sp-text)]">{a.config.name}</span>
                  <span className="ml-1 text-[var(--sp-muted)]">
                    {isMain ? '主入口 · 待命' : `${a.config.type}`}
                  </span>
                </div>
                {!isMain ? (
                  <button
                    type="button"
                    onClick={() =>
                      onMentionMember(/\s/.test(a.config.name) ? a.config.id : a.config.name)
                    }
                    className="border border-[#555] px-2 py-0.5 text-xs text-[var(--sp-text)] hover:border-[var(--so-red)] hover:text-[var(--so-red)]"
                  >
                    @ 定向
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/** 从进度与 TODO 生成小记行（最多 max 条） */
export function buildStudioMemoLines(
  progress: StudioProgressEvent[],
  todoBoard: StudioTodoBoardRow[],
  max: number
): string[] {
  const lines: string[] = []
  const recent = [...progress].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  for (const ev of recent) {
    if (lines.length >= max) break
    const label = kindLabels[ev.kind] ?? ev.kind
    const bit =
      ev.task_preview?.slice(0, 48) ||
      ev.result_preview?.slice(0, 48) ||
      ev.error?.slice(0, 48) ||
      `${ev.agent_name}`
    lines.push(`${label} · ${bit}${bit.length >= 48 ? '…' : ''}`)
  }
  if (lines.length < max && todoBoard.length > 0) {
    for (const row of todoBoard) {
      if (lines.length >= max) break
      const items = Array.isArray(row.items) ? row.items : []
      const open = items.filter((i) => !i.done).slice(0, 2)
      if (open.length === 0 && items.length > 0) {
        lines.push(`TODO · ${row.agent_name ?? row.agent_id} 项已全部勾选`)
      } else if (open.length > 0) {
        lines.push(`TODO · ${row.agent_name}: ${open.map((i) => i.title).join('；')}`)
      }
    }
  }
  return lines.slice(0, max)
}

/** 底部状态条（Star-Office 式滚动字幕） */
export function StudioOfficeTicker({ text }: { text: string }) {
  const safe = text.trim() || 'DevPilot 工作室'
  const chunk = `${safe} · `
  return (
    <div className="studio-office-ticker shrink-0 border-b-2 border-[var(--so-red)] bg-[#0a0a0a] py-1.5">
      <div className="overflow-hidden">
        <div className="studio-office-marquee-inner flex w-max text-sm text-[var(--sp-muted)]">
          <span className="whitespace-nowrap px-3">{chunk}</span>
          <span className="whitespace-nowrap px-3">{chunk}</span>
        </div>
      </div>
    </div>
  )
}

export function deriveStudioOfficeMood(
  sending: boolean,
  hasError: boolean,
  progress: StudioProgressEvent[]
): StudioOfficeMood {
  if (hasError) return 'alarm'
  if (sending) return 'work'
  const last = progress.length
    ? [...progress].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0]
    : null
  if (last) {
    if (last.error || last.kind === 'delegation_failed' || last.kind === 'sub_task_failed') {
      return 'alarm'
    }
    const age = Date.now() - new Date(last.timestamp).getTime()
    if (
      age < 45000 &&
      (last.kind === 'delegation_started' ||
        last.kind === 'sub_task_accepted' ||
        last.kind === 'sub_task_finished' ||
        last.kind === 'delegation_finished')
    ) {
      return 'sync'
    }
  }
  return 'idle'
}
