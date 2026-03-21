import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgentStore, selectCurrentAgentLoading } from '../store'
import { modelManagementApi, type ModelOption } from '../modelApi'
import { ChatMessages } from '../components/ChatMessages'
import { ChatInput } from '../components/ChatInput'
import { SubAgentModal } from '../components/SubAgentModal'
import type { AgentConfig, AgentInfo, ModelConfig } from '../types'

/** 避免 React Strict Mode 双次挂载时重复自动建主 Agent（仅取最后一次 init） */
let agentChatInitGeneration = 0

function orderedAgentsWithDepth(agents: AgentInfo[]): { agent: AgentInfo; depth: number }[] {
  const map = new Map(agents.map((a) => [a.config.id, a]))
  const roots = agents.filter((a) => !a.config.parent_id || !map.has(a.config.parent_id))
  const out: { agent: AgentInfo; depth: number }[] = []
  const seen = new Set<string>()
  const visit = (id: string, depth: number) => {
    const a = map.get(id)
    if (!a || seen.has(id)) return
    seen.add(id)
    out.push({ agent: a, depth })
    for (const c of agents.filter((x) => x.config.parent_id === id)) {
      visit(c.config.id, depth + 1)
    }
  }
  for (const r of roots) {
    visit(r.config.id, 0)
  }
  for (const a of agents) {
    if (!seen.has(a.config.id)) out.push({ agent: a, depth: 0 })
  }
  return out
}

function modelOptionMatchesAgent(opt: ModelOption, agent: AgentInfo | undefined): boolean {
  if (!agent) return false
  const mc = agent.config.model_config
  return opt.model === mc.model && opt.baseUrl === mc.base_url
}

function modelConfigForOption(opt: ModelOption, agent: AgentInfo | undefined): ModelConfig {
  const cur = agent?.config.model_config
  const extras = opt.failoverModels.filter((m) => m !== opt.model)
  return {
    base_url: opt.baseUrl,
    api_key: opt.apiKey,
    model: opt.model,
    models: extras.length > 0 ? extras : undefined,
    max_tokens: cur?.max_tokens ?? 4096,
    temperature: cur?.temperature ?? 0.7,
  }
}

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
    error,
    loadAgents,
    createAgent,
    selectAgent,
    sendMessage,
    clearAgentMemory,
    updateAgentModel,
  } = useAgentStore()

  const isLoading = useAgentStore(selectCurrentAgentLoading)

  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [isInitializing, setIsInitializing] = useState(true)
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [showSubAgentModal, setShowSubAgentModal] = useState(false)
  const agentMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const gen = ++agentChatInitGeneration
    ;(async () => {
      try {
        await loadAgents()
        const options = await modelManagementApi.getAllModelOptions()
        if (gen !== agentChatInitGeneration) return
        setModelOptions(options)

        const st = useAgentStore.getState()
        let { agents: ags, currentAgentId: cur } = st

        if (ags.length === 0 && options.length > 0) {
          const first = options[0]
          const created = await st.createAgent({
            id: `agent_main_${Date.now()}`,
            name: 'main',
            type: 'main',
            model_config: {
              base_url: first.baseUrl,
              api_key: first.apiKey,
              model: first.model,
              models: first.failoverModels.filter((m) => m !== first.model),
              max_tokens: 4096,
              temperature: 0.7,
            },
            skills: [],
            mcp_servers: [],
            system_prompt:
              '你是一个专业的 AI 助手，可以帮助用户完成各种任务，包括代码编写、问题解答、创意头脑风暴等。',
          })
          if (gen !== agentChatInitGeneration) return
          await useAgentStore.getState().selectAgent(created.config.id)
        } else if (ags.length > 0 && !cur) {
          const preferred =
            ags.find((a) => a.config.type === 'main' && a.config.name === 'main') ??
            ags.find((a) => a.config.type === 'main') ??
            ags[0]
          await useAgentStore.getState().selectAgent(preferred.config.id)
        }
      } catch (err) {
        console.error('初始化失败:', err)
      } finally {
        if (gen === agentChatInitGeneration) setIsInitializing(false)
      }
    })()
  }, [loadAgents])

  useEffect(() => {
    if (!agentMenuOpen && !modelMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      const agentEl = agentMenuRef.current
      const modelEl = modelMenuRef.current
      if (agentMenuOpen && agentEl && !agentEl.contains(t)) setAgentMenuOpen(false)
      if (modelMenuOpen && modelEl && !modelEl.contains(t)) setModelMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [agentMenuOpen, modelMenuOpen])

  const currentAgent = agents.find((a) => a.config.id === currentAgentId)
  const currentMessages = currentAgentId ? messages : []
  const agentsOrdered = orderedAgentsWithDepth(agents)

  const handleCreateSubAgent = async (cfg: AgentConfig) => {
    await createAgent(cfg)
    await loadAgents()
    await selectAgent(cfg.id)
    setAgentMenuOpen(false)
  }

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

  const mc = currentAgent?.config.model_config
  const failoverCount =
    mc?.models && mc.models.length > 0 ? mc.models.length + 1 : mc?.model ? 1 : 0
  const modelLine = !currentAgent
    ? modelOptions.length === 0
      ? '未配置模型 · 请前往模型管理'
      : '正在准备对话…'
    : mc?.model && proxyHostFromBaseUrl(mc.base_url ?? '')
      ? `${mc.model}${failoverCount > 1 ? ` +${failoverCount - 1}备用` : ''} · ${proxyHostFromBaseUrl(mc.base_url ?? '')}`
      : (mc?.model ?? '—')

  // OpenClaw 图二：双行顶栏 + 中间可滚消息区 + 底部固定输入条
  return (
    <div className="agent-chat-shell">
      <OcTopBar />

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 sm:gap-3 sm:px-6">
        <div className="relative flex-shrink-0" ref={agentMenuRef}>
          <button
            type="button"
            onClick={() => {
              setModelMenuOpen(false)
              setAgentMenuOpen((o) => !o)
            }}
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
              className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              {agentsOrdered.map(({ agent: a, depth }) => (
                <li key={a.config.id} role="option" aria-selected={a.config.id === currentAgentId}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 ${a.config.id === currentAgentId ? 'bg-rose-50 font-medium text-rose-700' : 'text-stone-700'}`}
                    style={{ paddingLeft: `${12 + depth * 14}px` }}
                    onClick={() => {
                      void selectAgent(a.config.id)
                      setAgentMenuOpen(false)
                    }}
                  >
                    {depth > 0 && (
                      <span className="text-stone-300 select-none" aria-hidden>
                        └
                      </span>
                    )}
                    <span className="truncate">{a.config.name}</span>
                    {a.config.type === 'sub' && (
                      <span className="ml-auto flex-shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                        sub
                      </span>
                    )}
                  </button>
                </li>
              ))}
              <li className="my-1 border-t border-stone-100" role="separator" />
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                  onClick={() => {
                    setAgentMenuOpen(false)
                    setShowSubAgentModal(true)
                  }}
                >
                  + 创建子 Agent…
                </button>
              </li>
              <li>
                <Link
                  to="/settings/agents"
                  className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                  onClick={() => setAgentMenuOpen(false)}
                >
                  Agent 管理…
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-50"
                  onClick={async () => {
                    if (window.confirm('确定清空当前 Agent 的持久化对话记忆？')) {
                      await clearAgentMemory()
                      setAgentMenuOpen(false)
                    }
                  }}
                >
                  清空对话记忆
                </button>
              </li>
            </ul>
          )}
        </div>

        <div className="relative min-w-0 max-w-full flex-1 sm:max-w-2xl" ref={modelMenuRef}>
          <button
            type="button"
            disabled={isLoading || !currentAgent}
            title={currentAgent ? '切换模型' : '会话就绪后可切换模型'}
            onClick={() => {
              setAgentMenuOpen(false)
              setModelMenuOpen((prev) => {
                const next = !prev
                if (next) {
                  void modelManagementApi
                    .getAllModelOptions()
                    .then((opts) => setModelOptions(opts))
                    .catch(() => {})
                }
                return next
              })
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
            aria-expanded={modelMenuOpen}
            aria-haspopup="listbox"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={modelLine}>
              {modelLine}
            </span>
            <svg
              className={`h-3.5 w-3.5 flex-shrink-0 text-stone-400 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {modelMenuOpen && (
            <ul
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              {modelOptions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-stone-500">暂无已配置模型</li>
              ) : (
                modelOptions.map((opt, idx) => {
                  const active = modelOptionMatchesAgent(opt, currentAgent)
                  return (
                    <li key={`${opt.configId}-${opt.model}-${idx}`} role="option" aria-selected={active}>
                      <button
                        type="button"
                        disabled={isLoading}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-stone-50 disabled:opacity-50 ${active ? 'bg-rose-50 font-medium text-rose-700' : 'text-stone-700'}`}
                        onClick={async () => {
                          if (!currentAgentId || !currentAgent) return
                          try {
                            await updateAgentModel(
                              currentAgentId,
                              modelConfigForOption(opt, currentAgent)
                            )
                            setModelMenuOpen(false)
                          } catch {
                            /* store 已设 error */
                          }
                        }}
                      >
                        <div className="truncate font-medium">{opt.model}</div>
                        <div className="truncate text-xs text-stone-500">{opt.displayName}</div>
                      </button>
                    </li>
                  )
                })
              )}
              <li className="my-1 border-t border-stone-100" role="separator" />
              <li>
                <Link
                  to="/settings/models"
                  className="block px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  onClick={() => setModelMenuOpen(false)}
                >
                  打开模型管理…
                </Link>
              </li>
            </ul>
          )}
        </div>

        <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-0.5 sm:ml-auto sm:w-auto">
          <button
            type="button"
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="从后端重新加载当前会话记忆"
            disabled={!currentAgentId}
            onClick={() => currentAgentId && void selectAgent(currentAgentId)}
          >
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
            className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="创建子 Agent"
            aria-label="创建子 Agent"
            disabled={!currentAgent}
            onClick={() => currentAgent && setShowSubAgentModal(true)}
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
          <button
            type="button"
            className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="清空持久化记忆"
            aria-label="清空持久化记忆"
            disabled={!currentAgent}
            onClick={async () => {
              if (window.confirm('清空当前 Agent 在后端的对话记忆？')) await clearAgentMemory()
            }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <Link
            to="/settings/models"
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
            title="模型管理"
            aria-label="模型管理"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </Link>
        </div>
      </div>

      <div className="agent-chat-messages">
        {currentAgent ? (
          <ChatMessages
            messages={currentMessages}
            isLoading={isLoading}
            systemPrompt={currentAgent.config.system_prompt}
            agentName={currentAgent.config.name}
            modelName={currentAgent.config.model_config?.model ?? ''}
          />
        ) : (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-stone-500">
            {modelOptions.length === 0 ? (
              <>
                <p>尚未配置可用模型，无法开始对话。</p>
                <Link to="/settings/models" className="font-medium text-rose-600 hover:underline">
                  前往模型管理
                </Link>
              </>
            ) : error ? (
              <>
                <p>无法创建会话：{error}</p>
                <button
                  type="button"
                  className="font-medium text-rose-600 hover:underline"
                  onClick={() => window.location.reload()}
                >
                  刷新页面重试
                </button>
              </>
            ) : (
              <p>正在准备对话…</p>
            )}
          </div>
        )}
      </div>

      <footer className="agent-chat-composer">
        <div className="agent-chat-composer-inner">
          <ChatInput
            onSend={(msg) => sendMessage(msg)}
            isLoading={isLoading}
            disabled={!currentAgent}
            placeholder={
              currentAgent
                ? `Message ${currentAgent.config.name} (Enter to send)`
                : '请先配置模型或等待会话就绪'
            }
          />
        </div>
      </footer>

      {error && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm text-white shadow-lg">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {showSubAgentModal && currentAgent && (
        <SubAgentModal
          parentAgent={currentAgent}
          onSubmit={handleCreateSubAgent}
          onClose={() => setShowSubAgentModal(false)}
        />
      )}
    </div>
  )
}
