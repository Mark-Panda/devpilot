# Cursor ACP 全局抽屉（避免全屏黑屏）设计

## 背景与问题

当前 Cursor ACP 的交互（续聊 / 提问）使用全屏遮罩 + 弹窗（`.modal-overlay` / `.modal`）呈现。在 macOS 的 Wails WebView 环境下，进入全屏后触发该弹窗会出现“遮罩层出现但弹窗内容不绘制”的黑屏现象。多次尝试通过 CSS（`backdrop-filter`、定位方式、合成层）仍无法稳定规避，推断为 WebView 在全屏模式下对某些层叠/重绘路径存在兼容性缺陷。

目标是**彻底规避黑屏**，并提升任务可见性：加入全局提醒（红点/数字角标）与 macOS 系统通知。

## 目标与非目标

### 目标

- 将 ACP 交互从“全屏遮罩弹窗”改为**全局右侧抽屉**（Drawer），避免全屏渲染缺陷。
- 提供右下角**悬浮入口按钮**（FAB），常驻显示待处理任务数（红点/数字角标）。
- 新任务到达时触发：
  - 角标更新（可含轻量动效）
  - **macOS 系统通知**（优先使用 Web Notification API；无权限或被拒绝时自动降级为仅角标提醒）
- 保留现有的 ACP 交互能力：提问/续聊 Tab、按 execution_id 筛选、逐条提交与移除。
- 交互永不“锁死界面”：支持关闭按钮与 `Esc` 关闭；不使用强拦截全屏遮罩。

### 非目标

- 不在本次改动中新增后端能力（仅前端呈现与通知触发策略）。
- 不在本次改动中重构 ACP 事件协议或数据结构（沿用当前 `cursor-acp:after-round` / `cursor-acp:ask-question` 事件 payload）。
- 不引入新的 UI 框架或大型依赖。

## 方案概述（已确认）

### UI 结构

- **FAB（右下角）**
  - **常驻**（即使 `pending.length === 0` 也必须渲染并保持事件监听挂载）
  - 点击打开/关闭右侧抽屉
  - 角标：显示待处理任务数（`pending.length`）
  - 当 `pending` 由 0 变为 >0 或计数增加时，角标进行一次轻量动效（例如 scale / pulse）

- **Drawer（右侧抽屉）**
  - 由 Portal 挂载到 `document.body`（`createPortal`），完全脱离业务页面的布局树
  - 固定定位：`position: fixed; right: 16px; top: 16px; bottom: 16px; width: min(760px, 92vw)`
  - 内容区域复用当前弹窗内部结构：header（tabs + execFilter + close）、lead、body（cards 列表）
  - **不使用** `.modal-overlay` / 全屏遮罩层；默认不加 backdrop，不依赖 `flex` 居中。
  - 关闭方式：右上角 Close 按钮 + `Esc`；（可选）点击抽屉外部区域关闭，但必须避免全屏遮罩拦截导致 WebView 触发黑屏。

### 全屏黑屏规避“禁区”（强约束）

为最大化规避 Wails WebView 全屏黑屏，ACP 抽屉相关 UI 禁止：

- 使用全屏 `position: fixed; inset: 0` 的遮罩层作为主要容器（即禁止复用 `.modal-overlay` 形态）。
- 使用 `backdrop-filter` / `filter` 作为背景效果。
- 依赖 `display:flex` 的全屏居中布局来承载主要 UI。
- 将 drawer 置于可能带 `transform`/`filter`/`overflow` 的业务容器树下（必须 Portal 到 `document.body`）。

### 通知策略（macOS）

- 使用 **Web Notification API**（能力探测 + 显式授权）：
  - 能力探测：`"Notification" in window` 且 `typeof Notification === "function"`。
  - **权限请求必须在用户手势内触发**（很多 WebView/浏览器策略要求 click/keypress 内调用 `Notification.requestPermission()`）。
  - 因此在 FAB/Drawer 内提供明确入口：**“启用系统通知”**按钮（或开关）。仅当用户点击该按钮时才请求权限。
  - 新任务到达时：若权限为 `granted` 才发送系统通知；`default/denied` 均不主动弹权限，避免静默失败与骚扰。
  - 若 `denied`：永久降级为仅角标（不再反复请求）；可在 Drawer 顶部给一次性提示文案。
- 通知文案：
  - 标题：`Cursor ACP`
  - 内容：`新增 ${delta} 条待处理任务（当前共 ${pending.length} 条）`
  - 若可用，附带执行 ID 提示（仅作为文本，不做深链）

## 数据流与状态机

### 输入事件

- Wails runtime events：
  - `cursor-acp:after-round` → 追加/更新 `PendingAfterRound`
  - `cursor-acp:ask-question` → 追加/更新 `PendingAsk`

### 本地状态

- `pending: PendingItem[]`：待处理任务队列（现有逻辑保持）
- `drawerOpen: boolean`：抽屉开关（新增）
- `tab / execFilter / tabTouched`：筛选与交互状态（现有逻辑保持）
- `seenRequestIds: Set<string>`：用于检测“新增任务”与通知去重（新增）
- `notifyEnabled: boolean`：是否已由用户显式启用系统通知（新增，可通过 `Notification.permission === "granted"` 推导）

### 行为规则

- 任务到达：
  - 更新 `pending`
  - 若 `pending.length` 增加，触发角标动效
  - 用 `request_id` 集合对比识别新增项：仅对**新增 request_id**触发通知（同一 request 的后续 update 不重复通知）
  - 若满足通知条件（能力支持 + 用户已启用 + `permission === "granted"`），触发系统通知
  -（可选）若抽屉当前关闭且有新任务，可在 FAB 上做更明显的提示（例如闪烁 1 次）
- 任务提交（resolve）：
  - 调用现有 `ResolveCursorACPAfterRound/ResolveCursorACPAskQuestion`
  - 从 `pending` 移除该 requestId
  - 若 `pending` 变为 0，角标消失

## 无障碍与可关闭兜底（必须实现）

- Drawer 容器：
  - `role="dialog"`，并设置 `aria-labelledby` 指向标题
  - 由于不使用全屏遮罩拦截交互，`aria-modal` 默认使用 `false`（避免误导）
- 焦点管理：
  - 打开 Drawer 时，将焦点移动到标题或首个可操作控件（例如 Tab 按钮）
  - 关闭 Drawer 时，将焦点返回 FAB
- 键盘：
  - `Esc` 关闭 Drawer
  - Tab 可达：至少保证 FAB、关闭按钮、Tabs、筛选、卡片内按钮都可键盘访问

## 兼容性与风险

- **全屏黑屏**：通过“去全屏遮罩 + Portal + fixed drawer”绕开，降低 WebView 重绘风险。
- **通知权限**：在无用户手势时，权限请求或通知可能失败；因此必须允许静默降级，不影响主流程。
- **多任务并发**：继续保留 execution_id 筛选，避免混淆。

## 验证点（手工）

- 全屏状态下触发 ACP 事件：
  - FAB 可见，角标更新
  - 打开 Drawer 后内容正常渲染（不黑屏）
- 非全屏状态下触发 ACP 事件：
  - Drawer 与 FAB 不遮挡核心页面操作
- 通知：
  - 点击“启用系统通知”按钮后弹出权限请求（如环境允许）
  - 允许后，新增任务时出现系统通知
  - 拒绝后不再反复打扰（仅角标）

## 迁移步骤（高层）

1. 将 `CursorACPAfterRoundHost` 从“弹窗”重构为 “ACP Center（FAB + Drawer）”，保留现有卡片组件。
2. 新增全局样式：`cursor-acp-fab`、`cursor-acp-badge`、`cursor-acp-drawer` 等。
3. 实现通知逻辑与降级策略。
4. 本地全屏/非全屏验证。

