import React, { useState } from 'react'
import type { AgentConfig, AgentInfo } from '../types'

export interface SubAgentModalProps {
  parentAgent: AgentInfo
  onSubmit: (config: AgentConfig) => Promise<void>
  onClose: () => void
}

export function SubAgentModal({ parentAgent, onSubmit, onClose }: SubAgentModalProps) {
  const [name, setName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const id = `agent_sub_${Date.now()}`
    const cfg: AgentConfig = {
      id,
      name: trimmed,
      type: 'sub',
      parent_id: parentAgent.config.id,
      model_config: { ...parentAgent.config.model_config },
      skills: [...(parentAgent.config.skills ?? [])],
      mcp_servers: [...(parentAgent.config.mcp_servers ?? [])],
      system_prompt:
        systemPrompt.trim() ||
        `你是主助手「${parentAgent.config.name}」下的子代理，专注完成委派任务。`,
    }
    setSubmitting(true)
    try {
      await onSubmit(cfg)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-xl">
        <div className="border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-stone-800">创建子 Agent</h2>
          <p className="mt-1 text-sm text-stone-500">
            继承「{parentAgent.config.name}」的模型与技能，独立会话记忆。
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label htmlFor="sub-agent-name" className="mb-1 block text-sm font-medium text-stone-700">
              名称 <span className="text-rose-500">*</span>
            </label>
            <input
              id="sub-agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-rose-500/30 focus:border-rose-400 focus:ring-2"
              placeholder="例如：代码审查"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="sub-agent-prompt" className="mb-1 block text-sm font-medium text-stone-700">
              系统提示（可选）
            </label>
            <textarea
              id="sub-agent-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-rose-500/30 focus:border-rose-400 focus:ring-2"
              placeholder="留空则使用默认子代理说明"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="rounded-xl bg-[#e11d48] px-4 py-2 text-sm font-medium text-white hover:bg-[#be123c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '创建中…' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
