import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgentStore } from '../store'
import { modelManagementApi, type ModelOption } from '../modelApi'
import { ChatMessages } from '../components/ChatMessages'
import { ChatInput } from '../components/ChatInput'

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

  const currentAgent = agents.find((a) => a.config.id === currentAgentId)
  const currentMessages = currentAgentId ? messages : []

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-slate-300 border-t-red-500 mb-3" />
          <p className="text-slate-500 text-sm">初始化中...</p>
        </div>
      </div>
    )
  }

  // 欢迎：选择模型（OpenClaw 风格，统一卡片列表）
  if (!currentAgent || showWelcome) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* 欢迎页顶部 */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white/95 pb-3 mb-4">
          <nav className="flex items-center gap-1.5 text-sm text-slate-500">
            <Link to="/" className="hover:text-slate-700">DevPilot</Link>
            <span className="text-slate-300">›</span>
            <span className="text-slate-800 font-medium">聊天</span>
          </nav>
          <div className="flex-1" />
          <span className="text-xs text-slate-400">⌘K</span>
        </div>

        <div className="flex-1 min-h-0">
          <div className="max-w-2xl">
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

  // OpenClaw 风格主对话界面
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 顶部单行工具栏 */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white pb-3 mb-2">
        {/* 汉堡菜单（预留） */}
        <button type="button" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0" aria-label="菜单">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* 面包屑 */}
        <nav className="flex items-center gap-1.5 text-sm text-slate-500 flex-shrink-0">
          <Link to="/" className="hover:text-slate-700">DevPilot</Link>
          <span className="text-slate-300">›</span>
          <span className="text-slate-800 font-medium">聊天</span>
        </nav>

        {/* Agent pill */}
        <div className="relative flex-shrink-0">
          <select
            value={currentAgentId ?? ''}
            onChange={(e) => { const id = e.target.value; if (id) selectAgent(id); }}
            className="appearance-none rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 pr-7 focus:border-slate-400 focus:outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          >
            {agents.map((a) => (
              <option key={a.config.id} value={a.config.id}>{a.config.name}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Model pill */}
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600 flex-shrink-0 max-w-[200px] truncate">
          {currentAgent?.config.model_config.model ?? '—'}
        </div>

        {/* 弹性空白 */}
        <div className="flex-1" />

        {/* 右侧图标组 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <span className="text-xs text-slate-400 px-2 hidden sm:inline">⌘K</span>
          <button type="button" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="刷新">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <button
            type="button"
            className={`p-2 rounded-lg text-slate-500 ${isLoading ? 'hover:bg-slate-100 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
            title={isLoading ? "停止（暂不支持）" : "停止"}
            disabled={!isLoading}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
          <button type="button" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="历史">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button type="button" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="主题">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          </button>
          <button type="button" onClick={() => setShowWelcome(true)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="设置/切换模型">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
      </div>

      {/* 消息区域 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ChatMessages
          messages={currentMessages}
          isLoading={isLoading}
          systemPrompt={currentAgent?.config.system_prompt}
          agentName={currentAgent?.config.name}
          modelName={currentAgent?.config.model_config.model}
        />
      </div>

      {/* 浮动输入栏 */}
      <div className="pt-4 pb-2">
        <ChatInput
          onSend={(msg) => sendMessage(msg)}
          isLoading={isLoading}
          placeholder={`Message ${currentAgent?.config.name ?? 'Agent'} (Enter 发送)`}
        />
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
