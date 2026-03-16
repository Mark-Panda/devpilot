# 自定义 LLM 组件（langchaingo + Skill + MCP）

本组件位于 `backend/internal/llm`，基于 [langchaingo](https://github.com/tmc/langchaingo) 实现，支持基础 API 参数、**Skill** 与 **MCP** 能力。

## 基础参数

| 参数       | 说明 |
|------------|------|
| `base_url` | 兼容 OpenAI 的 API 根地址，如 `https://api.openai.com/v1` 或自建代理 |
| `api_key`  | 认证密钥 |
| `model`    | 模型名称，如 `gpt-4o`、`gpt-3.5-turbo`、`deepseek-chat` 等 |
| `max_tokens` | 可选，单次回复最大 token |
| `temperature` | 可选，采样温度 [0, 2] |

## Skill 加载（参考 claude-code / openclaw）

Skill 采用与 **claude-code**、**openclaw** 一致的 **SKILL.md** 格式，便于复用现有技能或编写新技能。

- **位置**：在配置中指定 `skill_dir`，组件会递归扫描该目录下所有 `SKILL.md` 文件。
- **格式**：每个 `SKILL.md` 包含：
  - **YAML frontmatter**（首段 `---...---`）：至少包含 `name`、`description`。
  - **正文**：Markdown 说明与步骤，作为技能完整内容。

`description` 用于“何时使用该技能”的语义描述（建议 ≤1024 字符），与 claude-code 的“按描述激活技能”一致。

示例 SKILL.md：

```markdown
---
name: create-rule
description: >-
  Create Cursor rules for persistent AI guidance. Use when you want to create a
  rule, add coding standards, set up project conventions...
---

# Creating Cursor Rules
...
```

- **注入方式**：
  - `Chat()` / `ChatWithSkillPrompt(..., true)`：仅将技能的 **name + description** 注入系统提示（省 token）。
  - `ChatWithSkillPrompt(..., false)`：注入**完整技能内容**。
  - 也可用 `LoadSkills(skillDir)` 和 `BuildSkillSystemPrompt()` 自行拼接系统提示。

## MCP（Model Context Protocol）

MCP 用于让 LLM 调用外部**工具**、访问**资源**和**提示模板**。本组件提供：

1. **配置结构** `Config.MCP`（`MCPConfig`）：
   - `server_command`：通过 stdio 启动的 MCP 服务命令（如 `["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path"]`）。
   - `server_url`：若使用 HTTP/SSE 等传输，可填服务器 URL。
   - `env`：启动 MCP 进程时的环境变量。
   - `tool_names`：仅启用部分工具时填写名称列表，为空表示使用全部。

2. **与 MCP 实际通信**：需在业务层集成 MCP Go SDK，例如：
   - [modelcontextprotocol/go-sdk](https://github.com/modelcontextprotocol/go-sdk)
   - [mark3labs/mcp-go](https://mcp-go.dev/)

3. **将 MCP 工具告知模型**：
   - 使用 SDK 拉取 tools 列表后，可转为 langchaingo 的 `llms.Tool`，通过 `GenerateContent(..., llms.WithTools(tools))` 做工具调用。
   - 或仅将工具描述注入系统提示：使用 `BuildMCPToolsSystemPrompt([]MCPToolDescription{...})` 得到字符串，再通过 `ChatWithSystem(ctx, systemPrompt, userMessage)` 传入。

## 使用示例

```go
package main

import (
    "context"
    "log"

    "devpilot/backend/internal/llm"
)

func main() {
    ctx := context.Background()
    cfg := llm.Config{
        BaseURL:     "https://api.openai.com/v1",
        APIKey:      "sk-xxx",
        Model:       "gpt-4o",
        SkillDir:    "/path/to/skills",  // 可选
        MaxTokens:   2048,
        Temperature: 0.7,
    }
    client, err := llm.NewClient(ctx, cfg)
    if err != nil {
        log.Fatal(err)
    }
    reply, err := client.Chat(ctx, "你好，请介绍一下当前可用的技能。")
    if err != nil {
        log.Fatal(err)
    }
    log.Println(reply)
}
```

与 RuleGo 或模型管理服务结合时，可从 `model_management` 的 `ModelConfig`（base_url、model、api_key）构建 `llm.Config`，并设置 `SkillDir`、`MCP` 等扩展参数。

---

## RuleGo 节点 `ai/llm`

后端已实现自定义节点 **`ai/llm`**（`backend/internal/services/rulego/node_llm.go`），配置结构与 [RuleGo 官方 LLM 文档](https://rulego.cc/pages/llm/#大模型参数-params-结构) 一致，便于直接复用官方示例与前端配置。

### 节点配置字段（与官方一致）

| 字段           | 类型              | 说明 |
|----------------|-------------------|------|
| `url`          | string            | 请求地址，默认 `https://ai.gitee.com/v1` |
| `key`          | string            | API Key |
| `model`        | string            | 模型名称 |
| `systemPrompt` | string            | 系统提示，支持 `${}` 占位符（由消息 metadata 替换） |
| `messages`     | []ChatMessage     | 上下文/用户消息列表，每项含 `role`（user/assistant）、`content` |
| `images`       | []string          | 图片 URL 列表（可选，多模态后续扩展） |
| `params`       | Params            | 大模型参数 |

### Params 结构（大模型参数）

| 字段               | 类型     | 说明 |
|--------------------|----------|------|
| `temperature`      | float32  | 采样温度 [0.0, 2.0] |
| `topP`             | float32  | 采样方法 [0.0, 1.0] |
| `presencePenalty`  | float32  | 对已有标记的惩罚 [0.0, 1.0] |
| `frequencyPenalty` | float32  | 对重复标记的惩罚 [0.0, 1.0] |
| `maxTokens`        | int      | 最大输出长度 |
| `stop`             | []string | 停止输出标记 |
| `responseFormat`   | string   | text / json_object / json_schema |
| `jsonSchema`       | string   | JSON Schema（responseFormat=json_schema 时） |
| `keepThink`        | bool     | 是否保留思考过程（仅 text 格式） |

### 扩展字段（本实现独有）

- **`skill_dir`**：技能目录，递归加载 SKILL.md 并注入为系统上下文（参考上文 Skill 加载）。
- **`mcp`**：MCP 配置（结构见上文），便于后续接入 MCP 工具。

### 行为说明

- 若配置了 **messages**：使用 `systemPrompt` + **messages** 作为对话内容，其中 `systemPrompt` 与各条 `content` 中的 `${key}`、`${vars.key}` 会用当前消息的 **metadata** 替换。
- 若未配置 **messages**：使用 **systemPrompt**（可选）+ 当前消息的 **msg.Data** 作为单条用户消息调用大模型，结果写回 **msg.Data** 并走 Success 下游。

DSL 配置示例可参考 [RuleGo 官方 LLM 配置示例](https://rulego.cc/pages/llm/#配置示例)，将节点 `type` 设为 `ai/llm` 即可使用本实现。
