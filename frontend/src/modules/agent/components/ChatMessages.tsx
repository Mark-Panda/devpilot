import React, { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types'

interface ChatMessagesProps {
  messages: ChatMessage[]
  isLoading: boolean
  systemPrompt?: string
  agentName?: string
  modelName?: string
  /** 工作室像素风：与 .studio-pixel 根节点配套 */
  pixelMode?: boolean
}

function IconLightning({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z" />
    </svg>
  )
}

function IconStar({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  )
}

type ToolCall = { name?: string; summary?: string }

export function ChatMessages({
  messages,
  isLoading,
  systemPrompt,
  agentName,
  modelName,
  pixelMode = false,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, systemPrompt])

  const hasContent = messages.length > 0 || systemPrompt || isLoading

  if (!hasContent) {
    if (pixelMode) {
      return (
        <div className="mx-auto flex h-full w-full max-w-4xl min-h-[280px] flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-5 text-[var(--sp-muted)]">
            <svg className="mx-auto h-14 w-14" fill="none" stroke="currentColor" strokeWidth={1.25} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-bold text-[var(--sp-text)]">开始对话</h3>
          <p className="mb-8 text-sm text-[var(--sp-muted)]">在下方输入消息发送给主 Agent</p>
          <div className="grid w-full max-w-xl grid-cols-1 gap-3 text-left sm:grid-cols-2">
            {['分析当前项目结构', '解释一段代码', '写一个 HTTP 客户端示例', '列出常用重构手法'].map((text, idx) => (
              <div
                key={idx}
                className="border-2 border-[var(--sp-border)] bg-[var(--sp-panel)] p-3 text-sm text-[var(--sp-muted)] shadow-[var(--sp-pixel-shadow)] transition-colors hover:border-[var(--sp-border-hot)]"
              >
                &gt; {text}
              </div>
            ))}
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex h-full w-full max-w-4xl min-h-[280px] flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-5 text-studio-muted">
          <svg className="mx-auto h-14 w-14" fill="none" stroke="currentColor" strokeWidth={1.25} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="mb-1 text-lg font-bold text-studio-text">开始对话</h3>
        <p className="mb-8 text-sm text-studio-muted">在下方输入消息发送给助手</p>
        <div className="grid w-full max-w-xl grid-cols-1 gap-2 text-left sm:grid-cols-2">
          {['分析当前项目结构', '解释一段代码', '写一个 HTTP 客户端示例', '列出常用重构手法'].map((text, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-studio-border bg-studio-panel p-3 text-sm text-studio-muted shadow-sm transition-colors hover:border-studio-hot"
            >
              · {text}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="oc-messages mx-auto w-full max-w-4xl space-y-5 px-3 pb-6 sm:px-5">
      {/* 系统说明：大块浅米色（OpenClaw） */}
      {systemPrompt && (
        <div
          className={
            pixelMode
              ? 'animate-fade-in border-2 border-[var(--sp-border)] bg-[var(--sp-panel-2)] p-5 text-sm leading-relaxed text-[var(--sp-text)] shadow-[var(--sp-pixel-shadow)]'
              : 'animate-fade-in rounded-xl border border-studio-border/90 bg-studio-panel-2 p-5 text-sm leading-relaxed text-studio-text shadow-sm'
          }
        >
          <div
            className={
              pixelMode
                ? 'whitespace-pre-wrap text-[13px] text-[var(--sp-text)]'
                : 'whitespace-pre-wrap text-[13px] text-studio-text/95'
            }
          >
            {systemPrompt}
          </div>
          <div
            className={
              pixelMode
                ? 'mt-3 border-t-2 border-[var(--sp-border)] pt-3 text-xs text-[var(--sp-muted)]'
                : 'mt-3 border-t border-studio-border/80 pt-3 text-xs text-studio-muted'
            }
          >
            {new Date().toLocaleString('zh-CN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>
      )}

      {messages.map((msg) => {
        const tools = (msg.metadata?.toolCalls as ToolCall[] | undefined) ?? []
        const toolCount = tools.length

        if (msg.role === 'user') {
          const t = new Date(msg.timestamp).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
          return (
            <div key={msg.id} className="animate-fade-in flex justify-end">
              <div className="flex max-w-[min(100%,42rem)] flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      pixelMode ? 'text-xs text-[var(--sp-muted)]' : 'text-xs text-studio-muted'
                    }
                  >
                    You{' '}
                    <span className={pixelMode ? 'text-[var(--sp-border)]' : 'text-studio-muted'}>{t}</span>
                  </span>
                  <div
                    className={
                      pixelMode
                        ? 'flex h-8 w-8 flex-shrink-0 items-center justify-center border-2 border-black bg-[var(--sp-accent)] text-white shadow-[var(--sp-pixel-shadow-sm)]'
                        : 'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#e11d48] text-white shadow-sm'
                    }
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                </div>
                {msg.content ? (
                  <div
                    className={
                      pixelMode
                        ? 'border-2 border-black bg-[var(--sp-accent)] px-4 py-3 text-sm leading-relaxed text-white shadow-[var(--sp-pixel-shadow)]'
                        : 'rounded-2xl bg-[#e11d48] px-4 py-3 text-sm leading-relaxed text-white shadow-md'
                    }
                  >
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  </div>
                ) : null}
              </div>
            </div>
          )
        }

        /* assistant */
        return (
          <div key={msg.id} className="animate-fade-in">
            <div className="flex justify-start gap-3">
              {/* 左侧边线装饰：星标 / 齿轮位（参考图边距图标） */}
              <div
                className={
                  pixelMode
                    ? 'flex w-5 flex-shrink-0 flex-col items-center gap-2 pt-1 text-[var(--sp-border-hot)]'
                    : 'flex w-5 flex-shrink-0 flex-col items-center gap-2 pt-1 text-studio-muted'
                }
              >
                <IconStar
                  className={
                    pixelMode ? 'h-3.5 w-3.5 text-[var(--sp-border-hot)]' : 'h-3.5 w-3.5 text-amber-400/90'
                  }
                />
              </div>

              <div className="min-w-0 flex-1">
                {toolCount > 0 && (
                  <>
                    <div
                      className={
                        pixelMode
                          ? 'mb-2 flex items-center gap-2 text-xs font-bold text-[var(--sp-text)]'
                          : 'mb-2 flex items-center gap-2 text-xs font-bold text-studio-text'
                      }
                    >
                      <IconLightning
                        className={
                          pixelMode ? 'h-4 w-4 text-[var(--sp-border-hot)]' : 'h-4 w-4 text-orange-500'
                        }
                      />
                      <span>
                        {toolCount} tool{toolCount > 1 ? 's' : ''} read
                      </span>
                    </div>
                    <div className="mb-3 flex flex-col gap-1.5">
                      {tools.map((tool, i) => {
                        const key = `${msg.id}-tool-${i}`
                        const expanded = expandedTools[key]
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setExpandedTools((s) => ({ ...s, [key]: !s[key] }))}
                            className={
                              pixelMode
                                ? 'flex w-fit max-w-full flex-col items-start border-2 border-[var(--sp-border)] bg-[var(--sp-panel)] px-3 py-2 text-left shadow-[var(--sp-pixel-shadow-sm)] transition-colors hover:bg-[var(--sp-panel-2)]'
                                : 'flex w-fit max-w-full flex-col items-start rounded-lg border border-studio-border bg-studio-panel px-3 py-2 text-left shadow-sm transition-colors hover:bg-studio-panel-2'
                            }
                          >
                            <div
                              className={
                                pixelMode
                                  ? 'flex items-center gap-2 text-xs text-[var(--sp-muted)]'
                                  : 'flex items-center gap-2 text-xs text-studio-muted'
                              }
                            >
                              <IconLightning
                                className={
                                  pixelMode
                                    ? 'h-3.5 w-3.5 text-[var(--sp-border-hot)]'
                                    : 'h-3.5 w-3.5 text-orange-500'
                                }
                              />
                              <span className="font-medium">{tool.name ?? 'Tool'} output read</span>
                              <svg
                                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''} ${pixelMode ? 'text-[var(--sp-muted)]' : 'text-studio-muted'}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                            {expanded && tool.summary ? (
                              <p
                                className={
                                  pixelMode
                                    ? 'mt-1.5 max-w-md text-xs text-[var(--sp-muted)]'
                                    : 'mt-1.5 max-w-md text-xs text-studio-muted'
                                }
                              >
                                {tool.summary}
                              </p>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                {msg.content ? (
                  <div
                    className={
                      pixelMode
                        ? 'border-2 border-[var(--sp-border)] bg-[var(--sp-panel)] px-4 py-3 text-sm leading-relaxed text-[var(--sp-text)] shadow-[var(--sp-pixel-shadow)]'
                        : 'rounded-2xl border border-studio-border/90 bg-studio-panel px-4 py-3 text-sm leading-relaxed text-studio-text shadow-sm'
                    }
                  >
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  </div>
                ) : null}

                <div
                  className={
                    pixelMode
                      ? 'mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--sp-muted)]'
                      : 'mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-studio-muted'
                  }
                >
                  <IconStar
                    className={
                      pixelMode ? 'h-2.5 w-2.5 text-[var(--sp-border-hot)]' : 'h-2.5 w-2.5 text-amber-400/80'
                    }
                  />
                  {agentName ? (
                    <span className={pixelMode ? 'text-[var(--sp-text)]' : 'text-studio-muted'}>{agentName}</span>
                  ) : null}
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </span>
                  {msg.metadata?.inputTokens != null || msg.metadata?.outputTokens != null ? (
                    <span>
                      ↑{((msg.metadata?.inputTokens as number) ?? 0).toLocaleString()}{' '}
                      ↓{((msg.metadata?.outputTokens as number) ?? 0).toLocaleString()}
                    </span>
                  ) : null}
                  {modelName ? (
                    <span
                      className={
                        pixelMode
                          ? 'font-mono text-[10px] text-[var(--sp-muted)]'
                          : 'font-mono text-[10px] text-studio-muted'
                      }
                    >
                      {modelName}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {isLoading && (
        <div className="animate-fade-in flex justify-start gap-3">
          <div
            className={
              pixelMode
                ? 'flex w-5 flex-shrink-0 justify-center pt-1 text-[var(--sp-border-hot)]'
                : 'flex w-5 flex-shrink-0 justify-center pt-1 text-studio-muted'
            }
          >
            <IconStar
              className={
                pixelMode ? 'h-3.5 w-3.5 text-[var(--sp-border-hot)]' : 'h-3.5 w-3.5 text-amber-400/90'
              }
            />
          </div>
          <div className="flex items-start gap-3">
            <div
              className={
                pixelMode
                  ? 'flex h-9 w-9 flex-shrink-0 items-center justify-center border-2 border-[var(--sp-border)] bg-[var(--sp-panel)] text-[var(--sp-muted)] shadow-[var(--sp-pixel-shadow-sm)]'
                  : 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-studio-border text-studio-muted'
              }
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div
              className={
                pixelMode
                  ? 'border-2 border-[var(--sp-border)] bg-[var(--sp-panel)] px-4 py-3 shadow-[var(--sp-pixel-shadow)]'
                  : 'rounded-2xl border border-studio-border bg-studio-panel px-4 py-3 shadow-sm'
              }
            >
              <div className="flex gap-1.5">
                <div
                  className={
                    pixelMode
                      ? 'h-2 w-2 animate-bounce bg-[var(--sp-border-hot)] shadow-[1px_1px_0_#000]'
                      : 'h-2 w-2 animate-bounce rounded-full bg-studio-muted'
                  }
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className={
                    pixelMode
                      ? 'h-2 w-2 animate-bounce bg-[var(--sp-border-hot)] shadow-[1px_1px_0_#000]'
                      : 'h-2 w-2 animate-bounce rounded-full bg-studio-muted'
                  }
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className={
                    pixelMode
                      ? 'h-2 w-2 animate-bounce bg-[var(--sp-border-hot)] shadow-[1px_1px_0_#000]'
                      : 'h-2 w-2 animate-bounce rounded-full bg-studio-muted'
                  }
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}
