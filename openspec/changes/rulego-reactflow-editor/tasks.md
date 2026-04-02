## 1. 依赖安装与工程准备

- [x] 1.1 安装 `@xyflow/react`、`dagre`、`@types/dagre` 到 `frontend/package.json`
- [x] 1.2 在 `frontend/src/modules/rulego/` 下创建 `reactflow/` 子目录结构（converter/、nodes/、edges/）
- [x] 1.3 确认现有 `BlockTypeDef.getConfiguration` 各节点的输出 key 与 DSL configuration 字段一致，整理成对照表（为 T4 铺路）

## 2. DSL ↔ ReactFlow 转换层

- [x] 2.1 实现 `dslToReactFlow(dsl)`：普通节点 `metadata.nodes[]` → ReactFlow `nodes[]`，`metadata.connections[]` → ReactFlow `edges[]`（含 join 多入边、有向环）
- [x] 2.2 实现 `applyDagreLayout(nodes, edges)`：对无 `meta.position` 的节点运行 dagre TB 布局，返回带 position 的 nodes
- [x] 2.3 实现 `reactFlowToDsl(nodes, edges)`：ReactFlow nodes/edges → `metadata.nodes[]` + `metadata.connections[]`，含 `meta.position` 写回
- [x] 2.4 实现 `blockTypeToNodeType` / `nodeTypeToBlockType` 复用现有 registry（`getBlockTypeFromNodeType` / `getNodeType`）
- [x] 2.5 为转换层编写单元测试：线性链、join 多入边、有向环、带 parentId 子节点三种场景各一个

## 3. 节点卡片组件

- [x] 3.1 实现 `RuleGoNodeCard` 基础组件：圆角卡片、分类色彩顶部条、节点名称/ID 显示，Tailwind 样式
- [x] 3.2 添加节点选中高亮状态（蓝色边框）
- [x] 3.3 实现各分类的图标映射（触发器/动作/条件/数据处理/流程控制/数据库/文件/追踪/RPA）
- [x] 3.4 实现动态端口渲染：普通节点固定 input（顶）+ output（底），分支节点根据 `getConnectionBranches` 动态渲染多输出端口并显示标签
- [x] 3.5 注册所有 30+ 种 blockType 为 ReactFlow 自定义节点类型（`nodeTypes` map）

## 4. 分支/容器节点

- [x] 4.1 实现 for 节点容器：展开/折叠按钮，子节点 `parentId` 嵌套，折叠时 `hidden: true` + 父节点收缩高度
- [x] 4.2 实现 switch 节点动态端口：configuration.cases 变更时同步更新输出端口数量和标签
- [x] 4.3 实现 fork 节点容器：N 条并行分支子链横向排列，各子链以 parentId 关联
- [x] 4.4 实现 groupAction 节点容器：nodeIds 子节点嵌套（共享子节点检测 → 退化为普通边）
- [x] 4.5 实现 `dslToReactFlow` 对含子节点类型的特殊处理（设置 parentId，计算局部坐标的子图 dagre 布局）

## 5. 节点配置弹窗适配

- [x] 5.1 扩展 `BlockConfigModalProps` 为联合类型，新增 `mode: 'reactflow'`、`nodeId`、`nodeType`、`nodeData`、`onDataChange` 字段
- [x] 5.2 改造 `useEffect`（读取字段）：`mode === 'reactflow'` 时从 `nodeData.configuration` 按 key 读取各节点类型的字段值
- [x] 5.3 改造 `handleSubmit`（写回字段）：`mode === 'reactflow'` 时调用 `onDataChange({ name, configuration })`
- [x] 5.4 验证 `mode === 'blockly'` 路径行为完全不变（回归测试现有 Scratch 编辑器）
- [x] 5.5 处理 switch cases 特殊逻辑：reactflow 模式下修改 cases 数量时同步触发 ReactFlow 节点端口更新

## 6. BlockLibraryPanel 拖拽适配

- [x] 6.1 在 `RuleGoReactFlowEditorPage` 的 ReactFlow `<ReactFlow onDrop>` 中读取 `DRAG_TYPE_BLOCK` 数据，调用 `addNodes` 添加新节点
- [x] 6.2 实现 `defaultDataFor(blockType)`：为每种节点类型生成默认 `data.configuration` 对象（基于各 `BlockTypeDef.getConfiguration` 的默认值）
- [x] 6.3 验证 `BlockLibraryPanel` 自身无需改动（`setData(DRAG_TYPE_BLOCK, blockType)` 保持不变）

## 7. 编辑器页面组装

- [x] 7.1 创建 `RuleGoReactFlowEditorPage.tsx`：整合 ReactFlow 画布、`BlockLibraryPanel`、节点配置面板、顶部工具栏（保存/测试/切换编辑器按钮）
- [x] 7.2 接入现有 `useRuleGoRules` 加载规则链，加载后执行 DSL → ReactFlow 转换 + dagre 布局
- [x] 7.3 实现保存逻辑：ReactFlow → DSL 转换后调用现有 `saveRule`/`updateRule` 接口
- [x] 7.4 实现"切换到积木编辑器"：有未保存修改时弹出确认提示
- [x] 7.5 在路由层新增 `/rulego/flow/:id` 路由指向 `RuleGoReactFlowEditorPage`

## 8. 联调与验收

- [ ] 8.1 用现有线上规则链（含 join / switch / for 节点）做 DSL 加载 → 画布显示 → 保存 → 重新加载的完整回环测试（运行时验证）
- [ ] 8.2 验证 join 多入边在画布上正确渲染多条入边连线（运行时验证）
- [ ] 8.3 验证 for / switch / fork / groupAction 子画布展开/折叠功能（运行时验证）
- [ ] 8.4 验证节点配置弹窗在 reactflow 模式下各类型节点的字段读写正确（运行时验证）
- [ ] 8.5 验证 Scratch 编辑器配置弹窗行为无回归（blockly 模式）（运行时验证）
