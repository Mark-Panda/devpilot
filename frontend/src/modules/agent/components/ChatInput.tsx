import React, { useState, useRef, useEffect } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  /** 无可用会话时禁用输入 */
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  isLoading,
  disabled = false,
  placeholder = 'Message (Enter 发送)',
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isLoading && !disabled) {
      onSend(message.trim())
      setMessage('')
      if (textareaRef.current) textareaRef.current.style.height = '40px'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
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
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-end gap-2 rounded-2xl border border-studio-border bg-studio-panel p-2 shadow-md transition-all hover:border-studio-hot focus-within:border-studio-hot focus-within:ring-2 focus-within:ring-studio-hot/25">
        {/* 左侧：附件、语音 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" className="rounded-lg p-2 text-studio-muted hover:bg-studio-panel-2" title="附件">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
          </button>
          <button type="button" className="rounded-lg p-2 text-studio-muted hover:bg-studio-panel-2" title="语音输入">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v6m3-13a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
        </div>

        {/* 输入框 */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          rows={1}
          className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm text-studio-text placeholder-studio-muted focus:outline-none focus:ring-0 disabled:opacity-60"
          style={{ minHeight: '40px', maxHeight: '160px' }}
        />

        {/* 右侧：加号、下载、发送 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" className="rounded-lg p-2 text-studio-muted hover:bg-studio-panel-2" title="添加">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
          <button type="button" className="rounded-lg p-2 text-studio-muted hover:bg-studio-panel-2" title="下载">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          </button>
          <button
            type="submit"
            disabled={!message.trim() || isLoading || disabled}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#e11d48] text-white shadow-sm transition-colors hover:bg-[#be123c] disabled:cursor-not-allowed disabled:opacity-40"
            title="发送"
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
