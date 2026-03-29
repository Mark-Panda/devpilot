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

/** 键盘焦点环，与侧栏 OpenClaw 主题一致 */
const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-studio-hot/50 focus-visible:ring-offset-2 focus-visible:ring-offset-studio-bg'

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

/** 顶栏：面包屑 + 快捷入口（去掉无行为的占位按钮，减少干扰） */
function OcTopBar() {
  return (
    <header className="flex flex-shrink-0 items-center gap-3 border-b border-studio-border bg-studio-panel/95 px-4 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.35)] backdrop-blur-sm sm:px-6">
      <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-studio-muted">
        <Link
          to="/agent"
          className={`shrink-0 rounded-md font-bold text-studio-text transition-colors hover:text-studio-hot ${focusRing}`}
        >
          聊天
        </Link>
        <span className="shrink-0 text-studio-muted" aria-hidden>
          ›
        </span>
        <span className="min-w-0 truncate text-base font-bold text-studio-text sm:text-sm">当前会话</span>
      </nav>
      <Link
        to="/studios"
        className={`shrink-0 rounded-lg border border-studio-hot/40 bg-studio-hot/10 px-3 py-1.5 text-xs font-bold text-studio-hot transition-colors hover:border-studio-hot hover:bg-studio-hot/20 ${focusRing}`}
      >
        工作室
      </Link>
    </header>
  )
}

export const AgentChatPage: React.FC = () => {
  const {
    agents,
    currentAgentId,
    messages,
    error,
    projectInfo,
    loadAgents,
    applyStoredAgentWorkspace,
    pickAgentWorkspaceFolder,
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
  /** Wails WebView 中 window.confirm 常无效，改用页内确认 */
  const [clearMemoryModalOpen, setClearMemoryModalOpen] = useState(false)
  const [clearingMemory, setClearingMemory] = useState(false)
  const agentMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const gen = ++agentChatInitGeneration
    ;(async () => {
      try {
        await loadAgents()
        await useAgentStore.getState().loadProjectInfo()
        await useAgentStore.getState().applyStoredAgentWorkspace()
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAgentMenuOpen(false)
        setModelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [agentMenuOpen, modelMenuOpen])

  const currentAgent = agents.find((a) => a.config.id === currentAgentId)
  const currentMessages = currentAgentId ? messages : []
  const agentsOrdered = orderedAgentsWithDepth(agents)

  const openClearMemoryConfirm = () => {
    if (!currentAgentId) return
    setAgentMenuOpen(false)
    setClearMemoryModalOpen(true)
  }

  const runClearAgentMemory = async () => {
    if (!currentAgentId) return
    setClearingMemory(true)
    try {
      await clearAgentMemory()
      setClearMemoryModalOpen(false)
    } finally {
      setClearingMemory(false)
    }
  }

  const handleCreateSubAgent = async (cfg: AgentConfig) => {
    await createAgent(cfg)
    await loadAgents()
    await selectAgent(cfg.id)
    setAgentMenuOpen(false)
  }

  if (isInitializing) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center bg-studio-bg px-4 py-16">
        <div
          className="animate-slide-up rounded-2xl border border-studio-border bg-studio-panel px-10 py-9 text-center shadow-[0_16px_48px_rgba(0,0,0,0.4)]"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-studio-border border-t-studio-hot" />
          <p className="text-sm font-medium text-studio-text">初始化中…</p>
          <p className="mt-1 text-xs text-studio-muted">正在加载 Agent 与模型配置</p>
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

      <div className="flex flex-shrink-0 flex-col gap-2 border-b border-studio-border bg-studio-panel/90 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-studio-muted">
          <span className="shrink-0 text-xs font-bold text-studio-text">
            {currentAgent?.config.workspace_root?.trim()
              ? '本 Agent 工作区'
              : '应用默认工作区'}
          </span>
          <code
            className="min-w-0 max-w-full flex-1 truncate rounded bg-studio-code px-1.5 py-0.5 font-mono text-[11px] text-studio-text ring-1 ring-studio-border sm:max-w-md"
            title={
              currentAgent?.config.workspace_root?.trim() ||
              projectInfo?.path ||
              ''
            }
          >
            {currentAgent?.config.workspace_root?.trim() ||
              projectInfo?.path ||
              '加载中…'}
          </code>
          <button
            type="button"
            onClick={() => void pickAgentWorkspaceFolder()}
            className={`shrink-0 rounded-md border border-studio-border bg-studio-panel px-2 py-0.5 text-xs font-medium text-studio-text transition-colors hover:bg-studio-panel-2 ${focusRing}`}
            title="仅影响未配置「专属工作区」的 Agent"
          >
            更改默认
          </button>
        </div>
        <p className="hidden text-[11px] leading-snug text-studio-muted xl:block xl:max-w-xs">
          各 Agent 可在「Agent 管理」中设置专属目录覆盖默认；与 RuleGo workDir 无关。
        </p>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-studio-border bg-gradient-to-b from-studio-code to-studio-code/95 px-4 py-2.5 sm:gap-3 sm:px-6">
        <div className="relative flex-shrink-0" ref={agentMenuRef}>
          <button
            type="button"
            onClick={() => {
              setModelMenuOpen(false)
              setAgentMenuOpen((o) => !o)
            }}
            className={`flex items-center gap-1 rounded-lg border border-studio-border bg-studio-code px-3 py-1.5 text-sm font-bold text-studio-text transition-colors hover:bg-studio-panel-2 ${focusRing}`}
            aria-expanded={agentMenuOpen}
            aria-haspopup="listbox"
          >
            <span>{currentAgent?.config.name ?? 'main'}</span>
            <svg className={`h-3.5 w-3.5 text-studio-muted transition-transform ${agentMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {agentMenuOpen && (
            <ul
              className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-studio-border bg-studio-panel py-1 shadow-[0_16px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06]"
              role="listbox"
            >
              {agentsOrdered.map(({ agent: a, depth }) => (
                <li key={a.config.id} role="option" aria-selected={a.config.id === currentAgentId}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-studio-code ${focusRing} ${a.config.id === currentAgentId ? 'bg-studio-hot/15 font-medium text-studio-hot' : 'text-studio-text'}`}
                    style={{ paddingLeft: `${12 + depth * 14}px` }}
                    onClick={() => {
                      void selectAgent(a.config.id)
                      setAgentMenuOpen(false)
                    }}
                  >
                    {depth > 0 && (
                      <span className="text-studio-muted select-none" aria-hidden>
                        └
                      </span>
                    )}
                    <span className="truncate">{a.config.name}</span>
                    {a.config.type === 'sub' && (
                      <span className="ml-auto flex-shrink-0 rounded bg-studio-panel-2 px-1.5 py-0.5 text-[10px] font-medium text-studio-muted">
                        sub
                      </span>
                    )}
                  </button>
                </li>
              ))}
              <li className="my-1 border-t border-studio-border" role="separator" />
              <li>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm text-studio-hot transition-colors hover:bg-studio-hot/15 ${focusRing}`}
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
                  className={`block w-full px-3 py-2 text-left text-sm text-studio-text transition-colors hover:bg-studio-code ${focusRing}`}
                  onClick={() => setAgentMenuOpen(false)}
                >
                  Agent 管理…
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  disabled={!currentAgentId}
                  className={`w-full px-3 py-2 text-left text-sm text-studio-muted transition-colors hover:bg-studio-code disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                  onClick={() => openClearMemoryConfirm()}
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
            className={`flex w-full items-center gap-2 rounded-lg border border-studio-border bg-studio-code px-3 py-2 text-left text-sm text-studio-text transition-colors hover:border-studio-hot hover:bg-studio-panel-2 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
            aria-expanded={modelMenuOpen}
            aria-haspopup="listbox"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={modelLine}>
              {modelLine}
            </span>
            <svg
              className={`h-3.5 w-3.5 flex-shrink-0 text-studio-muted transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {modelMenuOpen && (
            <ul
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-studio-border bg-studio-panel py-1 shadow-[0_16px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06]"
              role="listbox"
            >
              {modelOptions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-studio-muted">暂无已配置模型</li>
              ) : (
                modelOptions.map((opt, idx) => {
                  const active = modelOptionMatchesAgent(opt, currentAgent)
                  return (
                    <li key={`${opt.configId}-${opt.model}-${idx}`} role="option" aria-selected={active}>
                      <button
                        type="button"
                        disabled={isLoading}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-studio-code disabled:opacity-50 ${focusRing} ${active ? 'bg-studio-hot/15 font-medium text-studio-hot' : 'text-studio-text'}`}
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
                        <div className="truncate text-xs text-studio-muted">{opt.displayName}</div>
                      </button>
                    </li>
                  )
                })
              )}
              <li className="my-1 border-t border-studio-border" role="separator" />
              <li>
                <Link
                  to="/settings/models"
                  className={`block px-3 py-2 text-sm text-studio-hot transition-colors hover:bg-studio-hot/15 ${focusRing}`}
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
            className={`rounded-lg p-2 text-studio-muted transition-colors hover:bg-studio-panel-2 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
            title="从后端重新加载当前会话记忆"
            disabled={!currentAgentId}
            onClick={() => currentAgentId && void selectAgent(currentAgentId)}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <button
            type="button"
            className={`rounded-lg p-2 text-studio-muted transition-colors ${isLoading ? `cursor-pointer hover:bg-studio-panel-2 ${focusRing}` : 'cursor-not-allowed opacity-40'}`}
            title={isLoading ? '停止（暂不支持）' : '停止'}
            disabled={!isLoading}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
          <div className="mx-0.5 hidden h-5 w-px bg-studio-border sm:block" aria-hidden />
          <button
            type="button"
            className={`rounded-lg p-2 text-studio-hot transition-colors hover:bg-studio-hot/15 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
            title="创建子 Agent"
            aria-label="创建子 Agent"
            disabled={!currentAgent}
            onClick={() => currentAgent && setShowSubAgentModal(true)}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </button>
          <button
            type="button"
            className={`rounded-lg p-2 text-studio-muted transition-colors hover:bg-studio-panel-2 ${focusRing}`}
            title="展开"
            aria-label="展开"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button
            type="button"
            className={`rounded-lg p-2 text-studio-hot transition-colors hover:bg-studio-hot/15 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
            title="清空持久化记忆"
            aria-label="清空持久化记忆"
            disabled={!currentAgent}
            onClick={() => openClearMemoryConfirm()}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <Link
            to="/settings/models"
            className={`rounded-lg p-2 text-studio-muted transition-colors hover:bg-studio-panel-2 ${focusRing}`}
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
          <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 py-8">
            <div className="w-full max-w-md rounded-2xl border border-studio-border bg-studio-panel/90 px-8 py-10 text-center shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.04]">
              {modelOptions.length === 0 ? (
                <div className="flex flex-col gap-3 text-sm text-studio-muted">
                  <p className="m-0 text-studio-text">尚未配置可用模型，无法开始对话。</p>
                  <Link
                    to="/settings/models"
                    className={`font-semibold text-studio-hot hover:underline ${focusRing} mx-auto rounded-md`}
                  >
                    前往模型管理
                  </Link>
                </div>
              ) : error ? (
                <div className="flex flex-col gap-3 text-sm text-studio-muted">
                  <p className="m-0 text-studio-text">无法创建会话：{error}</p>
                  <button
                    type="button"
                    className={`font-semibold text-studio-hot hover:underline ${focusRing} mx-auto rounded-md`}
                    onClick={() => window.location.reload()}
                  >
                    刷新页面重试
                  </button>
                </div>
              ) : (
                <p className="m-0 text-sm text-studio-muted">正在准备对话…</p>
              )}
            </div>
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
        <div
          className="fixed bottom-4 right-4 z-[100] flex max-w-sm items-start gap-3 rounded-xl border border-studio-hot/35 bg-studio-panel px-4 py-3 text-sm text-studio-text shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-black/20"
          role="alert"
        >
          <span className="shrink-0 text-lg leading-none text-studio-hot" aria-hidden>
            ⚠
          </span>
          <span className="min-w-0 leading-snug">{error}</span>
        </div>
      )}

      {clearMemoryModalOpen && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-memory-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-studio-border bg-studio-panel p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]">
            <h2 id="clear-memory-title" className="text-lg font-bold text-studio-text">
              清空对话记忆
            </h2>
            <p className="mt-2 text-sm text-studio-muted">
              确定清空当前 Agent
              {currentAgent ? (
                <>
                  「<span className="font-medium">{currentAgent.config.name}</span>」
                </>
              ) : null }
              在后端的持久化对话记忆？此操作不可恢复。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={clearingMemory}
                onClick={() => setClearMemoryModalOpen(false)}
                className={`rounded-lg border border-studio-border px-4 py-2 text-sm font-medium text-studio-text transition-colors hover:bg-studio-code disabled:opacity-50 ${focusRing}`}
              >
                取消
              </button>
              <button
                type="button"
                disabled={clearingMemory || !currentAgentId}
                onClick={() => void runClearAgentMemory()}
                className={`rounded-lg bg-studio-hot px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(233,69,96,0.35)] transition-[filter,opacity] hover:brightness-110 disabled:opacity-50 ${focusRing}`}
              >
                {clearingMemory ? '清空中…' : '确定清空'}
              </button>
            </div>
          </div>
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
