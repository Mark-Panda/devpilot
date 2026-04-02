## ADDED Requirements

### Requirement: ReactFlow 画布初始化
编辑器页面 SHALL 初始化一个 ReactFlow 画布，提供节点拖拽、画布平移/缩放、框选等基础交互能力。画布背景 SHALL 显示点状网格。

#### Scenario: 进入编辑器页面
- **WHEN** 用户打开规则链 ReactFlow 编辑器页面
- **THEN** 页面渲染 ReactFlow 画布，展示现有规则链的节点和连线，画布自动适应内容区域（fitView）

#### Scenario: 画布平移与缩放
- **WHEN** 用户在画布空白区域拖拽或使用滚轮
- **THEN** 画布平移或缩放，节点相对位置不变

### Requirement: dagre 初始自动布局
加载规则链时，若节点无已保存的位置信息，系统 SHALL 使用 dagre 以从上到下（TB 方向）计算初始节点位置，rankSep=80，nodeSep=40。

#### Scenario: 首次加载无位置信息的规则链
- **WHEN** 规则链 DSL 中节点的 `meta.position` 为空
- **THEN** dagre 自动计算布局，节点从上到下层级排列，无节点重叠

#### Scenario: 加载有已保存位置的规则链
- **WHEN** 规则链 DSL 中节点的 `meta.position` 已有值
- **THEN** 直接使用保存的位置，跳过 dagre 计算，保持用户上次调整的布局

### Requirement: 节点位置持久化
用户拖动节点后，新位置 SHALL 写入该节点的 `meta.position`，并随规则链 DSL 一同保存到后端。

#### Scenario: 拖动节点后保存
- **WHEN** 用户拖动节点到新位置后点击保存
- **THEN** 保存的 DSL 中对应节点 `meta.position` 更新为新坐标

### Requirement: 编辑器与 Scratch 编辑器并存切换
ReactFlow 编辑器 SHALL 作为独立路由存在，用户可在编辑器顶部切换回 Scratch 编辑器，切换前系统 SHALL 提示保存未保存的修改。

#### Scenario: 切换到 Scratch 编辑器（有未保存修改）
- **WHEN** 用户点击"切换到积木编辑器"且当前有未保存修改
- **THEN** 系统弹出确认提示，用户确认后跳转，未保存修改丢失

#### Scenario: 切换到 Scratch 编辑器（无未保存修改）
- **WHEN** 用户点击"切换到积木编辑器"且无未保存修改
- **THEN** 直接跳转到 Scratch 编辑器页面，DSL 内容不变
