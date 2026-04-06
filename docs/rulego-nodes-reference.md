# DevPilot RuleGo 节点使用说明书

本文档说明 DevPilot 后端已注册的 `node.type` 及**本仓库自定义/替换实现**的节点要点。通用控制流、缓存、脚本等节点行为以 [RuleGo 官方文档](https://rulego.cc/) 为准；此处对官方节点仅作索引，对 `backend/internal/services/rulego/node_*.go` 中的实现作详细说明。

**从应用哪里使用**：在侧栏 **规则管理** 进入列表，再进入 **规则链可视化编辑器** 拖拽节点并保存 DSL；**执行规则** / **执行日志** 用于运行与排查。侧栏各菜单的功能与使用说明见 [app-navigation-menu.md](./app-navigation-menu.md)。


**列表来源**：以引擎注册为准，可通过 `make rulego-rules` 更新 `.cursor/rules/rulego-backend-nodes.mdc`。

## 1. 已注册节点总览

当前类型包括但不限于：`ai/llm`、`apiRouteTracer/gitPrepare`、`break`、`cacheDelete`、`cacheGet`、`cacheSet`、`comment`、`cursor/acp`、`cursor/acp_agent`、`cursor/acp_agent_step`、`cursor/cli`、`dbClient`、`delay`、`end`、`exec`、`exprFilter`、`exprTransform`、`feishu/imMessage`、`fetchNodeOutput`、`fieldFilter`、`flow`、`for`、`fork`、`functions`、`groupAction`、`groupFilter`、`inclusive`、`join`、`jsFilter`、`jsSwitch`、`jsTransform`、`log`、`metadataTransform`、`mqttClient`、`msgTypeSwitch`、`net`、`opensearch/search`、`ref`、`restApiCall`、`sendEmail`、`sourcegraph/queryBuild`、`sourcegraph/search`、`ssh`、`startTrigger`、`switch`、`text/template`、`volcTls/searchLogs`、`while`、`x/fileDelete`、`x/fileList`、`x/fileRead`、`x/fileWrite`、`x/rpaBrowserClick`、`x/rpaBrowserNavigate`、`x/rpaBrowserQuery`、`x/rpaBrowserScreenshot`、`x/rpaDesktopClick`、`x/rpaMacWindow`、`x/rpaOcr`、`x/rpaScreenCapture`。

自定义节点实现路径：`backend/internal/services/rulego/node_*.go`（`rulego.Registry.Register` / `init`）。

## 2. 通用约定

- **模板**：多数自定义节点支持 RuleGo `el` 模板 `${...}`，变量来自 `metadata`、`data` 等（见各节点 `Init` 中的 `el.NewTemplate`）。
- **工作目录（Cursor 系列）**：`resolveCursorWorkDir` 优先顺序：配置 `workDir` 渲染结果 → `metadata.cursor_acp_cwd` → `metadata.api_route_tracer_service_path`（常与 `apiRouteTracer/gitPrepare` 联用）。
- **Workspace（`cursor/acp_agent*`）**：可配置 `workspaceId`（经 `WorkspaceService` 解析根目录）或 `workspacePath`（绝对目录）；与纯 `workDir` 二选一逻辑见 `node_cursor_acp_agent_shared.go`。

---

## 3. 触发与入口

### `startTrigger`

- **作用**：链入口，收到消息后原样 **Success** 下传。
- **配置**：无业务字段。

---

## 4. 大模型 `ai/llm`

- **实现**：`node_llm.go`，兼容 RuleGo 官方 `ai/llm` 配置，见 [RuleGo LLM 节点说明](https://rulego.cc/pages/llm/)。
- **DevPilot 扩展字段**（`backend/internal/llm/config.go` `NodeConfig`）：`url`、`key`、`model`、`models`、`systemPrompt`、`messages`、`images`、`params`；以及 `skill_dir`、`enabled_skill_names`、`mcp`。
- **消息体 `msg.Data`**：可为纯文本；或 JSON，支持 `conversation_history` + `current_input`/`data` 多轮结构（见 `parseUserInputAndHistory`）。
- **技能**：勾选 `enabled_skill_names` 时，技能会作为 tools 参与多轮 tool 调用。
- **运行时**：应用若启用模型管理，执行前可能按 base URL + model **覆盖 `key`**（见操作说明书）。

---

## 5. HTTP `restApiCall`

- **实现**：`node_rulego_rest_api_fasthttp.go`，用 **FastHTTP** 替换标准 `restApiCall` 实现。
- **配置**：与 RuleGo `external.RestApiCallNodeConfiguration` 一致（如 `requestMethod`、`headers`、`readTimeoutMs`、URL/Body 模板等）。

---

## 6. Cursor / Agent CLI

### `cursor/acp`

- **作用**：通过 Cursor **ACP**（`agent` 子命令 `acp`）跑一轮会话，支持流式与权限选项。
- **主要 configuration**：`agentCommand`（默认 `agent`）、`args`、`timeoutSec`（默认 1800）、`workDir`（模板）、`model`、`sessionMode`、`permissionOptionId`、`clientName`、`clientVersion`、`verboseLog`。
- **输入**：`msg.Data` 为用户提示词；**工作目录**必须能解析到有效目录（见上文「工作目录」）。

### `cursor/cli`

- **作用**：`agent --print` 非交互模式，不经 ACP。
- **主要 configuration**：`agentCommand`、`timeoutSec`、`workDir`、`model`、`mode`（`agent`/`plan`/`ask`）、`outputFormat`（默认 `text`）、`trust`、`force`、`streamPartialOutput`、`extraArgs`、`promptTemplate`（非空时用模板渲染提示词，否则用 `msg.Data`）。

### `cursor/acp_agent`

- **作用**：多轮 ACP Agent（`maxPromptRounds`、`continuationPrompt`、after-round hook、飞书/问答弹窗等高级选项）。
- **主要 configuration**：在 `cursorACPAgentConfig`（`node_cursor_acp_agent_shared.go`）中，含 `workspaceId` / `workspacePath`、`maxPromptRounds`、`useRegisteredAfterRoundHook`、`useAskQuestionDialog`、`autoAskQuestionOptionIndex` 等。

### `cursor/acp_agent_step`

- **作用**：与 `cursor/acp_agent` 同配置结构，但固定为**单轮**（`maxPromptRounds=1`），便于链中多节点串联或中间插入其它步骤。

---

## 7. Git 与 Sourcegraph

### `apiRouteTracer/gitPrepare`

- **作用**：按 `gitlabUrl` 与父目录 `workDir` 执行 `git clone` 或已有目录下 `git pull`（HTTPS URL 由实现拼接）。
- **configuration**：`gitlabUrl`、`workDir`（均支持模板）。
- **输出 metadata**：`api_route_tracer_service_path`（克隆/更新后的服务目录）、`api_route_tracer_service_name` 等；**下游 Cursor 节点可将 `workDir` 留空**，依赖该路径。

### `sourcegraph/search`

- **作用**：调用 Sourcegraph GraphQL `search`。
- **configuration**：`endpoint`（实例根 URL，必填）、`accessToken`、`timeoutSec`、`defaultSearchQuery`（均可模板）。
- **输入**：`msg.Data` 可为搜索字符串或 JSON `{"query":"..."}`。

### `sourcegraph/queryBuild`

- **作用**：根据上游 JSON/文本拼装与内部脚本一致的查询串，并写入 metadata 供下游使用。
- **configuration**：`repoScope`、`repoFrontend`、`repoBackend`、`contextGlobal`、`typeFilter`、`includeForked`、`displayLimit`、`defaultPatternType`、`defaultPatterns` 等（支持模板）。
- **输出 metadata**：`sourcegraph_built_query`、`sourcegraph_built_queries`、`sourcegraph_query_repo_scope`。下游 `sourcegraph/search` 可将 `defaultSearchQuery` 设为 `${metadata.sourcegraph_built_query}`。

---

## 8. 日志检索

### `opensearch/search`

- **作用**：对 OpenSearch/Elasticsearch 执行 `_search`（POST JSON）。
- **configuration**：`endpoint`、`index`、`username`、`password`、`insecureSkipVerify`、`timeoutSec`、`searchType`（`query_then_fetch` / `dfs_query_then_fetch`）、`ignoreUnavailable`、`defaultSearchBody`（合法 JSON，可模板；默认提供 `match_all` 示例）。
- **输入**：若 `msg.data` 为 JSON 且不像完整查询 DSL，会与 `defaultSearchBody` 合并。

### `volcTls/searchLogs`

- **作用**：火山引擎 TLS `SearchLogs` / `SearchLogsV2`。
- **configuration**：`endpoint`、`region`、`accessKeyId`、`secretAccessKey`、`sessionToken`、`topicId`、`defaultQuery`、`limit`、`useApiV3`、`timeoutSec`、`timeRangePreset`、`defaultStartTimeMs`/`defaultEndTimeMs`、`defaultSort`、`highLight` 等。
- **输入 JSON**：支持 `query` / `tlsQuery`、`startTime`、`endTime`、`topicId` 等字段覆盖默认。

---

## 9. 飞书 `feishu/imMessage`

- **作用**：调用飞书开放平台发送单聊消息（`im/v1/messages`）。
- **configuration**：`appId`、`appSecret`、`receiveIdType`（默认 `open_id`）、`receiveId`、`text`（默认 `${data}` 模板）、`timeoutSec`。

---

## 10. 文件 `x/fileRead` / `x/fileWrite` / `x/fileDelete` / `x/fileList`

- **实现**：`node_rulego_file.go`（自 RuleGo 组件迁入）。
- **安全**：支持规则级 `filePathWhitelist` 与上下文 `workDir`（`KeyWorkDir`）限制路径，越界返回 `path not allowed`。
- **细节**：读写支持文本/base64 等（见 RuleGo 文件节点文档与代码中常量）。

---

## 11. RPA（浏览器与桌面）

**浏览器**（`node_rpa_browser.go`）：通过本机 **Chrome 远程调试端口**（默认 `http://127.0.0.1:9222`）控制已启动的 Chrome/Chromium。

- **类型**：`x/rpaBrowserNavigate`、`x/rpaBrowserClick`、`x/rpaBrowserScreenshot`、`x/rpaBrowserQuery`。
- **注意**：实现会在规则链执行期间复用 CDP 会话；节点之间不要破坏共享的 chromedp 上下文（见文件头注释）。

**桌面**（`node_rpa_desktop_darwin.go` / `node_rpa_desktop_stub.go`）：`x/rpaScreenCapture`、`x/rpaMacWindow`、`x/rpaDesktopClick` 等，非 macOS 可能为 stub 行为。

**OCR**：`x/rpaOcr`（`node_rpa_ocr.go`）。

具体字段以各节点 `Init` 中 `maps.Map2Struct` / 结构体标签为准，配置时使用与 RuleGo 一致的 **camelCase JSON 键**（与引擎 `configuration` 一致）。

---

## 12. 官方内置节点（查阅官方文档）

以下类型由 RuleGo 引擎提供，DevPilot 未在 `node_*.go` 中替换实现（行为以官方为准）：

- **控制流**：`switch`、`jsSwitch`、`msgTypeSwitch`、`for`、`while`、`fork`、`join`、`inclusive`、`flow`、`ref`、`groupAction`、`groupFilter`、`break`、`end`、`comment` 等。
- **数据与脚本**：`jsTransform`、`jsFilter`、`exprTransform`、`exprFilter`、`metadataTransform`、`fieldFilter`、`log`、`functions`、`text/template` 等。
- **集成**：`exec`、`ssh`、`net`、`mqttClient`、`dbClient`、`sendEmail`、`fetchNodeOutput`、`delay`、`cacheGet`/`cacheSet`/`cacheDelete` 等。

编写 DSL 时 `node.type` 必须与上表及 `rulego-backend-nodes.mdc` 一致；前端 Blockly 块的 `nodeType` 需与后端一致（见 `.cursor/rules/rulego-blocks.mdc`）。

---

## 13. 参考链接

- RuleGo：https://rulego.cc/
- RuleGo LLM 节点：https://rulego.cc/pages/llm/
- Sourcegraph GraphQL API：https://docs.sourcegraph.com/api/graphql
- 飞书发送消息：https://open.feishu.cn/document/server-docs/im-v1/message/create
- 火山 TLS SearchLogs：https://www.volcengine.com/docs/6470/112195
