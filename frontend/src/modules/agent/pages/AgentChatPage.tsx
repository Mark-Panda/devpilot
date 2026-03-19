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
        {/* 第一行顶栏：面包屑 + 搜索 + 右侧图标（对齐 OpenClaw 图二） */}
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-6">
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="菜单">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <nav className="flex flex-shrink-0 items-center gap-1.5 text-sm text-slate-500">
            <Link to="/" className="hover:text-slate-700">DevPilot</Link>
            <span className="text-slate-300">›</span>
            <span className="font-medium text-slate-800">聊天</span>
          </nav>
          <div className="hidden min-w-0 flex-1 justify-center sm:flex">
            <div className="flex max-w-md flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-400">
              <span className="truncate">搜索会话…</span>
              <kbd className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-500">⌘K</kbd>
            </div>
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center gap-0.5">
            <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="主题" aria-label="主题">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </button>
          </div>
        </header>

        {/* 第二行：说明 */}
        <div className="flex flex-shrink-0 items-center border-b border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-600 sm:px-6">
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
                        className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl border text-left transition-all shadow-sm ${
                          isSelected
                            ? 'border-red-500 bg-red-50/80 shadow-red-100'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{option.model}</div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">{option.displayName}</div>
                        </div>
                        <span
                          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                            isSelected ? 'bg-red-500' : 'bg-slate-200'
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
                  className="mt-5 w-full py-3 px-4 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors shadow-sm"
                >
                  开始对话 →
                </button>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-slate-600 mb-2">还没有配置模型</p>
                <Link to="/settings/models" className="text-red-600 hover:underline text-sm">前往模型管理</Link>
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
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-6">
        <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="菜单">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <nav className="flex flex-shrink-0 items-center gap-1.5 text-sm text-slate-500">
          <Link to="/" className="hover:text-slate-700">DevPilot</Link>
          <span className="text-slate-300">›</span>
          <span className="font-medium text-slate-800">聊天</span>
        </nav>
        <div className="hidden min-w-0 flex-1 justify-center sm:flex">
          <div className="flex max-w-md flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-400">
            <span className="truncate">搜索会话…</span>
            <kbd className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-500">⌘K</kbd>
          </div>
        </div>
        <div className="ml-auto flex flex-shrink-0 items-center gap-0.5">
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" title="搜索" aria-label="搜索">
            <span className="text-xs text-slate-400">⌘K</span>
          </button>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="主题" aria-label="主题">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          </button>
        </div>
      </header>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-2.5 sm:gap-3 sm:px-6">
        <div className="relative flex-shrink-0" ref={agentMenuRef}>
          <button
            type="button"
            onClick={() => setAgentMenuOpen((o) => !o)}
            className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            aria-expanded={agentMenuOpen}
            aria-haspopup="listbox"
          >
            <span>{currentAgent?.config.name ?? 'main'}</span>
            <svg className={`h-3 w-3 text-slate-400 transition-transform ${agentMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {agentMenuOpen && (
            <ul
              className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              {agents.map((a) => (
                <li key={a.config.id} role="option" aria-selected={a.config.id === currentAgentId}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${a.config.id === currentAgentId ? 'bg-red-50 font-medium text-red-700' : 'text-slate-700'}`}
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

        <div className="min-w-0 max-w-full flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600 sm:max-w-xl">
          <span className="block truncate" title={modelLine}>{modelLine}</span>
        </div>

        <div className="flex w-full flex-shrink-0 items-center justify-end gap-0.5 sm:ml-auto sm:w-auto">
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="刷新">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <button
            type="button"
            className={`rounded-lg p-2 text-slate-500 ${isLoading ? 'cursor-pointer hover:bg-slate-100' : 'cursor-not-allowed opacity-40'}`}
            title={isLoading ? '停止（暂不支持）' : '停止'}
            disabled={!isLoading}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="历史">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button type="button" onClick={() => setShowWelcome(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="切换模型 / 设置">
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
            placeholder={`Message ${currentAgent?.config.name ?? 'Agent'} (Enter 发送)`}
          />
        </div>
      </footer>

      {error && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm text-white shadow-lg">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
