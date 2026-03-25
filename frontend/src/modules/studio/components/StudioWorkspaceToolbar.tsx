import React from 'react'

interface StudioWorkspaceToolbarProps {
  sceneCollapsed: boolean
  onToggleScene: () => void
  onOpenHelp: () => void
  onOpenMemo: () => void
  onOpenTodo: () => void
  onOpenMembers: () => void
  onOpenWorkspaces: () => void
  onRefresh: () => void
  refreshing: boolean
}

/** 工作室工作区顶栏：布局控制、说明与信息弹窗入口 */
export function StudioWorkspaceToolbar({
  sceneCollapsed,
  onToggleScene,
  onOpenHelp,
  onOpenMemo,
  onOpenTodo,
  onOpenMembers,
  onOpenWorkspaces,
  onRefresh,
  refreshing,
}: StudioWorkspaceToolbarProps) {
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b-2 border-[#333] bg-[#111] px-3 py-2 font-[system-ui] sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={onToggleScene}
        className={`border px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-[13px] ${
          sceneCollapsed
            ? 'border-[var(--so-red)] bg-[var(--so-red)]/15 text-[#fca5a5]'
            : 'border-[#444] bg-[#1f1f1f] text-[#d4d4d4] hover:border-[var(--so-red)] hover:text-white'
        }`}
      >
        {sceneCollapsed ? '展开像素场景' : '收起场景'}
      </button>
      <span className="hidden h-4 w-px bg-[#333] sm:block" aria-hidden />
      <button
        type="button"
        onClick={onOpenHelp}
        className="border border-[#444] bg-[#1f1f1f] px-2.5 py-1.5 text-xs text-[#d4d4d4] hover:border-[#666] hover:text-white sm:text-[13px]"
      >
        使用说明
      </button>
      <button
        type="button"
        onClick={onOpenMemo}
        className="border border-[#444] bg-[#1f1f1f] px-2.5 py-1.5 text-xs text-[#d4d4d4] hover:border-[#666] hover:text-white sm:text-[13px]"
      >
        工作室小记
      </button>
      <button
        type="button"
        onClick={onOpenTodo}
        className="border border-[#444] bg-[#1f1f1f] px-2.5 py-1.5 text-xs text-[#d4d4d4] hover:border-[#666] hover:text-white sm:text-[13px]"
      >
        TODO 看板
      </button>
      <button
        type="button"
        onClick={onOpenMembers}
        className="border border-[#444] bg-[#1f1f1f] px-2.5 py-1.5 text-xs text-[#d4d4d4] hover:border-[#666] hover:text-white sm:text-[13px]"
      >
        成员与 @
      </button>
      <button
        type="button"
        onClick={onOpenWorkspaces}
        className="border border-[#444] bg-[#1f1f1f] px-2.5 py-1.5 text-xs text-[#d4d4d4] hover:border-[#666] hover:text-white sm:text-[13px]"
      >
        工作区目录
      </button>
      <button
        type="button"
        disabled={refreshing}
        onClick={onRefresh}
        className="ml-auto border border-[#444] bg-[#1f1f1f] px-2.5 py-1.5 text-xs text-[#d4d4d4] hover:border-[var(--so-red)] hover:text-white disabled:opacity-50 sm:text-[13px]"
      >
        {refreshing ? '刷新中…' : '刷新数据'}
      </button>
    </div>
  )
}

interface StudioWorkspaceModalShellProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}

/** 与工作室主题一致的弹窗壳（Wails WebView 友好） */
export function StudioWorkspaceModalShell({
  open,
  title,
  onClose,
  children,
  wide,
}: StudioWorkspaceModalShellProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`studio-pixel studio-office-layout flex max-h-[88vh] w-full flex-col overflow-hidden border-4 border-[var(--so-red)] bg-[var(--sp-panel)] shadow-[var(--sp-pixel-shadow)] ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b-2 border-[var(--sp-border)] bg-[var(--so-charcoal)] px-4 py-3">
          <h2 id="studio-modal-title" className="font-[system-ui] text-sm font-bold text-[#f5f5f5]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-[#555] bg-[#262626] px-3 py-1.5 font-[system-ui] text-xs text-[#e5e5e5] hover:border-[var(--so-red)]"
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 font-[system-ui] text-sm text-[#d4d4d4]">{children}</div>
      </div>
    </div>
  )
}
