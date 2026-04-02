## ADDED Requirements

### Requirement: DSL 到 ReactFlow 的无损转换（加载）
转换函数 `dslToReactFlow(dsl)` SHALL 将 RuleGo DSL 的 `metadata.nodes[]` 和 `metadata.connections[]` 无损转换为 ReactFlow 的 `nodes[]` 和 `edges[]`，不丢失任何节点或连接信息。

#### Scenario: 普通线性规则链转换
- **WHEN** DSL 包含 3 个串行节点（A→B→C）
- **THEN** 转换结果为 3 个 ReactFlow nodes 和 2 条 edges，edge label = connection.type（如 `Success`）

#### Scenario: join 多入边转换
- **WHEN** DSL 中 A、B、C 三个节点均有 connection 指向 join 节点
- **THEN** 转换结果中 join 节点对应 3 条入边的 ReactFlow edges，ReactFlow 节点数和边数与 DSL 完全一致

#### Scenario: 有向环转换
- **WHEN** DSL 中存在 A→B→A 的回边
- **THEN** 转换结果中包含两条方向相反的 edges，ReactFlow 画布正常渲染（无报错）

#### Scenario: 节点位置恢复
- **WHEN** DSL 节点的 `meta.position` 字段存在 `{ x, y }` 值
- **THEN** 对应 ReactFlow node 的 `position` 使用该值，不运行 dagre 布局

### Requirement: ReactFlow 到 DSL 的无损转换（保存）
转换函数 `reactFlowToDsl(nodes, edges)` SHALL 将 ReactFlow 的 nodes/edges 还原为 RuleGo DSL 格式，数据与原始 DSL 在语义上等价。

#### Scenario: 保存后重新加载
- **WHEN** 用户编辑规则链并保存，随后重新打开该规则链
- **THEN** 画布节点和连线与保存前完全一致，配置信息无损

#### Scenario: 子节点（parentId）还原为 DSL 连接
- **WHEN** ReactFlow 中 for 节点有 parentId 子节点
- **THEN** 保存的 DSL 中 for.configuration.do 正确指向 Do 链首节点 id，connections 中包含 Do 类型连接

#### Scenario: 节点位置写入 meta
- **WHEN** 用户拖动节点后保存
- **THEN** 保存的 DSL 中对应节点 `meta.position` = `{ x: <新x>, y: <新y> }`

### Requirement: blockType 与 nodeType 双向映射
转换层 SHALL 使用现有 `BlockTypeDef` 的 `blockType`（如 `rulego_jsFilter`）与 `nodeType`（如 `jsFilter`）完成类型映射，不重复定义映射表。

#### Scenario: DSL node.type 转为 ReactFlow node.type
- **WHEN** DSL 节点 type = `jsFilter`
- **THEN** ReactFlow node type = `rulego_jsFilter`（通过 `getBlockTypeFromNodeType` 查找）

#### Scenario: ReactFlow node.type 转为 DSL node.type
- **WHEN** ReactFlow node type = `rulego_jsFilter`
- **THEN** DSL 节点 type = `jsFilter`（通过 `getNodeType` 查找）
