# Cursor ACP Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Cursor ACP 的“全屏弹窗”改为全局右侧抽屉 + 右下角悬浮入口，并提供任务数角标与（可选启用的）macOS 系统通知，彻底规避全屏黑屏与界面锁死。

**Architecture:** 前端以 `CursorACPAfterRoundHost` 作为 ACP Center，常驻监听 Wails events；通过 `createPortal(..., document.body)` 渲染 FAB 与 Drawer（不使用全屏遮罩）；新任务用 `request_id` 集合去重触发角标动效与系统通知。

**Tech Stack:** React 18 + Vite + Wails runtime events + CSS（`frontend/src/styles/globals.css`）

---

## 文件结构（本次会改动/新增）

**Modify:**
- `frontend/src/modules/rulego/CursorACPAfterRoundHost.tsx`：从 modal 变为 ACP Center（FAB + Drawer + 通知逻辑 + Esc/焦点兜底）
- `frontend/src/styles/globals.css`：新增 `cursor-acp-fab` / `cursor-acp-badge` / `cursor-acp-drawer` 等样式；ACP 不再使用 `.modal-overlay` 形态

**Reference:**
- `docs/superpowers/specs/2026-03-31-cursor-acp-drawer-design.md`

---

### Task 1: 抽离“可复用内容区”并引入 Drawer 容器

**Files:**
- Modify: `frontend/src/modules/rulego/CursorACPAfterRoundHost.tsx`

- [ ] **Step 1: 将现有 modal UI 的“header/lead/body(cards)”提取成一个可复用 JSX 片段**
  - 保留：tabs、execFilter、counts、filtered map、AfterRoundCard/AskCard
  - 新增：drawerOpen state、close 按钮（右上角）

- [ ] **Step 2: 用 `createPortal` 渲染 Drawer 容器到 `document.body`**
  - Drawer：`role="dialog"`, `aria-labelledby`，不使用全屏遮罩
  - Drawer 关闭方式：Close 按钮、`Esc`

- [ ] **Step 3: 焦点管理**
  - 打开：聚焦到标题或首个 tab 按钮
  - 关闭：聚焦回 FAB

- [ ] **Step 4: 本地手工验证**
  - 全屏/非全屏打开抽屉，内容可见且不黑屏
  - `Esc` 可关闭，关闭后 FAB 仍在

---

### Task 2: FAB 入口 + 数字角标（红点）+ 动效

**Files:**
- Modify: `frontend/src/modules/rulego/CursorACPAfterRoundHost.tsx`
- Modify: `frontend/src/styles/globals.css`

- [ ] **Step 1: 增加 FAB（右下角）与角标渲染**
  - FAB 常驻（即 `pending.length===0` 也渲染）
  - 角标显示 `pending.length`（0 时隐藏）

- [ ] **Step 2: 角标动效触发**
  - `pending` 新增任务时给角标加一次性 class（例如 `is-pulse`），动画结束移除

- [ ] **Step 3: CSS 样式**
  - `cursor-acp-fab`：固定右下角、可点击、与深色主题一致
  - `cursor-acp-badge`：红色圆角角标（>=100 显示 `99+`）
  - `cursor-acp-drawer`：右侧抽屉固定定位、阴影、分区滚动

- [ ] **Step 4: 本地手工验证**
  - 新任务到达时角标出现并 pulse 一次
  - 点击 FAB 打开抽屉，点击关闭或 Esc 关闭

---

### Task 3: 系统通知（显式启用 + 去重）

**Files:**
- Modify: `frontend/src/modules/rulego/CursorACPAfterRoundHost.tsx`

- [ ] **Step 1: 能力探测与显式启用按钮**
  - Drawer 内增加“启用系统通知”按钮，仅在 `Notification.permission !== "granted"` 时展示
  - 点击按钮时（用户手势内）调用 `Notification.requestPermission()`
  - 若 denied：展示一次性提示“已拒绝，将仅显示角标”
  - **硬约束**：仅当 `"Notification" in window` 且 `typeof Notification === "function"` 时才显示/启用相关 UI；否则隐藏并仅角标提示
  - **硬约束**：`Notification.permission !== "granted"` 时绝不调用 `new Notification(...)`

- [ ] **Step 2: 去重与触发策略**
  - 维护 `seenRequestIds`（或 `notifiedRequestIds`）
  - 仅当新增 `request_id` 到达时，若 `permission==="granted"` 且已启用，触发 `new Notification(...)`
  - 文案：`Cursor ACP` / `新增 N 条待处理任务（当前共 M 条）`
  - **回收策略**：当 request 被 resolve 并从 `pending` 移除时，同时从 `seenRequestIds` 删除；并设一个容量上限（例如 5000）以防极端情况下长期增长（超限则清空并以当前 pending 重新初始化）
  - `delta` 计算：用“本次事件导致新增的 request_id 数量”作为 N（而不是用 `pending.length` 差值）

- [ ] **Step 3: 本地手工验证**
  - 点击启用后能弹权限（若环境支持）
  - 权限 granted 后新任务会弹系统通知
  - 同一 request 多次 update 不重复通知

---

### Task 4: 清理旧 ACP “全屏弹窗”路径的使用点（行为层）

**Files:**
- Modify: `frontend/src/modules/rulego/CursorACPAfterRoundHost.tsx`
- Modify: `frontend/src/styles/globals.css`（仅确保新 UI 不依赖 `.modal-overlay`）

- [ ] **Step 1: 确保 ACP 不再渲染 `.modal-overlay` 结构**
- [ ] **Step 2: 全屏场景复测**
  - 触发 ACP 后不再出现“全屏遮罩黑屏”

---

## 验收清单（Definition of Done）

- 全屏下触发 ACP：不黑屏；FAB/Drawer 正常显示；可关闭；不会锁死界面
- 角标正确显示待处理任务数，新增任务时动效一次
- 系统通知：仅在用户点击启用并授权后触发；拒绝后不再打扰；同 request 不重复通知
- 无障碍：Drawer `role="dialog"`，`aria-modal={false}`；打开聚焦到标题/Tab，关闭回到 FAB；键盘可达关键控件

