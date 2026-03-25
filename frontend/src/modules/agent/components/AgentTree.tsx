import React from 'react'
import type { AgentTreeNode } from '../types'

interface AgentTreeProps {
  tree: AgentTreeNode | null
  selectedId: string | null
  onSelect: (agentId: string) => void
  onDestroy?: (agentId: string) => void
}

export function AgentTree({
  tree,
  selectedId,
  onSelect,
  onDestroy,
}: AgentTreeProps) {
  if (!tree) {
    return (
      <div className="p-4 text-center text-studio-muted">
        <p>暂无 Agent</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <TreeNode
        node={tree}
        selectedId={selectedId}
        onSelect={onSelect}
        onDestroy={onDestroy}
        level={0}
      />
    </div>
  )
}

interface TreeNodeProps {
  node: AgentTreeNode
  selectedId: string | null
  onSelect: (agentId: string) => void
  onDestroy?: (agentId: string) => void
  level: number
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  onDestroy,
  level,
}: TreeNodeProps) {
  const [expanded, setExpanded] = React.useState(true)
  const agent = node.agent
  const hasChildren = node.children && node.children.length > 0
  const isSelected = agent.config.id === selectedId

  const statusColor = {
    idle: 'bg-green-500',
    busy: 'bg-yellow-500',
    stopped: 'bg-gray-500',
  }[agent.status]

  return (
    <div style={{ marginLeft: level * 20 }}>
      <div
        className={`flex cursor-pointer items-center justify-between rounded p-2 hover:bg-studio-panel-2 ${
          isSelected ? 'border-l-4 border-studio-hot bg-studio-hot/10' : ''
        }`}
        onClick={() => onSelect(agent.config.id)}
      >
        <div className="flex items-center space-x-2 flex-1">
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-studio-border"
            >
              {expanded ? '▼' : '▶'}
            </button>
          )}
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
          <div className="flex-1">
            <div className="text-sm font-medium text-studio-text">{agent.config.name}</div>
            <div className="text-xs text-studio-muted">
              {agent.config.type} · {agent.message_count} 条消息
            </div>
          </div>
        </div>
        {onDestroy && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (
                confirm(`确定要销毁 Agent "${agent.config.name}" 吗?`)
              ) {
                onDestroy(agent.config.id)
              }
            }}
            className="px-2 py-1 text-xs text-studio-hot hover:text-white"
          >
            删除
          </button>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.agent.config.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onDestroy={onDestroy}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
