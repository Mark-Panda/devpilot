import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { agentApi } from '../api'
import { useAgentStore } from '../store'
import { modelManagementApi, type ModelOption } from '../modelApi'
import { listAvailableSkills, type AvailableSkillItem } from '../../rulego/useRuleGoApi'
import type { AgentConfig, AgentInfo, AgentType, MCPServerPreset } from '../types'

function emptyForm(model: ModelOption | null): AgentConfig {
  const mc = model
    ? {
        base_url: model.baseUrl,
        api_key: model.apiKey,
        model: model.model,
        max_tokens: 4096,
        temperature: 0.7,
      }
    : {
        base_url: '',
        api_key: '',
        model: '',
        max_tokens: 4096,
        temperature: 0.7,
      }
  return {
    id: '',
    name: '',
    role: '',
    type: 'main',
    parent_id: '',
    model_config: mc,
    skills: [],
    mcp_servers: [],
    system_prompt: '',
    metadata: {},
  }
}

function configFromAgent(info: AgentInfo): AgentConfig {
  const c = info.config
  return {
    id: c.id,
    name: c.name,
    role: c.role ?? '',
    type: c.type,
    parent_id: c.parent_id ?? '',
    model_config: { ...c.model_config },
    skills: [...(c.skills ?? [])],
    mcp_servers: [...(c.mcp_servers ?? [])],
    system_prompt: c.system_prompt ?? '',
    metadata: { ...(c.metadata ?? {}) },
  }
}

export const AgentManagementPage: React.FC = () => {
  const { agents, loadAgents, createAgent, updateAgent, destroyAgent } = useAgentStore()
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [skillsCatalog, setSkillsCatalog] = useState<AvailableSkillItem[]>([])
  const [mcpCatalog, setMcpCatalog] = useState<MCPServerPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AgentConfig>(() => emptyForm(null))
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      await loadAgents()
      const [opts, sk, mcp] = await Promise.all([
        modelManagementApi.getAllModelOptions(),
        listAvailableSkills().catch(() => [] as AvailableSkillItem[]),
        agentApi.listMCPServerPresets().catch(() => [] as MCPServerPreset[]),
      ])
      setModelOptions(opts)
      setSkillsCatalog(sk)
      setMcpCatalog(mcp)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [loadAgents])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openCreate = () => {
    const first = modelOptions[0] ?? null
    setEditingId(null)
    setForm(emptyForm(first))
    setModalOpen(true)
  }

  const openEdit = (info: AgentInfo) => {
    setEditingId(info.config.id)
    setForm(configFromAgent(info))
    setModalOpen(true)
  }

  const toggleSkill = (name: string) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(name) ? f.skills.filter((s) => s !== name) : [...f.skills, name],
    }))
  }

  const toggleMcp = (id: string) => {
    setForm((f) => ({
      ...f,
      mcp_servers: f.mcp_servers.includes(id)
        ? f.mcp_servers.filter((x) => x !== id)
        : [...f.mcp_servers, id],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('请填写名称')
      return
    }
    if (!form.model_config.base_url || !form.model_config.model) {
      setError('请选择或填写完整模型配置')
      return
    }
    if (form.type === 'sub' && !form.parent_id?.trim()) {
      setError('子 Agent 需要选择父 Agent')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const parent_id = form.type === 'sub' ? form.parent_id : undefined
      if (editingId) {
        await updateAgent({
          ...form,
          id: editingId,
          parent_id: parent_id ?? '',
          metadata: form.metadata ?? {},
        })
      } else {
        const id = `agent_${Date.now()}`
        await createAgent({
          ...form,
          id,
          parent_id: parent_id ?? '',
          metadata: form.metadata ?? {},
        })
      }
      setModalOpen(false)
      await loadAgents()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (info: AgentInfo) => {
    if (info.config.type === 'main') {
      setError('主 Agent 不可删除')
      return
    }
    if (!window.confirm(`确定删除 Agent「${info.config.name}」？其子 Agent 与对话记忆也会被删除。`)) return
    try {
      await destroyAgent(info.config.id)
      await loadAgents()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const mainAgents = agents.filter((a) => a.config.type === 'main')

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-stone-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-800">Agent 管理</h1>
            <p className="mt-1 text-sm text-stone-500">
              为每个 Agent 配置角色，并从全局技能目录与{' '}
              <Link to="/settings/mcp" className="font-medium text-rose-700 underline">
                MCP 配置
              </Link>
              中已启用的服务里勾选子集（<strong>主 Agent</strong> 会自动加载全部已启用 MCP）。聊天页顶部可切换 Agent。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/agent"
              className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              返回聊天
            </Link>
            <button
              type="button"
              onClick={openCreate}
              disabled={modelOptions.length === 0}
              className="rounded-xl bg-[#e11d48] px-4 py-2 text-sm font-medium text-white hover:bg-[#be123c] disabled:opacity-50"
            >
              新建 Agent
            </button>
          </div>
        </div>

        {modelOptions.length === 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            请先在
            <Link to="/settings/models" className="mx-1 font-medium underline">
              模型管理
            </Link>
            添加至少一个模型，再创建 Agent。
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        )}

        {loading ? (
          <p className="text-sm text-stone-500">加载中…</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-100 bg-stone-50 text-stone-600">
                <tr>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">模型</th>
                  <th className="px-4 py-3 font-medium">技能</th>
                  <th className="px-4 py-3 font-medium">MCP</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.config.id} className="border-b border-stone-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-stone-800">{a.config.name}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-stone-600" title={a.config.role}>
                      {a.config.role || '—'}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{a.config.type}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs text-stone-600">
                      {a.config.model_config.model}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{(a.config.skills ?? []).length}</td>
                    <td className="px-4 py-3 text-stone-600">{(a.config.mcp_servers ?? []).length}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(a)}
                        className="mr-2 text-rose-600 hover:underline"
                      >
                        编辑
                      </button>
                      {a.config.type !== 'main' ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(a)}
                          className="text-stone-500 hover:text-rose-600"
                        >
                          删除
                        </button>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {agents.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-stone-500">暂无 Agent，请点击「新建 Agent」</p>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl">
            <form onSubmit={(e) => void handleSubmit(e)} className="p-6">
              <h2 className="text-lg font-semibold text-stone-800">
                {editingId ? '编辑 Agent' : '新建 Agent'}
              </h2>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">名称</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">角色</label>
                  <textarea
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    rows={2}
                    placeholder="例如：负责代码审查与重构建议"
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  />
                </div>
                {!editingId && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-stone-700">类型</label>
                      <select
                        value={form.type}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            type: e.target.value as AgentType,
                            parent_id: e.target.value === 'sub' ? f.parent_id : '',
                          }))
                        }
                        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                      >
                        <option value="main">主 Agent</option>
                        <option value="sub">子 Agent</option>
                        <option value="worker">工作 Agent</option>
                      </select>
                    </div>
                    {form.type === 'sub' && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-stone-700">父 Agent</label>
                        <select
                          value={form.parent_id}
                          onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
                          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                          required
                        >
                          <option value="">请选择</option>
                          {mainAgents.map((m) => (
                            <option key={m.config.id} value={m.config.id}>
                              {m.config.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
                {editingId && (
                  <p className="text-xs text-stone-500">
                    类型与父子关系创建后不可在此修改；模型与密钥可在下方调整。
                  </p>
                )}
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">模型</label>
                  <select
                    value={
                      modelOptions.find(
                        (o) =>
                          o.model === form.model_config.model &&
                          o.baseUrl === form.model_config.base_url
                      )
                        ? `${form.model_config.base_url}\t${form.model_config.model}`
                        : ''
                    }
                    onChange={(e) => {
                      const v = e.target.value
                      if (!v) return
                      const [baseUrl, model] = v.split('\t')
                      const opt = modelOptions.find((o) => o.baseUrl === baseUrl && o.model === model)
                      if (opt) {
                        setForm((f) => ({
                          ...f,
                          model_config: {
                            base_url: opt.baseUrl,
                            api_key: opt.apiKey,
                            model: opt.model,
                            max_tokens: f.model_config.max_tokens ?? 4096,
                            temperature: f.model_config.temperature ?? 0.7,
                          },
                        }))
                      }
                    }}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  >
                    <option value="">选择已配置模型</option>
                    {modelOptions.map((o, i) => (
                      <option key={`${o.configId}-${o.model}-${i}`} value={`${o.baseUrl}\t${o.model}`}>
                        {o.model} — {o.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">系统提示</label>
                  <textarea
                    value={form.system_prompt}
                    onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
                    rows={4}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    placeholder="可选；留空则使用默认助手说明"
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium text-stone-700">技能（全局 ~/.devpilot/skills）</div>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50 p-3">
                    {skillsCatalog.length === 0 ? (
                      <p className="text-xs text-stone-500">暂无技能，请使用技能仓库同步</p>
                    ) : (
                      skillsCatalog.map((s) => (
                        <label key={s.name} className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.skills.includes(s.name)}
                            onChange={() => toggleSkill(s.name)}
                            className="mt-1"
                          />
                          <span>
                            <span className="font-medium text-stone-800">{s.name}</span>
                            <span className="block text-xs text-stone-500">{s.description}</span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium text-stone-700">MCP（~/.devpilot/mcp.json 中已启用的条目）</div>
                  <div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50 p-3">
                    {mcpCatalog.map((m) => (
                      <label key={m.id} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.mcp_servers.includes(m.id)}
                          onChange={() => toggleMcp(m.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium text-stone-800">{m.name}</span>
                          <span className="block text-xs text-stone-500">{m.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2 border-t border-stone-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#e11d48] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
