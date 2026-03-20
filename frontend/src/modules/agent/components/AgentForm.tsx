import React, { useState } from 'react'
import type { AgentConfig } from '../types'

interface AgentFormProps {
  onSubmit: (config: AgentConfig) => void
  onCancel: () => void
}

export function AgentForm({ onSubmit, onCancel }: AgentFormProps) {
  const [config, setConfig] = useState<AgentConfig>({
    id: `agent_${Date.now()}`,
    name: '',
    type: 'sub',
    model_config: {
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model: 'gpt-4o',
      max_tokens: 2048,
      temperature: 0.7,
    },
    skills: [],
    mcp_servers: [],
    system_prompt: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!config.name || !config.model_config.api_key) {
      alert('请填写必填项')
      return
    }
    onSubmit(config)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-white rounded-lg">
      <h3 className="text-lg font-semibold mb-4">创建新 Agent</h3>

      <div>
        <label className="block text-sm font-medium mb-1">
          名称 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => setConfig({ ...config, name: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2"
          placeholder="我的 AI 助手"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">类型</label>
        <select
          value={config.type}
          onChange={(e) =>
            setConfig({
              ...config,
              type: e.target.value as AgentConfig['type'],
            })
          }
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="main">主代理</option>
          <option value="sub">子代理</option>
          <option value="worker">工作代理</option>
        </select>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-medium mb-2">模型配置</h4>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Base URL</label>
            <input
              type="text"
              value={config.model_config.base_url}
              onChange={(e) =>
                setConfig({
                  ...config,
                  model_config: {
                    ...config.model_config,
                    base_url: e.target.value,
                  },
                })
              }
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={config.model_config.api_key}
              onChange={(e) =>
                setConfig({
                  ...config,
                  model_config: {
                    ...config.model_config,
                    api_key: e.target.value,
                  },
                })
              }
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="sk-..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">模型</label>
            <input
              type="text"
              value={config.model_config.model}
              onChange={(e) =>
                setConfig({
                  ...config,
                  model_config: {
                    ...config.model_config,
                    model: e.target.value,
                  },
                })
              }
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Max Tokens
              </label>
              <input
                type="number"
                value={config.model_config.max_tokens}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    model_config: {
                      ...config.model_config,
                      max_tokens: parseInt(e.target.value),
                    },
                  })
                }
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Temperature
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={config.model_config.temperature}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    model_config: {
                      ...config.model_config,
                      temperature: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">系统提示</label>
        <textarea
          value={config.system_prompt}
          onChange={(e) =>
            setConfig({ ...config, system_prompt: e.target.value })
          }
          className="w-full border border-gray-300 rounded px-3 py-2 h-24"
          placeholder="你是一个专业的编程助手..."
        />
      </div>

      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          取消
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          创建
        </button>
      </div>
    </form>
  )
}
