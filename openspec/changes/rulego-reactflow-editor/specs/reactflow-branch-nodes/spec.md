## ADDED Requirements

### Requirement: for 循环节点子画布
`rulego_for` 节点 SHALL 渲染为可展开/折叠的容器节点，展开时在节点内部显示循环体子节点（Do 链），子节点使用 ReactFlow `parentId` 机制锁定在容器内（`extent: 'parent'`）。

#### Scenario: for 节点展开状态
- **WHEN** for 节点处于展开状态
- **THEN** 节点内部显示 Do 链中的所有子节点卡片，父节点高度自动撑开以容纳子节点，子节点可在容器内拖动

#### Scenario: for 节点折叠状态
- **WHEN** 用户点击 for 节点上的折叠按钮
- **THEN** 子节点隐藏（`hidden: true`），父节点收缩到固定高度（80px），连入/连出的边仍然可见

#### Scenario: for 节点折叠后重新展开
- **WHEN** 用户点击折叠状态的 for 节点的展开按钮
- **THEN** 子节点恢复显示，父节点高度恢复

### Requirement: switch 节点多分支连线
`rulego_switch` 节点 SHALL 根据 `configuration.cases` 数组动态渲染对应数量的输出端口，每个端口标签为对应 case 的 `then` 值（如 `Case1`、`Case2`），另加一个 `Default` 端口和一个 `Failure` 端口。

#### Scenario: switch 节点 cases 变更后端口更新
- **WHEN** 用户在配置面板中修改 switch 的 cases 数量（如从 2 增加到 3）
- **THEN** switch 节点底部端口数量同步更新为 Case1/Case2/Case3/Default/Failure 共 5 个端口

### Requirement: fork 并行网关子画布
`rulego_fork` 节点 SHALL 渲染为容器节点，各并行分支的子节点以 parentId 嵌套在 fork 容器内，分支间横向排列。

#### Scenario: fork 节点并行分支展示
- **WHEN** fork 节点有 3 条并行分支
- **THEN** fork 容器内横向显示 3 个独立子链区域，各区域第一个节点以 `parentId = fork.id` 关联

### Requirement: groupAction 节点子画布
`rulego_groupAction` 节点 SHALL 渲染为容器节点，`nodeIds` 中引用的各子节点以 parentId 嵌套。若子节点同时被其他路径引用（共享节点），则退化：该子节点不设 parentId，以普通节点 + edge 连线方式表示。

#### Scenario: groupAction 无共享子节点
- **WHEN** groupAction 的所有 nodeIds 子节点仅被该 groupAction 引用
- **THEN** 子节点以 parentId 嵌套在 groupAction 容器内显示

#### Scenario: groupAction 有共享子节点
- **WHEN** groupAction 的某个 nodeId 子节点同时被其他节点连接
- **THEN** 该子节点不设 parentId，作为普通画布节点，从 groupAction 到该节点画一条标注为 `groupAction` 的虚线边
