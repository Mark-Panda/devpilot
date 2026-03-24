import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { studioApi } from '../api'
import { agentApi } from '../../agent/api'
import type { Studio } from '../types'
import type { AgentInfo } from '../../agent/types'

export const StudioListPage: React.FC = () => {
  const navigate = useNavigate()
  const [studios, setStudios] = useState<Studio[]>([])
  const [mains, setMains] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [mainId, setMainId] = useState('')
  const [saving, setSaving] = useState(false)
  /** 页内确认（Wails WebView 下 window.confirm 可能不弹出或始终 false） */
  const [confirmDelete, setConfirmDelete] = useState<Studio | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [list, agents] = await Promise.all([studioApi.listStudios(), agentApi.listAgents()])
      setStudios(list)
      setMains(agents.filter((a) => a.config.type === 'main'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mainId) return
    setSaving(true)
    setError(null)
    try {
      const st = await studioApi.createStudio(name.trim(), mainId)
      setModalOpen(false)
      setName('')
      setMainId('')
      await refresh()
      navigate(`/studios/${st.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const runDelete = async (st: Studio) => {
    const id = st.id?.trim()
    if (!id) {
      setError('工作室 ID 无效，请刷新列表后重试')
      setConfirmDelete(null)
      return
    }
    setDeletingId(id)
    setError(null)
    try {
      await studioApi.deleteStudio(id)
      setConfirmDelete(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-stone-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">工作室</h1>
            <p className="mt-1 text-sm text-stone-500">
              每个工作室绑定一个主 Agent；创建时会以当前主 Agent 下属树作为协作成员。对话仅与主 Agent 进行，子任务由主 Agent
              委派，进度在工作室页实时展示。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-xl bg-[#e11d48] px-4 py-2 text-sm font-medium text-white hover:bg-[#be123c]"
          >
            新建工作室
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 py-12 text-sm text-stone-500">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-rose-500" />
            加载中…
          </div>
        ) : studios.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-8 py-14 text-center shadow-sm">
            <p className="text-base font-bold text-stone-900">还没有工作室</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
              创建一个工作室，把主 Agent 及其子 Agent 拉进同一协作空间，在左侧看任务进度与 TODO，在右侧与主 Agent 对话。
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-6 rounded-xl bg-[#e11d48] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#be123c]"
            >
              新建工作室
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {studios.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3.5 shadow-sm transition-shadow duration-200 hover:border-stone-300 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/studios/${s.id}`}
                    className="font-medium text-stone-900 hover:text-rose-700"
                  >
                    {s.name}
                  </Link>
                  <p className="mt-0.5 truncate font-mono text-xs text-stone-500" title={s.main_agent_id}>
                    主 Agent · {s.main_agent_id}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    to={`/studios/${s.id}`}
                    className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
                  >
                    进入
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(s)}
                    disabled={deletingId !== null}
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-delete-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h2 id="studio-delete-title" className="text-lg font-bold text-stone-900">
              删除工作室
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              确定删除「{confirmDelete.name || confirmDelete.id}」？进度记录与工作室 TODO 将一并清理。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => void runDelete(confirmDelete)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deletingId ? '删除中…' : '确定删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-stone-900">新建工作室</h2>
            <p className="mt-1 text-xs text-stone-500">将同步纳入当前主 Agent 下的全部子 Agent（以运行时树为准）。</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">名称</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="留空则使用主 Agent 名称"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">主 Agent</label>
                <select
                  required
                  value={mainId}
                  onChange={(e) => setMainId(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="">请选择 main 类型 Agent</option>
                  {mains.map((a) => (
                    <option key={a.config.id} value={a.config.id}>
                      {a.config.name} ({a.config.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-700"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving || !mainId}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? '创建中…' : '创建'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
