import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { agentApi } from '../api'
import type { MCPServerDefinition } from '../types'

function emptyServer(): MCPServerDefinition {
  return {
    id: '',
    name: '',
    description: '',
    enabled: false,
    server_command: [],
    server_url: '',
    env: {},
    tool_names: [],
  }
}

function commandToText(cmd: string[] | undefined): string {
  if (!cmd?.length) return '[]'
  try {
    return JSON.stringify(cmd, null, 2)
  } catch {
    return '[]'
  }
}

function textToCommand(s: string): string[] {
  const t = s.trim()
  if (!t) return []
  const parsed = JSON.parse(t) as unknown
  if (!Array.isArray(parsed)) throw new Error('server_command 须为 JSON 数组，例如 ["npx","-y","@scope/server"]')
  return parsed.map((x) => String(x))
}

function envToText(env: Record<string, string> | undefined): string {
  if (!env || Object.keys(env).length === 0) return ''
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

function textToEnv(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of s.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function toolNamesToText(names: string[] | undefined): string {
  return (names ?? []).join(', ')
}

function textToToolNames(s: string): string[] {
  return s
    .split(/[,，\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

type RowDraft = { cmd: string; env: string; tools: string }

function draftsFromServers(list: MCPServerDefinition[]): RowDraft[] {
  return list.map((s) => ({
    cmd: commandToText(s.server_command),
    env: envToText(s.env),
    tools: toolNamesToText(s.tool_names),
  }))
}

export const MCPManagementPage: React.FC = () => {
  const [servers, setServers] = useState<MCPServerDefinition[]>([])
  const [drafts, setDrafts] = useState<RowDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const list = await agentApi.getMCPServerDefinitions()
      const normalized = Array.isArray(list) ? list : []
      setServers(normalized)
      setDrafts(draftsFromServers(normalized))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateRow = (i: number, patch: Partial<MCPServerDefinition>) => {
    setServers((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  const updateDraft = (i: number, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  const handleSaveAll = async () => {
    setSaving(true)
    setError(null)
    try {
      const built: MCPServerDefinition[] = servers.map((s, i) => {
        const dr = drafts[i] ?? { cmd: '[]', env: '', tools: '' }
        let server_command: string[] = []
        if (dr.cmd.trim()) {
          server_command = textToCommand(dr.cmd)
        }
        const env = textToEnv(dr.env)
        const tool_names = textToToolNames(dr.tools)
        return {
          ...s,
          server_command,
          server_url: (s.server_url ?? '').trim(),
          env: Object.keys(env).length ? env : undefined,
          tool_names: tool_names.length ? tool_names : undefined,
        }
      })
      await agentApi.saveMCPServerDefinitions(built)
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('JSON') ? msg : `保存失败: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const addRow = () => {
    setServers((prev) => [...prev, emptyServer()])
    setDrafts((prev) => [...prev, { cmd: '[]', env: '', tools: '' }])
  }

  const removeRow = (i: number) => {
    setServers((prev) => prev.filter((_, j) => j !== i))
    setDrafts((prev) => prev.filter((_, j) => j !== i))
  }

  return (
    <div className="min-h-0 flex-1 animate-fade-in overflow-auto bg-studio-code px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-studio-text">MCP 配置</h1>
            <p className="mt-1 text-sm text-studio-muted">
              配置持久化到{' '}
              <code className="rounded bg-studio-panel-2 px-1 text-studio-text">~/.devpilot/mcp.json</code>
              （全局；与当前打开的工程无关。旧版按项目分目录的配置会在首次读取时迁移至此）。
              主 Agent 会自动连接所有<strong>已启用</strong>的 MCP；其他 Agent 在 Agent 管理中勾选所需项。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/settings/agents"
              className="rounded-xl border border-studio-border bg-studio-panel px-4 py-2 text-sm font-medium text-studio-text hover:bg-studio-code"
            >
              Agent 管理
            </Link>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-xl border border-studio-border bg-studio-panel px-4 py-2 text-sm font-medium text-studio-text hover:bg-studio-code"
            >
              重新加载
            </button>
            <button
              type="button"
              onClick={addRow}
              className="rounded-xl border border-studio-border bg-studio-panel px-4 py-2 text-sm font-medium text-studio-text hover:bg-studio-code"
            >
              添加一行
            </button>
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void handleSaveAll()}
              className="rounded-xl bg-[#e11d48] px-4 py-2 text-sm font-medium text-white hover:bg-[#be123c] disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存到磁盘'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-studio-hot/50 bg-studio-hot/10 px-4 py-3 text-sm text-studio-hot">{error}</div>
        )}

        {loading ? (
          <div
            className="flex items-center gap-3 rounded-xl border border-studio-border bg-studio-panel px-6 py-10 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-studio-border border-t-studio-hot"
              aria-hidden
            />
            <span className="text-sm text-studio-muted">加载 MCP 配置…</span>
          </div>
        ) : servers.length === 0 ? (
          <div className="rounded-xl border border-studio-border bg-studio-panel p-8 text-center text-sm text-studio-muted">
            暂无 MCP 条目。点击「添加一行」后填写并保存。
            <div className="mt-3 text-left text-xs text-studio-muted">
              <p className="mb-2">stdio 示例（server_command JSON）：</p>
              <pre className="overflow-x-auto rounded-lg bg-studio-panel-2 p-3 font-mono text-[11px]">
                {`["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]`}
              </pre>
              <p className="mt-3">远程 MCP：填写「SSE URL」，stdio 命令可填 []。</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {servers.map((s, i) => {
              const dr = drafts[i] ?? { cmd: '[]', env: '', tools: '' }
              return (
                <div key={i} className="rounded-xl border border-studio-border bg-studio-panel p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-studio-text">MCP #{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-sm text-studio-muted hover:text-studio-hot"
                    >
                      删除此行
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-studio-text">ID（唯一）</span>
                      <input
                        value={s.id}
                        onChange={(e) => updateRow(i, { id: e.target.value })}
                        className="w-full rounded-lg border border-studio-border px-3 py-2 text-sm font-mono"
                        placeholder="例如 filesystem"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-studio-text">显示名称</span>
                      <input
                        value={s.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        className="w-full rounded-lg border border-studio-border px-3 py-2 text-sm"
                        placeholder="文件系统"
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-studio-text">说明</span>
                      <input
                        value={s.description ?? ''}
                        onChange={(e) => updateRow(i, { description: e.target.value })}
                        className="w-full rounded-lg border border-studio-border px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => updateRow(i, { enabled: e.target.checked })}
                      />
                      <span className="font-medium text-studio-text">已启用</span>
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-studio-text">stdio 命令（JSON 字符串数组）</span>
                      <textarea
                        value={dr.cmd}
                        onChange={(e) => updateDraft(i, { cmd: e.target.value })}
                        rows={4}
                        className="w-full rounded-lg border border-studio-border px-3 py-2 font-mono text-xs"
                        placeholder='["npx", "-y", "@scope/pkg", "arg"]'
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-studio-text">SSE / HTTP URL（可选）</span>
                      <input
                        value={s.server_url ?? ''}
                        onChange={(e) => updateRow(i, { server_url: e.target.value })}
                        className="w-full rounded-lg border border-studio-border px-3 py-2 font-mono text-sm"
                        placeholder="https://..."
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-studio-text">环境变量（每行 KEY=VALUE）</span>
                      <textarea
                        value={dr.env}
                        onChange={(e) => updateDraft(i, { env: e.target.value })}
                        rows={3}
                        className="w-full rounded-lg border border-studio-border px-3 py-2 font-mono text-xs"
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-studio-text">仅允许的工具名（可选，逗号分隔）</span>
                      <input
                        value={dr.tools}
                        onChange={(e) => updateDraft(i, { tools: e.target.value })}
                        className="w-full rounded-lg border border-studio-border px-3 py-2 text-sm"
                        placeholder="read_file, list_dir"
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
