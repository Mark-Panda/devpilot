# Chat UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 DevPilot 聊天界面对齐 OpenClaw 参考截图，包括左侧导航分组、顶部工具栏重构、Tool output 卡片样式。

**Architecture:** 纯前端改动，涉及 4 个文件：`Layout.tsx`（导航分组+版本号）、`AgentChatPage.tsx`（顶部工具栏重构）、`ChatMessages.tsx`（Tool output 卡片）、`globals.css`（新增导航样式）。不改动后端逻辑，不引入新依赖。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, React Router

---

### Task 1: 左侧导航分组 + 版本号（Layout.tsx + globals.css）

**Files:**
- Modify: `frontend/src/shared/components/Layout/Layout.tsx`
- Modify: `frontend/src/styles/globals.css`

**Step 1: 修改 Layout.tsx — 菜单数据结构改为分组**

将 `menuItems` 数组改为带 `group` 字段的分组结构，并在渲染时输出分组标题：

```tsx
// frontend/src/shared/components/Layout/Layout.tsx

const menuGroups: { group?: string; items: { path: string; label: string; end?: boolean }[] }[] = [
  {
    items: [
      { path: "/agent", label: "聊天" },
    ],
  },
  {
    group: "控制",
    items: [
      { path: "/route-rewrite", label: "重构路由管理" },
      { path: "/curl-compare", label: "接口对比" },
      { path: "/terminal", label: "终端" },
    ],
  },
  {
    group: "规则引擎",
    items: [
      { path: "/rulego", label: "RuleGo 规则管理", end: true },
      { path: "/rulego/logs", label: "RuleGo 执行日志" },
    ],
  },
  {
    group: "设置",
    items: [
      { path: "/skill-repo", label: "技能仓库" },
      { path: "/settings/models", label: "模型管理" },
    ],
  },
];
```

**Step 2: 修改 Layout.tsx — 渲染分组标题 + 版本号**

```tsx
export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isRuleGoEditor = location.pathname.startsWith("/rulego/editor");

  return (
    <div className={`app-shell${isRuleGoEditor ? " app-shell-full" : ""}`}>
      {!isRuleGoEditor && (
        <aside className="app-sidebar">
          <div className="app-brand">
            <img src="/devpilot-logo.png" alt="DevPilot" className="app-brand-logo" />
          </div>
          <nav className="app-nav">
            {menuGroups.map((group, gi) => (
              <div key={gi} className="app-nav-group">
                {group.group && (
                  <div className="app-nav-group-label">{group.group}</div>
                )}
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end ?? false}
                    className={({ isActive }) =>
                      `app-nav-item${isActive ? " is-active" : ""}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="app-version">
            <span className="app-version-dot" />
            版本 v0.1.0
          </div>
        </aside>
      )}
      <main className="app-content">{children}</main>
    </div>
  );
}
```

**Step 3: 在 globals.css 中新增导航分组样式**

在 `.app-nav` 样式后追加：

```css
.app-nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-nav-group-label {
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 12px 12px 4px;
}

.app-version {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  font-size: 12px;
  color: #475569;
}

.app-version-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}
```

**Step 4: 验证**

在浏览器中确认：
- 左侧导航有"控制"、"规则引擎"、"设置"分组标题
- 底部有绿点 + "版本 v0.1.0"

**Step 5: Commit**

```bash
git add frontend/src/shared/components/Layout/Layout.tsx frontend/src/styles/globals.css
git commit -m "feat: add nav group labels and version badge to sidebar"
```

---

### Task 2: 顶部工具栏重构（AgentChatPage.tsx）

**Files:**
- Modify: `frontend/src/modules/agent/pages/AgentChatPage.tsx`

**Step 1: 重构主对话界面的顶部工具栏**

将现有两行（面包屑行 + 配置栏行）合并为单行工具栏。完整替换 `return` 中的顶部区域（`/* 顶部栏 */` 和 `/* 聊天配置栏 */` 两个 div）：

```tsx
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
    <button type="button" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="停止">
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
```

同时，欢迎页的顶部也做同样的单行简化（只保留面包屑 + ⌘K，无 pill）。

**Step 2: 验证**

- 顶部工具栏为单行
- Agent 和 Model 显示为圆角胶囊样式
- 右侧有图标按钮组

**Step 3: Commit**

```bash
git add frontend/src/modules/agent/pages/AgentChatPage.tsx
git commit -m "feat: refactor chat toolbar to single-row with pill selectors"
```

---

### Task 3: Tool output 折叠卡片（ChatMessages.tsx）

**Files:**
- Modify: `frontend/src/modules/agent/components/ChatMessages.tsx`

**Step 1: 将工具调用渲染改为独立卡片**

找到现有的工具调用渲染块（`msg.metadata?.toolCalls` 部分），替换为：

```tsx
{msg.role === 'assistant' && msg.metadata?.toolCalls && (msg.metadata.toolCalls as { name?: string; summary?: string }[]).length > 0 && (
  <div className="flex flex-col gap-1.5 mb-2">
    {(msg.metadata.toolCalls as { name?: string; summary?: string }[]).map((tool, i) => {
      const key = `${msg.id}-tool-${i}`
      const expanded = expandedTools[key]
      return (
        <button
          key={key}
          type="button"
          onClick={() => setExpandedTools((s) => ({ ...s, [key]: !s[key] }))}
          className="flex flex-col items-start w-fit max-w-full rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-left transition-colors shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-amber-500">✦</span>
            <span className="font-medium">{tool.name ?? 'Tool'}</span>
            <span className="text-slate-400 text-xs">read</span>
            <svg
              className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {expanded && tool.summary && (
            <div className="mt-1.5 text-xs text-slate-500 max-w-xs">{tool.summary}</div>
          )}
        </button>
      )
    })}
  </div>
)}
```

**Step 2: 验证**

- 工具调用显示为独立卡片，有 `✦` 图标和 `read` 标签
- 点击可展开 summary

**Step 3: Commit**

```bash
git add frontend/src/modules/agent/components/ChatMessages.tsx
git commit -m "feat: render tool calls as collapsible cards"
```

---

### Task 4: 整体验收

**Step 1: 启动开发服务器**

```bash
make dev
```

**Step 2: 逐项对照参考截图检查**

- [ ] 左侧导航有"控制"、"规则引擎"、"设置"分组标题（灰色小字大写）
- [ ] 左侧底部有绿点 + 版本号
- [ ] 聊天页顶部为单行工具栏
- [ ] Agent 和 Model 为圆角胶囊样式
- [ ] 右侧有刷新、停止、历史、主题、设置图标
- [ ] Tool output 为独立可折叠卡片
- [ ] 其他页面（路由管理、接口对比等）不受影响

**Step 3: 最终 Commit**

```bash
git add .
git commit -m "feat: align chat UI to OpenClaw reference design"
```
