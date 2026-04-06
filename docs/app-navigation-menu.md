# DevPilot 主导航菜单说明

侧栏菜单定义于 `frontend/src/shared/components/Layout/Layout.tsx`。进入 **规则链可视化编辑器**（`/rulego/editor`）时侧栏会隐藏以全屏编辑。下表为各菜单项的**功能描述**与**使用说明**。

---

## 无分组

| 菜单 | 路由 | 功能描述 | 使用说明 |
|------|------|----------|----------|
| **聊天** | `/agent` | 与已配置的 Agent 对话，可选择模型与 Agent，支持工作室场景下的多 Agent 协作入口。 | 默认首页（`/` 会重定向至此）。在顶栏切换 Agent、模型；需先在「模型管理」配置模型，在「Agent 管理」创建 Agent。 |
| **工作室** | `/studios` | 管理「工作室」列表；每个工作室绑定一个主 Agent，进入后可使用像素风工作台界面。 | 创建工作室时需选择主 Agent；进入 `/studios/:studioId` 为具体工作室工作区。 |

---

## 控制

| 菜单 | 路由 | 功能描述 | 使用说明 |
|------|------|----------|----------|
| **重构路由管理** | `/route-rewrite` | 维护「接口路径 → 重构目标」类路由映射，供重构场景下统一查看与修改。 | 在表格中增删改路由规则；路由须以 `/` 开头。具体业务含义以项目约定为准。 |
| **接口对比** | `/curl-compare` | 对两个 HTTP 接口发起请求并对比响应（含 JSON 差异），用于联调与回归。 | 填写两侧 URL（支持历史记录）、请求方法与 Body；执行「对比」查看结果与差异项。 |
| **终端** | `/terminal` | 占位页，功能建设中。 | 当前为占位提示，后续版本可能接入终端能力。 |

---

## 规则引擎

| 菜单 | 路由 | 功能描述 | 使用说明 |
|------|------|----------|----------|
| **规则管理** | `/rulego` | 规则链（RuleGo）列表：新建/编辑/删除、启用与停用、导入导出 DSL、加载到引擎、从规则生成技能等。 | 点击「编辑」或新建进入 **规则链可视化编辑器**（`/rulego/editor` 或 `/rulego/editor/:id`，侧栏隐藏）。筛选主链/子链、启用状态；关注「引擎已加载」状态以确认可执行。 |
| **执行规则** | `/rulego/execute` | 选择已保存的规则链，填写请求参数（message_type、metadata、data），**异步执行**并展示节点级进度与日志。 | 选规则后启动执行，通过返回的 `execution_id` 轮询节点状态；适合长耗时链（如含 LLM、Cursor）。 |
| **执行日志** | `/rulego/logs` | 分页查看历史执行记录，支持删除；可进入单条详情。 | 定期自动刷新列表；点击一条进入 `/rulego/logs/:id` 查看节点入参/出参与错误信息。 |

### 侧栏未列出但相关的路由

| 页面 | 路由 | 功能描述 | 使用说明 |
|------|------|----------|----------|
| **规则链可视化编辑器** | `/rulego/editor`、`/rulego/editor/:id` | Blockly 画布编辑 RuleGo DSL，支持测试执行、Agent 规划、块配置等。 | 从「规则管理」进入；保存后返回列表。详见 [rulego-nodes-reference.md](./rulego-nodes-reference.md) 与 [rulego-service-operation.md](./rulego-service-operation.md)。 |
| **执行日志详情** | `/rulego/logs/:id` | 单条执行的完整节点步骤与载荷。 | 从「执行日志」列表点击进入。 |

---

## 设置

| 菜单 | 路由 | 功能描述 | 使用说明 |
|------|------|----------|----------|
| **技能仓库** | `/skill-repo` | 浏览、上传（ZIP）技能包，查看包内文件内容；与 `~/.devpilot/skills/` 及嵌入的 initSkills 协同。 | 上传 ZIP 导入技能；删除包前确认无依赖。`ai/llm` 节点与「列出可用技能」依赖本地技能目录。 |
| **Agent 管理** | `/settings/agents` | 创建/编辑/删除 Agent：模型、系统提示、勾选技能与 MCP、工作区只读、子 Agent 树等。 | 须至少保留一个 **main** 类型 Agent；主 Agent 默认加载全部已启用 MCP。聊天页顶栏切换的 Agent 列表来源于此。 |
| **MCP 配置** | `/settings/mcp` | 维护全局 MCP 服务列表（命令、URL、环境变量、启用状态、工具过滤），持久化到 `~/.devpilot/mcp.json`。 | 保存后生效；主 Agent 自动连接所有已启用项，其他 Agent 在 Agent 管理中勾选子集。 |
| **模型管理** | `/settings/models` | 管理多组大模型接入（Base URL、API Key、模型列表等），供聊天、Agent、规则链执行时匹配使用。 | 新增至少一条配置后，方可创建 Agent。规则链执行时可用模型管理中的 Key **覆盖** DSL 里 `ai/llm` 节点的 `key`（与后端 `PatchDefinitionWithLLMKeys` 行为一致）。 |
| **工作区** | `/settings/workspaces` | 多项目工作区：创建/删除工作区、向工作区添加磁盘路径、校验与健康检查。 | 供 `cursor/acp_agent*` 等节点的 `workspaceId` 解析根目录；与聊天里「项目根」概念配合使用，避免路径不一致。 |

---

## 与文档的对应关系

- 规则链存储、执行、日志、Wails API：[rulego-service-operation.md](./rulego-service-operation.md)
- 节点类型与 DevPilot 自定义节点字段：[rulego-nodes-reference.md](./rulego-nodes-reference.md)

---

*菜单与路由以当前 `App.tsx` 为准；若增加新路由，请同步更新本文档与 `Layout.tsx`。*
