## Why

当前 RuleGo 可视化编辑器基于 Scratch-Blocks（Blockly SVG 积木）实现，积木拼接的交互范式与业界主流的流程图编辑器风格差距较大，且积木画布无法直观表达节点间的有向连线关系。用户希望将画布替换为现代流程图风格（节点卡片 + 有向连线），同时保留左侧组件库面板和点击节点弹出配置框的交互不变。

由于规则链 DSL 是有向图结构（含 join 多入边、fork 并行网关、有向环等），FlowGram Fixed Layout（树形自动布局）无法无损表达，因此选用 **ReactFlow（@xyflow/react）**作为画布引擎，配合 dagre 实现初始自动布局。

## What Changes

- **新增** `RuleGoReactFlowEditorPage`：基于 ReactFlow 的规则链可视化编辑页，作为现有 Scratch 编辑器的替代入口（路由层切换，两者并存过渡）
- **新增** ReactFlow 节点卡片组件（`RuleGoNodeCard`）：Tailwind 样式，按节点分类（触发器/动作/条件/流程控制等）显示不同颜色和图标，点击触发配置弹窗
- **新增** RuleGo DSL ↔ ReactFlow nodes/edges 双向转换层：平铺有向图 1:1 转换，支持 join 多入边、fork、有向环
- **新增** for 循环 / groupAction / fork 的"子画布"展开/折叠：使用 ReactFlow `parentId` + `NodeResizer` 实现子节点内嵌显示
- **改造** `BlockLibraryPanel` 拖拽投放：从投放到 Blockly 工作区改为 `onDrop` → ReactFlow `addNode()`
- **改造** 节点配置弹窗（`BlockConfigModal`）数据源：从读写 Blockly `Block` 字段改为读写 `node.data.configuration` 对象，与现有 `BlockTypeDef.getConfiguration`/`setConfiguration` 的 key 对齐
- **保留不变**：左侧 `BlockLibraryPanel` UI、节点配置弹窗表单逻辑、RuleGo DSL 格式、后端接口

## Capabilities

### New Capabilities

- `reactflow-canvas`：ReactFlow 画布引擎集成，含初始化、dagre 自动布局、缩放/平移、节点拖拽、连线绘制，以及 DSL 加载/保存的完整生命周期
- `reactflow-node-card`：RuleGo 节点的 ReactFlow 卡片渲染，按分类色彩区分，显示节点名称/类型/摘要信息，支持选中高亮和点击打开配置弹窗
- `reactflow-branch-nodes`：for / switch / groupAction / fork 等含子节点或多分支的特殊节点在 ReactFlow 中的表达方式，含子画布展开/折叠（parentId 机制）和动态端口（多输出边标签）
- `dsl-reactflow-converter`：RuleGo DSL（`metadata.nodes` + `metadata.connections`）与 ReactFlow `nodes[]` + `edges[]` 的双向无损转换，支持 join 多入边、有向环、groupAction 共享子节点

### Modified Capabilities

- `rulego-node-config-modal`：节点配置弹窗的数据接口从 Blockly Block 字段改为 `node.data.configuration` 对象读写（表单逻辑和字段结构不变，仅数据来源改变）

## Impact

**依赖变更**
- 新增：`@xyflow/react`（ReactFlow v12+）、`dagre`（自动布局）、`@types/dagre`
- 无需 `styled-components` / `reflect-metadata`（ReactFlow 无此依赖）

**文件影响**
- 新增：`frontend/src/modules/rulego/RuleGoReactFlowEditorPage.tsx`
- 新增：`frontend/src/modules/rulego/reactflow/`（converter、nodeCard、branchNodes 等子模块）
- 改造：`frontend/src/modules/rulego/RuleGoScratchEditorPage.tsx` 中的 `BlockConfigModal`（数据源适配层）
- 改造：`frontend/src/modules/rulego/BlockLibraryPanel.tsx`（拖拽投放接口扩展，兼容两种编辑器）
- 改造：`frontend/src/App.tsx` 或路由文件（新增 ReactFlow 编辑器路由）

**不影响**
- 后端 RuleGo 引擎、DSL 格式、所有 API 接口
- 现有 Scratch 编辑器（并存，可降级回退）
- `BlockTypeDef` 定义（`getConfiguration`/`setConfiguration` 完全复用）
