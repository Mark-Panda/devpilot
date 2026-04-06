# DevPilot RuleGo 服务操作说明书

本文档依据 `backend/internal/services/rulego/`、`backend/runtime.go` 与前端 `frontend/src/modules/rulego/useRuleGoApi.ts` 中的实际行为编写，描述桌面应用内规则链（RuleGo）的存储、加载、执行与相关能力。

## 应用菜单与页面入口

侧栏中与规则相关的菜单为：**规则管理**（列表与进入编辑器）、**执行规则**（异步执行与节点进度）、**执行日志**（历史与详情）。依赖能力多在 **设置** 中：**模型管理**（覆盖 `ai/llm` 密钥）、**工作区**（`workspaceId` 解析）、**技能仓库** / **Agent 管理**（技能与 MCP）。

各菜单的**功能说明**与**使用方式**（含聊天、工作室、控制、设置等）见独立文档：[app-navigation-menu.md](./app-navigation-menu.md)。

## 1. 架构与入口

- **形态**：DevPilot 为 Wails 桌面应用，Go 后端通过 `main.go` 的 `Bind` 将 `rulego.Service` 暴露给前端，**无独立 HTTP RuleGo API**（规则链操作为 IPC，非 Gin）。
- **服务构造**：`backend.InitRuntime` 中创建 `RuleStore`（文件）、`ExecutionLogStore`（Pebble）、并注入 `LLMConfigLister`（来自模型管理），用于执行前覆盖 `ai/llm` 节点的 API Key（见下文「模型管理」）。
- **数据目录**：应用数据根目录默认为用户主目录下的 `~/.devpilot`（见 `main.go` 与 `runtime.go`）。

## 2. 规则链持久化

- **存储位置**：`~/.devpilot/rulego/` 下每条规则一个 `{uuid}.json` 文件，文件内容为**完整 RuleGo DSL JSON**（`ruleChain` + `metadata` 等），见 `backend/internal/store/rulegofile/store.go`。
- **兼容迁移**：启动时可能从 Pebble 将历史规则迁移到上述目录（失败仅打日志，不阻塞启动）。
- **创建/更新**：`CreateRuleGoRule` / `UpdateRuleGoRule` 接受 `definition` 字符串；服务端会做 ID 对齐、规范化与校验；保存成功后若规则为启用状态会尝试 `LoadRuleChain` 加载到引擎池；**加载失败时持久化仍成功**，仅影响运行池（日志中会说明）。

## 3. 引擎池与启动行为

- **启动**：`LoadAllEnabledRuleChains` 在运行时初始化后执行，为所有**已启用**且定义非空的规则创建引擎实例；单条失败会记录日志并可能返回首次错误，但不阻止应用启动。
- **池中状态**：`EngineLoadedInPool(ruleID)` 表示该 ID 是否已在 RuleGo 全局池中且已初始化；列表接口会在规则对象上填充 `engine_loaded` 供前端展示。
- **手动加载/卸载**：`LoadRuleChain`（仅已启用）、`UnloadRuleChain` 供前端或调试使用；`LoadRuleChainAllowDisabled` 用于「先校验加载再写启用」类流程（不检查 `disabled`）。

## 4. 执行方式与入参

### 4.1 同步执行 `ExecuteRule`

- **入参** `ExecuteRuleInput`：`message_type`（默认 `default`）、`metadata`（字符串键值）、`data`（通常 JSON 字符串；空则按 `{}`）。
- **出参** `ExecuteRuleOutput`：`success`、`data`（末端节点产出）、`error`、`elapsed`（毫秒）、`execution_id`（有执行日志时）。
- **行为**：若规则已在池中则 `ReloadSelf` 使用最新定义（含 LLM Key 补丁）；否则临时 `rulego.New` 执行后释放。执行结束会写执行日志（若配置了 `execLogStore`）。
- **注入元数据**：执行时在 metadata 中写入 `_rule_id`、`_rule_name`；若有执行日志则还有 `_execution_id`，供节点或日志关联使用。

### 4.2 异步执行 `StartExecuteRule`

- 创建执行日志后立即返回 `execution_id`，在后台 goroutine 中跑完整条链；适用于前端轮询 `GetExecutionLog` 查看节点级进度。
- **前提**：`execLogStore` 非空；否则返回错误「执行日志不可用」。

### 4.3 画布测试 `ExecuteRuleDefinition`

- 使用**当前编辑中的 DSL 字符串**执行一次，**不写规则库**；用于可视化编辑器「测试」。
- 规则 ID 在内部固定为 `_test_`，触发类型记为 `test`。
- 长耗时链（含 `ai/llm` 多轮 tool）可能阻塞较久，调用方需避免超时断开。

### 4.4 校验 `ValidateRuleDefinition`

- 仅校验 JSON 能否被 RuleGo 加载，**不执行**；可用于保存前预检（若前端接入）。

## 5. 执行日志

- **存储**：Pebble（`ExecutionLogStore`），与规则文件存储分离。
- **接口**：`ListExecutionLogs(limit, offset)`（`limit` 默认 20、最大 100）、`GetExecutionLog(execution_id)`（含节点步骤）、`DeleteExecutionLog`。
- **用途**：异步执行进度、节点入参/出参审计、失败排查。

## 6. 模型管理与 `ai/llm` 节点

- **覆盖逻辑**：当运行时注入了 `LLMConfigLister`（来自模型管理）时，`PatchDefinitionWithLLMKeys` 会按各 `ai/llm` 节点的 `configuration.url`（或默认）与 `model` 匹配模型管理中的条目，**用管理中的 API Key 覆盖节点里存储的 `key`**，使执行与「从规则链生成技能」使用同一套凭证。
- **未匹配**：若列表为空或匹配失败，则使用 DSL 内原有 `key`（若节点初始化仍要求有效 key，则可能报错）。

## 7. 技能与规则链

- **`ListAvailableSkills`**：枚举 `~/.devpilot/skills/` 下技能（供 `ai/llm` 勾选 `enabled_skill_names` 等）。
- **`GenerateSkillFromRuleChain`**：用内置 `skill-creator` 技能 + 用户配置的模型调用，为主规则链生成 `SKILL.md` 并写入技能目录；**子规则链**与**未启用**规则不支持。
- **`DeleteSkillForRuleChain`**：在规则变为子链、关闭等场景下清理关联技能目录（由更新/删除逻辑内部调用）。

## 8. Agent 规划 `GenerateRuleGoPlan`

- 根据自然语言与当前 DSL、`node_types`、已启用子规则链摘要等，调用大模型生成**节点+连线计划**（JSON），供前端预览与应用到画布。
- 若未传 `base_url` / `api_key` / `model`，则尝试从模型管理读取第一条完整配置。

## 9. 与聊天/技能的衔接

- `backend/rulechain_executor.go` 将 `llm.RuleChainExecutor` 设为对 `ExecuteRule` 的包装：带 `rule_chain_id` 的技能被调用时，以用户输入作为 `data` 执行对应规则链。

## 10. 常见运维要点

- **规则保存成功但「未加载」**：查看日志中 `LoadRuleChain` 错误；多为 DSL 非法、节点配置缺失（如密钥）、或依赖环境未就绪。
- **Cursor 类节点**：需本机已安装 Cursor CLI、`agent` 命令可用；工作目录通过 `workDir` 模板、`metadata.cursor_acp_cwd` 或 `api_route_tracer_service_path` 解析（见节点说明书）。
- **Go 版本**：与 `go.mod` 一致，当前为 Go 1.26（`toolchain go1.26.1`；见仓库 `CLAUDE.md`）。

## 11. 前端可调用的服务方法（Wails）

与 `useRuleGoApi.ts` 及生成绑定一致的主要方法包括：

| 方法 | 说明 |
|------|------|
| `ListRuleGoRules` / `GetRuleGoRule` / `CreateRuleGoRule` / `UpdateRuleGoRule` / `DeleteRuleGoRule` | 规则 CRUD |
| `ExecuteRule` / `StartExecuteRule` / `ExecuteRuleDefinition` | 同步/异步/测试执行 |
| `LoadRuleChain` / `UnloadRuleChain` | 引擎池加载与卸载 |
| `ListExecutionLogs` / `GetExecutionLog` / `DeleteExecutionLog` | 执行日志 |
| `ListAvailableSkills` | 可勾选技能列表 |
| `GenerateSkillFromRuleChain` / `DeleteSkillForRuleChain` | 技能生成与清理 |
| `GenerateRuleGoPlan` | Agent 规划 |

（`ValidateRuleDefinition`、`LoadRuleChainAllowDisabled`、`LoadAllEnabledRuleChains` 等以后端/启动场景为主，未必全部绑定到 UI。）

---

更完整的节点级字段说明见同目录 [rulego-nodes-reference.md](./rulego-nodes-reference.md)。
