import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentInfo } from '../../agent/types'

interface StudioTeamChatInputProps {
  /** displayForUi：气泡中展示的用户原文；textForMain：实际发给主 Agent 的内容（可含 @ 定向前缀） */
  onSend: (displayForUi: string, textForMain: string) => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
  /** 当前工作室全部成员（含 main），用于 @ 子 Agent / worker */
  members: AgentInfo[]
  mainAgentId: string
  /** 父组件触发：nonce 变化时在光标处或末尾追加 text（如点击成员列表） */
  externalAppend?: { text: string; nonce: number }
  /** 与工作室 .studio-pixel 根节点配套的像素风输入区 */
  pixelStyle?: boolean
}

/** 从用户原文解析 @token，生成发给主 Agent 的带前缀消息（仍只走主 Agent 入口） */
export function buildStudioDirectedMessage(raw: string, members: AgentInfo[], mainAgentId: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  const subWorkers = members.filter((m) => m.config.id !== mainAgentId && m.config.type !== 'main')
  if (subWorkers.length === 0) return trimmed

  const re = /@([\w\u4e00-\u9fa5.-]+)/g
  const seen = new Set<string>()
  const directives: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed)) !== null) {
    const token = m[1]
    const ag =
      subWorkers.find((x) => x.config.id === token) ?? subWorkers.find((x) => x.config.name === token)
    if (ag && !seen.has(ag.config.id)) {
      seen.add(ag.config.id)
      directives.push(`子 Agent「${ag.config.name}」（id: ${ag.config.id}）`)
    }
  }

  if (directives.length === 0) return trimmed
  return (
    `【用户 @ 定向】请优先通过委派工具 devpilot_delegate_to_sub_agent 将本轮任务交给：${directives.join('；')}。\n\n` +
    trimmed
  )
}

export function StudioTeamChatInput({
  onSend,
  isLoading,
  disabled = false,
  placeholder = 'Message (Enter 发送)',
  members,
  mainAgentId,
  externalAppend,
  pixelStyle = false,
}: StudioTeamChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionHighlight, setMentionHighlight] = useState(0)
  const lastExternalNonce = useRef<number | undefined>(undefined)

  const mentionTargets = useMemo(
    () => members.filter((m) => m.config.id !== mainAgentId && m.config.type !== 'main'),
    [members, mainAgentId]
  )

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase()
    if (!q) return mentionTargets
    return mentionTargets.filter(
      (m) =>
        m.config.name.toLowerCase().includes(q) || m.config.id.toLowerCase().includes(q)
    )
  }, [mentionTargets, mentionQuery])

  useEffect(() => {
    setMentionHighlight((h) => (filteredMentions.length === 0 ? 0 : Math.min(h, filteredMentions.length - 1)))
  }, [filteredMentions.length, mentionQuery])

  useEffect(() => {
    if (externalAppend == null) return
    if (lastExternalNonce.current === externalAppend.nonce) return
    lastExternalNonce.current = externalAppend.nonce
    setMessage((prev) => `${prev}${externalAppend.text}`)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [externalAppend])

  const updateMentionUI = (value: string, cursor: number) => {
    const before = value.slice(0, cursor)
    const at = before.lastIndexOf('@')
    if (at < 0) {
      setMentionOpen(false)
      return
    }
    const afterAt = before.slice(at + 1)
    if (afterAt.includes(' ') || afterAt.includes('\n')) {
      setMentionOpen(false)
      return
    }
    setMentionQuery(afterAt)
    setMentionOpen(mentionTargets.length > 0)
    setMentionHighlight(0)
  }

  const insertMention = (agent: AgentInfo) => {
    const el = textareaRef.current
    if (!el) return
    const value = message
    const cursor = el.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const at = before.lastIndexOf('@')
    if (at < 0) return
    const token = /\s/.test(agent.config.name) ? agent.config.id : agent.config.name
    const inserted = `${before.slice(0, at)}@${token} ${after}`
    setMessage(inserted)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      const pos = at + token.length + 2
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const submitMessage = () => {
    const trimmed = message.trim()
    if (!trimmed || isLoading || disabled) return
    const textForMain = buildStudioDirectedMessage(trimmed, members, mainAgentId)
    onSend(trimmed, textForMain)
    setMessage('')
    setMentionOpen(false)
    if (textareaRef.current) textareaRef.current.style.height = '40px'
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitMessage()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionHighlight((i) => (i + 1) % filteredMentions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionHighlight((i) => (i - 1 + filteredMentions.length) % filteredMentions.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        insertMention(filteredMentions[Math.min(mentionHighlight, filteredMentions.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionOpen(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitMessage()
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px'
      const sh = textareaRef.current.scrollHeight
      textareaRef.current.style.height = `${Math.min(sh, 160)}px`
    }
  }, [message])

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      {mentionOpen && filteredMentions.length > 0 && (
        <ul
          className={
            pixelStyle
              ? 'absolute bottom-full left-0 right-0 z-20 mb-1 max-h-40 overflow-y-auto border-2 border-[var(--sp-border)] bg-[var(--sp-panel)] py-1 text-left text-sm shadow-[var(--sp-pixel-shadow)]'
              : 'absolute bottom-full left-0 right-0 z-20 mb-1 max-h-40 overflow-y-auto rounded-lg border border-studio-border bg-studio-panel py-1 text-left text-sm shadow-lg'
          }
          role="listbox"
        >
          {filteredMentions.map((m, idx) => (
            <li key={m.config.id}>
              <button
                type="button"
                role="option"
                className={`w-full px-3 py-1.5 text-left ${
                  pixelStyle
                    ? idx === mentionHighlight
                      ? 'bg-[var(--sp-panel-2)] text-[var(--sp-border-hot)]'
                      : 'text-[var(--sp-text)] hover:bg-[var(--sp-panel-2)]'
                    : idx === mentionHighlight
                      ? 'bg-rose-50 text-rose-900'
                      : 'text-studio-text hover:bg-studio-panel-2'
                }`}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => insertMention(m)}
              >
                <span className="font-medium">{m.config.name}</span>
                <span className="ml-2 text-xs text-studio-muted">
                  {m.config.type} · {m.config.id}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        className={
          pixelStyle
            ? 'flex items-end gap-2 border-2 border-[var(--sp-border)] bg-[var(--sp-code)] p-2 shadow-[var(--sp-pixel-shadow)] transition-all focus-within:border-[var(--sp-border-hot)]'
            : 'flex items-end gap-2 rounded-2xl border border-studio-border bg-studio-panel p-2 shadow-md transition-all hover:border-studio-hot focus-within:border-studio-hot focus-within:ring-2 focus-within:ring-studio-hot/25'
        }
      >
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={
              pixelStyle
                ? 'p-2 text-[var(--sp-muted)] hover:bg-[var(--sp-panel)]'
                : 'rounded-lg p-2 text-studio-muted hover:bg-studio-panel-2'
            }
            title="附件"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <button
            type="button"
            className={
              pixelStyle
                ? 'p-2 text-[var(--sp-muted)] hover:bg-[var(--sp-panel)]'
                : 'rounded-lg p-2 text-studio-muted hover:bg-studio-panel-2'
            }
            title="语音输入"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v6m3-13a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => {
            const v = e.target.value
            setMessage(v)
            updateMentionUI(v, e.target.selectionStart ?? v.length)
          }}
          onSelect={(e) => updateMentionUI(message, e.currentTarget.selectionStart ?? message.length)}
          onClick={(e) => updateMentionUI(message, e.currentTarget.selectionStart ?? message.length)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          rows={1}
          className={
            pixelStyle
              ? 'min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm text-[var(--sp-text)] placeholder-[var(--sp-muted)] focus:outline-none focus:ring-0 disabled:opacity-60'
              : 'min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm text-studio-text placeholder-studio-muted focus:outline-none focus:ring-0 disabled:opacity-60'
          }
          style={{ minHeight: '40px', maxHeight: '160px' }}
        />

        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={
              pixelStyle
                ? 'p-2 text-[var(--sp-muted)] hover:bg-[var(--sp-panel)]'
                : 'rounded-lg p-2 text-studio-muted hover:bg-studio-panel-2'
            }
            title="添加"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            type="button"
            className={
              pixelStyle
                ? 'p-2 text-[var(--sp-muted)] hover:bg-[var(--sp-panel)]'
                : 'rounded-lg p-2 text-studio-muted hover:bg-studio-panel-2'
            }
            title="下载"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            type="submit"
            disabled={!message.trim() || isLoading || disabled}
            className={
              pixelStyle
                ? 'flex h-11 w-11 flex-shrink-0 items-center justify-center border-2 border-black bg-[var(--sp-accent)] text-white shadow-[var(--sp-pixel-shadow)] transition-colors hover:bg-[var(--sp-border-hot)] disabled:cursor-not-allowed disabled:opacity-40'
                : 'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#e11d48] text-white shadow-sm transition-colors hover:bg-[#be123c] disabled:cursor-not-allowed disabled:opacity-40'
            }
            title="发送"
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {mentionTargets.length > 0 ? (
        <p
          className={
            pixelStyle ? 'mt-1.5 text-xs text-[var(--sp-muted)]' : 'mt-1.5 text-xs text-studio-muted'
          }
        >
          输入 <kbd className={pixelStyle ? '' : 'rounded bg-studio-border px-1'}>@</kbd>{' '}
          可定向子 Agent；消息仍由主 Agent 统一接收与委派。
        </p>
      ) : null}
    </form>
  )
}
