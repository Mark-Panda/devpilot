# Cursor Agent CLI 附加参数说明（含 `agent acp`）

本文说明 **Cursor Agent 命令行**在启动 `**agent acp`**（ACP 模式）时，可在可执行文件与子命令 `acp` 之间插入的**全局参数**；并对应 DevPilot 规则链里 **「追踪·Cursor ACP」** 节点的 **args（JSON 数组）** 配置方式。

> 权威来源以 Cursor 官方为准：  
>
> - [CLI Parameters（全局参数与子命令）](https://cursor.com/docs/cli/reference/parameters)  
> - [ACP 说明与示例](https://cursor.com/docs/cli/acp)

---

## 1. 与 DevPilot 的关系

- 节点配置的 **args** 会传给 `exec.Command(agentCommand, args...)`，因此 **数组最后一项必须是子命令 `acp`**（除非 Cursor 未来变更调用方式）。
- **默认**：`[]`（代码侧等价于仅传 `["acp"]`）。
- **界面预设「-k + acp」**：`["-k", "acp"]`（与 [ACP 文档](https://cursor.com/docs/cli/acp) 中的示例一致；具体含义以当前 CLI `--help` 为准）。
- **鉴权**：优先使用环境变量 `**CURSOR_API_KEY`** / `**CURSOR_AUTH_TOKEN**` 或先执行 `**agent login**`；避免把 API Key 写进规则链 JSON。

---

## 2. 全局参数一览（可与任意子命令组合）

以下参数在官方文档中标注为 **Global options**，可与 `**acp`** 等子命令一起出现在 `**agent` 之后、`acp` 之前**。


| 选项                        | 说明                                              |
| ------------------------- | ----------------------------------------------- |
| `-v`, `--version`         | 打印版本号                                           |
| `--api-key`               | API Key（也可用环境变量 `CURSOR_API_KEY`）               |
| `-H`, `--header`          | 为请求增加 HTTP 头，格式 `Name: Value`，可重复               |
| `-p`, `--print`           | 非交互打印模式（主要配合脚本；与 **ACP 子进程**通常二选一使用场景）          |
| `--output-format`         | 仅与 `--print` 配合：`text` / `json` / `stream-json` |
| `--stream-partial-output` | 与 `--print` + `stream-json` 配合，流式输出增量           |
| `-c`, `--cloud`           | 云模式                                             |
| `--resume [chatId]`       | 恢复指定会话                                          |
| `--continue`              | 继续上一会话（等价 `--resume=-1`）                        |
| `--model`                 | 指定模型                                            |
| `--mode`                  | `plan` 或 `ask`（未指定时默认为 agent 模式）                |
| `--plan`                  | 等价 `--mode=plan`                                |
| `--list-models`           | 列出可用模型                                          |
| `-f`, `--force`           | 强制允许命令（除非显式拒绝）                                  |
| `--yolo`                  | 同 `--force`                                     |
| `--sandbox`               | `enabled` 或 `disabled`                          |
| `--approve-mcps`          | 自动批准所有 MCP                                      |
| `--trust`                 | 无提示信任工作区（无头场景）                                  |
| `--workspace`             | 指定工作区目录                                         |
| `-h`, `--help`            | 帮助                                              |


**ACP 文档中另出现的示例**（若官方 Parameters 页未逐条列出，请以 `agent acp --help` 或根命令 `agent --help` 为准）：


| 示例         | 说明                                                        |
| ---------- | --------------------------------------------------------- |
| `-e <url>` | 指定 API 端点（ACP 文档示例：`agent -e https://api2.cursor.sh acp`） |
| `-k`       | ACP 文档中与 `acp` 联用的简写（界面预设为 `["-k","acp"]`）                |


---

## 3. `args` 数组写法示例

数组元素按顺序对应命令行参数（**不要**把可执行文件名 `agent` 放进数组）。


| 场景        | JSON 数组示例                                        |
| --------- | ------------------------------------------------ |
| 默认        | `[]`（由实现补全为仅 `acp`）                              |
| 文档示例      | `["-k", "acp"]`                                  |
| 指定 API 端点 | `["-e", "https://api2.cursor.sh", "acp"]`        |
| 指定模型      | `["--model", "你的模型名", "acp"]`                    |
| 云模式       | `["-c", "acp"]`                                  |
| 自动批准 MCP  | `["--approve-mcps", "acp"]`                      |
| 沙箱        | `["--sandbox", "enabled", "acp"]`                |
| 组合（示例）    | `["--model", "gpt-4o", "--approve-mcps", "acp"]` |


注意：

- `**--print`** 面向「单次打印输出」流程；启动 **ACP 长连接**时一般**不要**与 `acp` 混在同一套 args 里误用（除非你确认 CLI 支持且符合你的目标）。
- `**--workspace`** 与节点里的 **workDir / metadata 工作目录**含义不同：前者是 **CLI 进程级**工作区，后者由 ACP `session/new` 的 `cwd` 传入会话；可按需只配一种或两种都配，避免路径不一致。

---

## 4. 子命令（非 `acp`）

下列为 **独立子命令**，一般**不会**放进 ACP 的 `args` 数组里与 `acp` 并列（一次进程只做一件事）：

`login`、`logout`、`status`、`about`、`models`、`mcp`、`update`、`ls`、`resume`、`create-chat`、`generate-rule`、`install-shell-integration`、`uninstall-shell-integration`、`help` 等。  
管理 MCP 时用 `**agent mcp …`** 单独执行，而不是写在 `agent … acp` 的 args 里。

---

## 5. 安全与运维建议

- **不要把 `--api-key` 明文写进规则链**；用环境变量或宿主机密管理。
- CLI 升级后参数可能变化，以 `**agent --help`** / `**agent acp --help**` 为准。
- 若某组参数导致 ACP 握手失败，可先在同一终端手动执行等价命令行复现，再缩小参数范围排查。

---

## 6. 相关 DevPilot 代码

- ACP 子进程与 JSON-RPC：`backend/internal/cursoracp`
- RuleGo 节点 `**cursor/acp**`：`backend/internal/services/rulego/node_cursor_acp.go`
- 前端块与下拉预设：`frontend/src/modules/rulego/rulego-blocks/blocks/cursorAcp.ts`

