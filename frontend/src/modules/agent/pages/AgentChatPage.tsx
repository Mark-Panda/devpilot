import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgentStore } from '../store'
import { modelManagementApi, type ModelOption } from '../modelApi'
import { ChatMessages } from '../components/ChatMessages'
import { ChatInput } from '../components/ChatInput'

function proxyHostFromBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) return ''
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  }
}

/** OpenClaw 第一行：汉堡 + 面包屑 + 搜索 + 显示器 / 日 / 月 */
function OcTopBar() {
  return (
    <header className="flex flex-shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-4 py-2.5 sm:gap-3 sm:px-6">
      <button type="button" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="菜单">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <nav className="flex flex-shrink-0 items-center gap-1.5 text-sm text-stone-500">
        <Link to="/" className="hover:text-stone-800">
          DevPilot
        </Link>
        <span className="text-stone-300">›</span>
        <span className="font-medium text-stone-800">聊天</span>
      </nav>
      <div className="hidden min-w-0 flex-1 justify-center md:flex">
        <div className="flex w-full max-w-lg items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-400">
          <span className="truncate">Search…</span>
          <kbd className="ml-auto rounded border border-stone-200 bg-white px-1.5 py-0.5 font-sans text-[10px] text-stone-500">
            ⌘K
          </kbd>
        </div>
      </div>
      <div className="ml-auto flex flex-shrink-0 items-center gap-0.5">
        <button type="button" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 md:hidden" aria-label="搜索">
          <span className="text-xs text-stone-400">⌘K</span>
        </button>
        <button type="button" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="布局" aria-label="布局">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>
        <button type="button" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="浅色" aria-label="浅色">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </button>
        <button type="button" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="深色" aria-label="深色">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>
      </div>
    </header>
  )
}

export const AgentChatPage: React.FC = () => {
  const {
    agents,
    currentAgentId,
    messages,
    isLoading,
    error,
    loadAgents,
    createAgent,
    selectAgent,
    sendMessage,
  } = useAgentStore()

  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [showWelcome, setShowWelcome] = useState(true)
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const agentMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initialize = async () => {
      try {
        await loadAgents()
        const options = await modelManagementApi.getAllModelOptions()
        setModelOptions(options)
        if (options.length > 0) setSelectedModel(options[0])
      } catch (err) {
        console.error('初始化失败:', err)
      } finally {
        setIsInitializing(false)
      }
    }
    initialize()
  }, [loadAgents])

  const handleCreateDefaultAgent = useCallback(async () => {
    if (!selectedModel) {
      return
    }
    try {
      const config = {
        id: `agent_main_${Date.now()}`,
        name: 'main',
        type: 'main' as const,
        model_config: {
          base_url: selectedModel.baseUrl,
          api_key: selectedModel.apiKey,
          model: selectedModel.model,
          max_tokens: 4096,
          temperature: 0.7,
        },
        skills: [],
        mcp_servers: [],
        system_prompt:
          '你是一个专业的 AI 助手，可以帮助用户完成各种任务，包括代码编写、问题解答、创意头脑风暴等。',
      }
      const agent = await createAgent(config)
      selectAgent(agent.config.id)
      setShowWelcome(false)
    } catch (err) {
      console.error('创建主助手失败:', err)
    }
  }, [selectedModel, createAgent, selectAgent])

  useEffect(() => {
    if (
      !isInitializing &&
      agents.length === 0 &&
      modelOptions.length > 0 &&
      showWelcome
    ) {
      handleCreateDefaultAgent()
    }
  }, [isInitializing, agents.length, modelOptions.length, showWelcome, handleCreateDefaultAgent])

  useEffect(() => {
    if (!agentMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = agentMenuRef.current
      if (el && !el.contains(e.target as Node)) setAgentMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [agentMenuOpen])

  const currentAgent = agents.find((a) => a.config.id === currentAgentId)
  const currentMessages = currentAgentId ? messages : []

  if (isInitializing) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center bg-slate-50 py-16">
        <div className="text-center">
          <div className="mb-3 inline-block h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-red-500" />
          <p className="text-sm text-slate-500">初始化中...</p>
        </div>
      </div>
    )
  }

  // 欢迎：选择模型（OpenClaw 风格，统一卡片列表）
  if (!currentAgent || showWelcome) {
    return (
      <div className="agent-chat-shell agent-chat-shell--welcome">
        <OcTopBar />

        <div className="flex flex-shrink-0 items-center border-b border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-600 sm:px-6">
          选择模型后开始对话
        </div>

        <div className="min-h-0 overflow-y-auto overflow-x-hidden px-5 py-6 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">选择模型</h2>
            <p className="text-sm text-slate-500 mb-4">从已配置的模型中选择一个开始对话</p>

            {modelOptions.length > 0 ? (
              <>
                <div className="space-y-2">
                  {modelOptions.map((option, idx) => {
                    const isSelected =
                      selectedModel?.model === option.model && selectedModel?.baseUrl === option.baseUrl
                    return (
                      <button
                        key={`${option.configId}-${option.model}-${idx}`}
                        type="button"
                        onClick={() => setSelectedModel(option)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left shadow-sm transition-all ${
                          isSelected
                            ? 'border-rose-500 bg-rose-50/90 shadow-rose-100'
                            : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/80'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{option.model}</div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">{option.displayName}</div>
                        </div>
                        <span
                          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                            isSelected ? 'bg-[#e11d48]' : 'bg-stone-200'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleCreateDefaultAgent}
                  disabled={!selectedModel}
                  className="mt-5 w-full rounded-xl bg-[#e11d48] px-4 py-3 font-medium text-white shadow-sm transition-colors hover:bg-[#be123c] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  开始对话 →
                </button>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-slate-600 mb-2">还没有配置模型</p>
                <Link to="/settings/models" className="text-sm text-rose-600 hover:underline">前往模型管理</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const modelLine =
    currentAgent?.config.model_config.model &&
    proxyHostFromBaseUrl(currentAgent.config.model_config.base_url)
      ? `${currentAgent.config.model_config.model} · ${proxyHostFromBaseUrl(currentAgent.config.model_config.base_url)}`
      : (currentAgent?.config.model_config.model ?? '—')

  // OpenClaw 图二：双行顶栏 + 中间可滚消息区 + 底部固定输入条
  return (
    <div className="agent-chat-shell">
      <OcTopBar />

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 sm:gap-3 sm:px-6">
        <div className="relative flex-shrink-0" ref={agentMenuRef}>
          <button
            type="button"
            onClick={() => setAgentMenuOpen((o) => !o)}
            className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100"
            aria-expanded={agentMenuOpen}
            aria-haspopup="listbox"
          >
            <span>{currentAgent?.config.name ?? 'main'}</span>
            <svg className={`h-3.5 w-3.5 text-stone-400 transition-transform ${agentMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {agentMenuOpen && (
            <ul
              className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              {agents.map((a) => (
                <li key={a.config.id} role="option" aria-selected={a.config.id === currentAgentId}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-stone-50 ${a.config.id === currentAgentId ? 'bg-rose-50 font-medium text-rose-700' : 'text-stone-700'}`}
                    onClick={() => {
                      selectAgent(a.config.id)
                      setAgentMenuOpen(false)
                    }}
                  >
                    {a.config.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 max-w-full flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 sm:max-w-2xl">
          <span className="block truncate font-mono text-[13px]" title={modelLine}>
            {modelLine}
          </span>
        </div>

        <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-0.5 sm:ml-auto sm:w-auto">
          <button type="button" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="刷新">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <button
            type="button"
            className={`rounded-lg p-2 text-stone-500 ${isLoading ? 'cursor-pointer hover:bg-stone-100' : 'cursor-not-allowed opacity-40'}`}
            title={isLoading ? '停止（暂不支持）' : '停止'}
            disabled={!isLoading}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
          <div className="mx-0.5 hidden h-5 w-px bg-stone-200 sm:block" aria-hidden />
          <button
            type="button"
            className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
            title="Agent"
            aria-label="Agent"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </button>
          <button type="button" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="展开" aria-label="展开">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button type="button" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="历史" aria-label="历史">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button type="button" onClick={() => setShowWelcome(true)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="切换模型 / 设置">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
      </div>

      <div className="agent-chat-messages">
        <ChatMessages
          messages={currentMessages}
          isLoading={isLoading}
          systemPrompt={currentAgent?.config.system_prompt}
          agentName={currentAgent?.config.name}
          modelName={currentAgent?.config.model_config.model}
        />
      </div>

      <footer className="agent-chat-composer">
        <div className="agent-chat-composer-inner">
          <ChatInput
            onSend={(msg) => sendMessage(msg)}
            isLoading={isLoading}
            placeholder={`Message ${currentAgent?.config.name ?? 'Agent'} (Enter to send)`}
          />
        </div>
      </footer>

      {error && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm text-white shadow-lg">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
