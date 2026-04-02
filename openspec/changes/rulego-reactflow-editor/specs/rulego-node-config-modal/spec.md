## MODIFIED Requirements

### Requirement: 节点配置弹窗双模式数据接口
`BlockConfigModal` SHALL 支持两种数据模式：`blockly`（现有 Blockly Block 对象读写）和 `reactflow`（从 `node.data.configuration` 对象读写）。两种模式共享同一套表单 JSX，行为对用户完全一致。

#### Scenario: reactflow 模式打开配置弹窗
- **WHEN** ReactFlow 编辑器中用户点击节点，系统以 `mode: 'reactflow'` 打开配置弹窗
- **THEN** 弹窗表单字段从 `nodeData.configuration` 加载，字段值与 DSL 中该节点的 configuration 一致

#### Scenario: reactflow 模式保存配置
- **WHEN** 用户在 reactflow 模式弹窗中修改字段并点击保存
- **THEN** `onDataChange` 回调被调用，参数为更新后的 `{ name, configuration }`，ReactFlow 节点的 `data` 同步更新

#### Scenario: blockly 模式行为不变（向后兼容）
- **WHEN** Scratch 编辑器中用户点击节点，系统以 `mode: 'blockly'` 打开配置弹窗
- **THEN** 弹窗行为与改造前完全一致，通过 `block.getFieldValue` / `block.setFieldValue` 读写

### Requirement: configuration key 与表单字段的对齐
`reactflow` 模式下，弹窗 useEffect 读取字段时 SHALL 使用与各 `BlockTypeDef.getConfiguration` 输出一致的 key 名称，`handleSubmit` 时按同样 key 结构写回 `configuration`。

#### Scenario: volcTls 节点字段对齐
- **WHEN** reactflow 模式打开 `rulego_volcTlsSearchLogs` 节点配置
- **THEN** 表单中 endpoint 字段从 `configuration.endpoint` 读取，accessKey 从 `configuration.accessKey` 读取，与 `getConfiguration` 输出 key 一致

#### Scenario: switch 节点 cases 字段对齐
- **WHEN** reactflow 模式打开 `rulego_switch` 节点配置
- **THEN** cases 数组从 `configuration.cases` 读取，修改后写回 `configuration.cases`，格式与 DSL 中存储格式完全一致
