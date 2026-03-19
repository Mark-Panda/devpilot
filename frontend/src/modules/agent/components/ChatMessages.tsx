import React, { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types'

interface ChatMessagesProps {
  messages: ChatMessage[]
  isLoading: boolean
  systemPrompt?: string
  agentName?: string
  modelName?: string
}

export function ChatMessages({
  messages,
  isLoading,
  systemPrompt,
  agentName,
  modelName,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const hasContent = messages.length > 0 || systemPrompt || isLoading

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center px-4 py-12">
        <div className="mb-6 text-slate-400">
          <svg className="w-14 h-14 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-700 mb-1">开始对话</h3>
        <p className="text-sm text-slate-500 mb-6">向 Agent 发送消息开始对话</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full text-left">
          {['帮我分析这个项目的架构', '搜索包含 "function" 的代码', '这个项目用了什么技术栈?', '写一个简单的 API 示例'].map((text, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all text-sm text-slate-600"
            >
              • {text}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-4">
      {/* 系统消息块（OpenClaw 风格橙色框） */}
      {systemPrompt && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 animate-fade-in">
          <div className="font-medium text-amber-800 mb-1">会话说明</div>
          <div className="whitespace-pre-wrap text-amber-900/90">{systemPrompt}</div>
          <div className="mt-2 text-xs text-amber-600/80">
            {new Date().toLocaleString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      )}

      {messages.map((msg, idx) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
        >
          <div
            className={`flex items-start gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* 头像 */}
            <div
              className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                msg.role === 'user'
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {msg.role === 'user' ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* 助手消息：可选的工具调用块 */}
              {msg.role === 'assistant' && msg.metadata?.toolCalls && (msg.metadata.toolCalls as { name?: string; summary?: string }[]).length > 0 && (
                <div className="flex flex-col gap-1.5 mb-2">
                  {(msg.metadata.toolCalls as { name?: string; summary?: string }[]).map((tool, i) => {
                    const key = `${msg.id}-tool-${i}`
                    const expanded = expandedTools[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setExpandedTools((s) => ({ ...s, [key]: !s[key] }))}
                        className="flex flex-col items-start w-fit max-w-full rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-left transition-colors shadow-sm"
                      >
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="text-slate-400 text-xs">•</span>
                          <span className="text-amber-500">✦</span>
                          <span className="font-medium">{tool.name ?? 'Tool'}</span>
                          <span className="text-slate-400 text-xs">read</span>
                          <svg
                            className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        {expanded && tool.summary && (
                          <div className="mt-1.5 text-xs text-slate-500 max-w-xs">{tool.summary}</div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* 消息气泡 */}
              <div
                className={`rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-red-500 text-white'
                    : 'bg-white border border-slate-200 text-slate-800'
                }`}
              >
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {msg.content}
                </div>
              </div>

              {/* 元数据行（助手消息：agent 名、时间、token、模型） */}
              {msg.role === 'assistant' && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                  {agentName && <span>{agentName}</span>}
                  <span>{new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  {(msg.metadata?.inputTokens != null || msg.metadata?.outputTokens != null) && (
                    <span>↑{((msg.metadata?.inputTokens as number) ?? 0).toLocaleString()} ↓{((msg.metadata?.outputTokens as number) ?? 0).toLocaleString()}</span>
                  )}
                  {modelName && <span>{modelName}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex justify-start animate-fade-in">
          <div className="flex items-start gap-3 max-w-[85%]">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}
