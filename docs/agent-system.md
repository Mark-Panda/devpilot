# AI Agent 对话系统

参考 OpenClaw 的实现思路,为 DevPilot 实现的大模型对话系统,支持子代理创建、技能调用、MCP 工具集成和项目理解。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Agent 对话系统                              │
│                                                                  │
│  ┌────────────────────── Frontend ──────────────────────────┐   │
│  │  Chat UI + Agent Tree + Config Panel                     │   │
│  │  - 对话界面  - 子代理树  - 技能管理  - MCP 工具管理       │   │
│  └──────────────────┬───────────────────────┬───────────────┘   │
│                     │ Wails IPC             │                   │
│  ┌──────────────────▼──────────────────────────────────────┐   │
│  │                Agent Orchestrator (Go)                   │   │
│  │  - 对话管理  - 子代理池  - Skill仓库  - MCP连接         │   │
│  │  - Project Context & Code Understanding                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 核心功能

### 1. Agent 编排引擎 (`backend/internal/agent/`)

- **Agent 类型**:
  - `main`: 主代理,用于顶层对话
  - `sub`: 子代理,可由主代理创建
  - `worker`: 工作代理,执行特定任务

- **生命周期管理**:
  - 创建 Agent: `CreateAgent(config)` 
  - 销毁 Agent: `DestroyAgent(agentID)` 自动清理子代理；**`type == main` 的主 Agent 不可删除**（后端拒绝，前端隐藏删除入口）
  - Agent 状态: `idle`、`busy`、`stopped`

- **消息总线** (`message_bus.go`):
  - 基于 Pub/Sub 模式的 Agent 间通信
  - 支持点对点消息和广播
  - 消息类型: `request`、`response`、`event`、`broadcast`

### 2. 对话记忆（类 OpenClaw session）

- 每个 Agent 在内存中维护 user/assistant 文本轮次，调用模型时注入为完整多轮上下文（技能路径走 `GenerateWithToolLoop`，无技能走 `GenerateFromMessages`）。
- 持久化路径：`~/.devpilot/agent-memory/<agent_id>.json`（全局，与当前打开的项目无关），应用重启后可恢复。若仍存在旧路径 `~/.devpilot/projects/<项目键>/agent-memory/`、`<项目根>/.devpilot/agent-memory/`，首次加载时会读到并**写回**上述全局目录。
- **记忆压缩**：当 user/assistant 轮次正文的 token 估值（优先 `cl100k_base`，不可用时用启发式）超过阈值（约 1.4 万）时，在回合结束后用当前模型将**较早**对话折叠为滚动摘要，写入同目录 `*-summary.txt`，并从内存与 JSON 中**删除**已折叠的轮次；最近约 **8 轮**完整对话始终保留。摘要通过系统提示中的「历史对话摘要」块注入后续对话。压缩失败时回退为仅按条数截断（`maxMemoryMessages`）。
- **Agent 注册表**：`~/.devpilot/agents.json` 保存所有主/子 Agent 的完整 `AgentConfig`；旧版 `~/.devpilot/projects/<项目键>/agents.json`、`<项目根>/.devpilot/agents.json` 会在首次读取时自动迁移到全局路径。创建、销毁、`UpdateAgent`、热切换模型后以及**进程关闭前**会重写该文件。
- 默认最多保留约 80 条消息（可再调 `maxMemoryMessages`）；销毁 Agent 或调用 `ClearAgentChatHistory` 会删除对应文件。

### 3. LLM 集成

每个 Agent 内置:
- 基于 `langchaingo` 的 LLM 客户端
- 支持 OpenAI 兼容 API (可配置 base_url)
- Skill 自动注入系统提示
- MCP 工具循环执行

### 4. Skill 系统

复用项目现有的 Skill 加载器:
- 从 `~/.devpilot/skills/` 或配置目录加载 SKILL.md
- Agent 可选择启用特定技能
- 技能作为 Tools 暴露给模型,支持真实执行

### 5. MCP 工具集成

- **配置文件**：`~/.devpilot/mcp.json` 持久化 MCP 服务列表（全局）；旧版 `~/.devpilot/projects/<项目键>/mcp.json`、`<项目根>/.devpilot/mcp.json` 首次读取时自动迁移。设置页「MCP 配置」或 Wails `GetMCPServerDefinitions` / `SaveMCPServerDefinitions` 读写该文件。
- **主 Agent**：对话时自动连接所有 **已启用** 且可运行的 MCP，将各服务 `tools/list` 合并为模型 tools，通过 `mark3labs/mcp-go` 执行 `tools/call`。
- **其他 Agent**：仅在 `agents.json` 的 `mcp_servers` 与上述已启用服务的 **交集** 上连接 MCP。
- 与技能共用 `GenerateWithToolLoop`：先匹配技能名，否则按 `mcp_<serverId>__<toolName>` 形式路由到对应 MCP。

### 6. 项目上下文 (`project_context.go`)

- **项目信息**: 自动检测项目名称、语言、总行数
- **代码搜索**: 简单的文本搜索,支持限制结果数量
- **文件操作**: 读取、更新文件内容,支持缓存
- **配置管理**: 动态读写项目配置

## 前端界面

### 主要组件 (`frontend/src/modules/agent/`)

1. **AgentChatPage**: 主页面,集成所有功能
2. **ChatMessages**: 消息流展示,支持用户/助手消息
3. **ChatInput**: 输入框,支持 Enter 发送、Shift+Enter 换行
4. **AgentTree**: 树形展示 Agent 层级关系
5. **AgentForm**: 创建 Agent 表单,配置模型、技能等

### 状态管理 (`store.ts`)

使用 Zustand 管理:
- Agent 列表和当前选中
- 对话消息历史
- 项目信息
- Agent 树结构

## 使用流程

### 1. 创建主 Agent

```typescript
const config: AgentConfig = {
  id: 'agent_main',
  name: '主助手',
  type: 'main',
  model_config: {
    base_url: 'https://api.openai.com/v1',
    api_key: 'sk-...',
    model: 'gpt-4o',
    max_tokens: 2048,
    temperature: 0.7,
  },
  skills: ['create-rule', 'feishu-doc'],
  mcp_servers: [],
  system_prompt: '你是一个专业的编程助手',
}

await agentApi.createAgent(config)
```

### 2. 与 Agent 对话

```typescript
const response = await agentApi.chat('agent_main', '帮我分析这个项目的架构')
```

### 3. 创建子代理

子代理可以继承父代理配置或使用不同配置:

```typescript
const subConfig: AgentConfig = {
  ...config,
  id: 'agent_sub_1',
  name: '代码审查助手',
  parent_id: 'agent_main',
  type: 'sub',
  skills: ['code-review'],
}

await agentApi.createAgent(subConfig)
```

### 4. Agent 间通信

```typescript
await agentApi.sendMessage(
  'agent_main',
  'agent_sub_1',
  '请审查这段代码',
  'request'
)
```

### 5. 项目理解

```typescript
// 获取项目信息
const projectInfo = await agentApi.getProjectInfo()

// 搜索代码
const matches = await agentApi.searchCode('function handleClick', 10)

// 读取文件
const content = await agentApi.getFileContent('src/App.tsx')
```

## 后端 API

Agent 服务暴露的 Wails 方法 (`backend/internal/agent/service.go`):

```go
// Agent 管理
CreateAgent(ctx, config) -> AgentInfo
GetAgent(ctx, agentID) -> AgentInfo
ListAgents(ctx) -> []AgentInfo
DestroyAgent(ctx, agentID) -> error

// 对话
Chat(ctx, agentID, message) -> string

// 消息
SendMessage(ctx, fromAgentID, toAgentID, content, type) -> error

// Agent 树
GetAgentTree(ctx, rootID) -> *AgentTreeNode

// 对话记忆
GetAgentChatHistory(ctx, agentID) -> []ChatHistoryEntry
ClearAgentChatHistory(ctx, agentID) -> error

// 项目上下文
GetProjectInfo(ctx) -> ProjectInfo
SearchCode(ctx, query, limit) -> []CodeMatch
GetFileContent(ctx, path) -> string
UpdateFile(ctx, path, content) -> error
ListFiles(ctx, pattern) -> []string
GetProjectConfig(ctx, key) -> interface{}
SetProjectConfig(ctx, key, value) -> error
```

## 扩展点

### 1. 增强代码搜索

当前实现是简单的文本搜索,可以集成:
- 语义搜索 (Embedding + 向量数据库)
- AST 解析 (基于语法树的精确搜索)
- 符号索引 (LSP 协议)

### 2. MCP 服务器集成

需要在业务层实现:
```go
// 启动 MCP 服务器
mcpClient := mcp.NewClient(config)
tools := mcpClient.ListTools()

// 实现 ToolExecutor
executor := &MCPToolExecutor{client: mcpClient}

// 传给 Agent
agent.SetMCPExecutor(executor)
```

### 3. 持久化

当前 Agent 是内存中的,重启后丢失。可以添加:
- Agent 配置持久化到数据库
- 对话历史持久化
- Agent 状态快照

### 4. 安全增强

- API Key 加密存储
- Agent 权限控制 (限制可访问的文件/目录)
- 消息内容审计日志

## 文件清单

### 后端

```
backend/internal/agent/
├── types.go              # 类型定义
├── message_bus.go        # 消息总线实现
├── agent.go              # Agent 核心实现
├── orchestrator.go       # Agent 编排器
├── project_context.go    # 项目上下文管理
└── service.go            # Wails 服务层
```

### 前端

```
frontend/src/modules/agent/
├── types.ts              # 类型定义
├── api.ts                # Wails API 封装
├── store.ts              # Zustand 状态管理
├── components/
│   ├── ChatMessages.tsx  # 消息流
│   ├── ChatInput.tsx     # 输入框
│   ├── AgentTree.tsx     # Agent 树
│   └── AgentForm.tsx     # 创建表单
└── pages/
    └── AgentChatPage.tsx # 主页面
```

## 参考资料

- [OpenClaw Architecture](https://github.com/openclaw/openclaw)
- [langchaingo](https://github.com/tmc/langchaingo)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [项目架构文档](docs/architecture.md)
- [LLM 组件文档](docs/llm-component.md)

## 开发计划

- [x] Agent 编排引擎
- [x] 消息总线
- [x] 项目上下文
- [x] 前端对话界面
- [x] Skill 集成
- [ ] MCP 服务器集成 (需业务层实现)
- [ ] 语义代码搜索
- [ ] Agent 持久化
- [ ] 多模态支持 (图片、文件上传)
