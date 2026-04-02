## Context

当前 RuleGo 可视化编辑器（`RuleGoScratchEditorPage.tsx`，约 7000 行）基于 Scratch-Blocks（Blockly SVG）实现积木拼接画布。规则链 DSL 是扁平有向图（`metadata.nodes[]` + `metadata.connections[]`），后端引擎不变。

**现有系统关键约束：**
- 30+ 种节点类型，每种有 `BlockTypeDef`（含 `getConfiguration`/`setConfiguration`）
- `BlockConfigModal` 通过 `block.getFieldValue()` 读写 Blockly Block 字段
- `BlockLibraryPanel` 通过 HTML5 drag API 投放 `blockType` 到 Blockly 工作区
- join 节点（多入边汇聚）是高频使用场景，规则链有向图不满足树形结构

## Goals / Non-Goals

**Goals:**
- 用 ReactFlow 画布替换 Scratch-Blocks SVG 画布，保留左侧组件库面板和节点配置弹窗
- 支持任意有向图（含 join 多入边、有向环、fork 并行），数据零损失
- for / switch / groupAction / fork 节点支持子节点内嵌展示（parentId 子画布）
- 初始加载时 dagre 自动计算从上到下层级布局
- 节点卡片按分类用不同颜色/图标区分，点击展开右侧配置面板

**Non-Goals:**
- 不改动后端 RuleGo 引擎或 DSL 格式
- 不替换 `BlockTypeDef` 定义体系（`getConfiguration`/`setConfiguration` 复用）
- 不删除现有 Scratch 编辑器（并存，路由层切换）
- 不实现实时协同编辑

## Decisions

### D1：画布引擎选 ReactFlow，不选 FlowGram

**选择：** `@xyflow/react`（ReactFlow v12）

**原因：**
- join 节点（多入边汇聚）是高频场景，FlowGram Fixed Layout 是纯树形模型，join 的多入边无法表达
- FlowGram Free Layout 理论上支持有向图，但依赖 Inversify IoC（`reflect-metadata` polyfill）与 `styled-components`，引入复杂度高
- ReactFlow 无强依赖，与现有 Tailwind + Vite 体系完全兼容
- ReactFlow 社区活跃度和 Electron/桌面 App 场景覆盖远优于 FlowGram

**备选：** FlowGram Free Layout → 排除（依赖重、join 语义需额外处理）

---

### D2：子画布用 ReactFlow parentId 机制，不用独立 SubFlow

**选择：** for / switch / groupAction / fork 的子节点设置 `parentId` = 父节点 id，`extent: 'parent'`，父节点用 `NodeResizer` 动态调整大小

```
for 节点（type: 'rulego_for', style: { width, height }）
  └── 子节点 A（parentId: for节点id, position: 局部坐标）
  └── 子节点 B（parentId: for节点id, position: 局部坐标）
```

展开/折叠：切换子节点的 `hidden` 属性，父节点高度在展开时由 `NodeResizer` 撑开，折叠时收缩到固定高度。

**原因：** ReactFlow 原生支持 parentId 嵌套，无需额外子 Flow 实例，位置计算简单（局部坐标）

---

### D3：DSL ↔ ReactFlow 双向转换策略

**DSL → ReactFlow（加载时）：**

```
节点分两类处理：

普通节点（无子节点语义）：
  RuleGo node → ReactFlow node（id, type=blockType, data={name, configuration}）
  RuleGo connection → ReactFlow edge（id, source, target, label=type）

含子节点的节点（for / switch / groupAction / fork）：
  父节点本身 → ReactFlow node（type=rulego_for 等，含 style.height）
  通过 connections 找到属于该节点子链的节点 →
    设置 parentId = 父节点 id，position = 局部坐标（dagre 子图布局）
  分支标签（Do/Case1/Failure 等）→ edge label
```

join 多入边：直接映射为多条 ReactFlow edges 指向同一 target，无特殊处理。

有向环（回边）：正常映射为 edge，ReactFlow 不禁止环。

**ReactFlow → DSL（保存时）：**

```
ReactFlow nodes（过滤掉 parentId 非空的子节点，它们已被父节点 data 记录）：
  → metadata.nodes[]（id, type=nodeType, name, configuration）

ReactFlow edges：
  → metadata.connections[]（fromId, toId, type=edge.label）

含子节点的父节点：
  → 遍历其 children（parentId == 父节点id 的节点）重建 do/case 子链关系
  → configuration.do / nodeIds 等字段从子节点 id 推断
```

**位置持久化：** 用户拖动后将 `node.position` 写入 `node.meta.position`，随 DSL 一起保存（现有 DSL meta 字段已有预留）。

---

### D4：BlockConfigModal 数据源适配

现有 `BlockConfigModal` 的 `useEffect` 通过 `block.getFieldValue(fieldName)` 读字段，`handleSubmit` 通过 `block.setFieldValue` 写回。

**适配方案：** 将 `BlockConfigModal` 的 props 接口扩展为双模式：

```typescript
type BlockConfigModalProps =
  | { mode: 'blockly'; blockId: string; workspaceRef: Ref<WorkspaceSvg> }
  | { mode: 'reactflow'; nodeId: string; nodeType: string; nodeData: NodeData; onDataChange: (data: NodeData) => void }
```

`mode: 'reactflow'` 时：
- `useEffect` 从 `nodeData.configuration` 读字段（key 对照 `BlockTypeDef.getConfiguration` 的输出 key）
- `handleSubmit` 调用 `onDataChange({ configuration: {...} })`，ReactFlow 侧 `updateNodeData` 写回

两种 mode 共享同一套表单 JSX，避免重复维护。

---

### D5：BlockLibraryPanel 拖拽适配

现有拖拽：`e.dataTransfer.setData(DRAG_TYPE_BLOCK, blockType)` → Blockly `onDrop`

新增路径：ReactFlow 编辑器页面的 `<ReactFlow onDrop>` handler：
```typescript
const blockType = e.dataTransfer.getData(DRAG_TYPE_BLOCK)
const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
addNode({ id: nanoid(), type: blockType, position, data: defaultDataFor(blockType) })
```

`BlockLibraryPanel` 本身无需改动（`setData` 保持不变）。

---

### D6：dagre 初始布局策略

加载 DSL 后，若节点无已保存的 `meta.position`，用 dagre 计算初始布局：

```
方向：TB（从上到下）
节点尺寸：普通节点 240×80，含子画布节点 按子节点数量动态计算高度
rankSep：80，nodeSep：40
含子节点的父节点作为 dagre 图中单个节点处理（整体布局），
子节点在父节点内部单独运行一次子图 dagre 布局
```

已保存 `meta.position` 的节点直接使用保存值，跳过 dagre 计算。

## Risks / Trade-offs

**[风险 1] BlockConfigModal 字段映射不完整**
→ `getConfiguration` 输出 key 与 Blockly 字段名不完全一致（如 `TLS_ENDPOINT` vs `endpoint`）。
→ 缓解：在适配层写单元测试，逐类型验证 configuration → form state 的双向映射。

**[风险 2] 含子节点的父节点保存时子链重建复杂**
→ 从 ReactFlow nodes/edges 还原 for.do、switch.cases 中的 then 标签等需要精确匹配 edge label。
→ 缓解：约定 edge label = RuleGo connection.type，双向转换用同一常量集。

**[风险 3] 大型规则链（50+ 节点）性能**
→ ReactFlow 默认全量渲染，节点多时帧率下降。
→ 缓解：开启 `nodesFocusable={false}`，延迟开启 `fitView`；必要时启用虚拟化（ReactFlow Pro 或手动实现，暂不处理）。

**[风险 4] parentId 子节点的 dagre 布局与父节点大小协调**
→ 父节点高度需要在 dagre 运行前预估（子节点数量 × 行高 + padding），可能不精确。
→ 缓解：先用估算值布局，用户可手动拖拽调整，位置持久化后不再重算。

**[取舍] 现有 Scratch 编辑器并存**
→ 两套编辑器共享同一份 DSL，理论上互相兼容；实际切换时需确保 DSL 已保存，避免未保存状态丢失。
→ 缓解：切换编辑器前强制提示保存。

## Migration Plan

1. 新增 ReactFlow 依赖（`@xyflow/react`、`dagre`、`@types/dagre`）到 `frontend/package.json`
2. 新增 `frontend/src/modules/rulego/reactflow/` 目录，实现转换层和节点组件
3. 扩展 `BlockConfigModal` 为双模式（`blockly` | `reactflow`），保持向后兼容
4. 新建 `RuleGoReactFlowEditorPage.tsx`，集成所有子模块
5. 在路由层新增入口（如 `/rulego/:id/edit-flow`），现有 `/rulego/:id/edit` 保持不变
6. 在规则链编辑页顶部提供"切换编辑器"按钮，两者共享同一 DSL 保存接口

**回滚：** ReactFlow 编辑器为独立路由，随时可从路由层移除，不影响现有 Scratch 编辑器。

## Open Questions

- **Q1：** switch 节点在子画布模式下，Case 分支的边标签（Case1/Case2 等）如何与 `cases[].then` 字段对齐？是用 edge label 还是 edge data 中存储额外字段？
- **Q2：** groupAction 的 `nodeIds` 在 ReactFlow 中映射为 parentId 子节点，但 RuleGo 中这些子节点也可以被其他节点连接（共享）。如果存在跨 groupAction 的共享子节点，转换时如何处理？（当前决定：检测到共享时，子节点不设 parentId，退化为普通节点，用 edge 连接）
- **Q3：** 规则链 DSL 的 `meta` 字段目前是否用于其他用途？写入 `meta.position` 是否有冲突风险？
