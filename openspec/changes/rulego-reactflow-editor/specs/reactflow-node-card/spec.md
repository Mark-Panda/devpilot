## ADDED Requirements

### Requirement: 节点卡片基础样式
每个 RuleGo 节点 SHALL 渲染为圆角卡片（`RuleGoNodeCard`），宽度 240px，显示节点分类色彩条、节点类型图标、节点名称（`NODE_NAME`）、节点 ID（`NODE_ID`，小字灰色）。卡片顶部颜色条颜色 SHALL 与 `BlockLibraryPanel` 的分类颜色一致。

#### Scenario: 普通动作节点渲染
- **WHEN** 画布上存在一个 `rulego_restApiCall` 类型节点
- **THEN** 卡片显示蓝色顶部色条、HTTP 图标、节点名称，卡片尺寸为 240×80px

#### Scenario: 触发器节点渲染
- **WHEN** 画布上存在一个 `rulego_startTrigger` 类型节点
- **THEN** 卡片显示红色顶部色条和"开始"图标，与其他节点视觉区分明确

### Requirement: 节点选中与高亮状态
节点被选中时，卡片 SHALL 显示高亮边框（蓝色 `2px solid`），未选中时边框为淡灰色。

#### Scenario: 点击节点选中
- **WHEN** 用户点击画布上一个节点卡片
- **THEN** 该节点卡片显示蓝色高亮边框，其他节点边框恢复灰色

### Requirement: 点击节点打开配置面板
用户点击节点卡片时，系统 SHALL 在右侧弹出节点配置面板（复用现有配置弹窗表单逻辑），展示该节点的配置字段。

#### Scenario: 点击节点
- **WHEN** 用户点击一个节点卡片
- **THEN** 右侧出现节点配置面板，面板标题显示节点类型名称，表单字段从 `node.data.configuration` 加载

#### Scenario: 点击画布空白区域关闭配置面板
- **WHEN** 用户点击画布空白区域
- **THEN** 右侧配置面板关闭，节点选中高亮取消

### Requirement: 连线端口显示
每个节点 SHALL 显示输入端口（顶部居中）和输出端口（底部，按分支数量分布），分支节点（switch/for/fork）的输出端口 SHALL 显示分支类型标签（如 `Success`、`Failure`、`Case1`）。

#### Scenario: 普通节点端口
- **WHEN** 渲染一个 `rulego_jsTransform` 节点
- **THEN** 节点顶部显示 1 个输入端口，底部显示 2 个输出端口（Success / Failure）

#### Scenario: switch 节点动态端口
- **WHEN** switch 节点配置了 3 条 case
- **THEN** 底部显示 4 个输出端口（Case1、Case2、Case3、Failure），各端口带标签文字
