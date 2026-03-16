# DevPilot Desktop

## 概览

Wails + Go 后端 + React 前端。项目架构参考根目录的 devpilot-architecture.md。

## 常用命令

- 开发：`make dev`
- 构建：`make build`
- 测试：`make test`
- Lint：`make lint`

## 目录结构

- `/frontend`：React 18 + Vite UI
- `/backend`：Go 服务、Gin Server、存储层
- `/docs`：架构与 API 文档

## 开发规范

- 遵循架构文档中约定的模块划分与文件命名。
- Go 结构体添加 `json` tag；前端接口字段使用 snake_case。
- IPC 走 Wails，HTTP 走内置 Gin Server。
- 避免未被需求驱动的抽象与“顺手重构”。

## RuleGo 可视化组件块（frontend/src/modules/rulego）

- **块定义**：每个组件块在 `rulego-blocks/blocks/*.ts` 中实现一个 `BlockTypeDef`，包含 `blockType`、`nodeType`、`category`，以及 `register`、`getConfiguration`、`setConfiguration`、`getConnectionBranches`、`getInputNameForConnectionType`（可选）、`getWalkInputs`、`defaultConnectionType`（可选）。块统一带 NODE_ID、NODE_NAME、DEBUG；配置区放 CONFIG 并隐藏。
- **注册与工具箱**：在 `rulego-blocks/index.ts` 中 import 各块并填入 `toolbox` 对应分类；新增块需同时在该文件的 toolbox.contents 和 `BlockLibraryPanel.tsx` 的 BLOCK_LABELS 中登记。
- **DSL 双向**：块→DSL 由 `buildRuleGoDsl` 通过 `walkChain` 与各 def 的 `getConfiguration`/`getConnectionBranches` 收集 nodes/connections；DSL→块由 `loadWorkspaceFromRuleGoDsl` 调用 `createBlockForNode`（含 setConfiguration）再按 connections 与 for/groupAction 特殊逻辑连线。
- **块配置 UI**：`RuleGoScratchEditorPage.tsx` 内 `BlockConfigModal` 按 `block.type` 分支读写表单；新增可配置块时需在该模态的 useEffect（同步 form）和 handleSubmit（写回块）中增加对应字段。
- **动态形状**：多分支/多槽位块（如 switch、groupAction）使用 Blockly mutation（mutationToDom/domToMutation）和 `updateShape_` 动态增删 statementInput；序列化/反序列化依赖这些方法。
- **后端已注册节点**：后端 RuleGo 引擎中可用的 `node.type` 列表见 `.cursor/rules/rulego-backend-nodes.mdc`（由 `make rulego-rules` 根据当前注册节点生成）；前端块 `nodeType` 需与后端注册类型一致。
- 详细约定见 `.cursor/rules/rulego-blocks.mdc`（在编辑 rulego 相关文件时自动生效）。
