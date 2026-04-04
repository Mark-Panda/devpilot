---
name: rulego-chain-builder
description: 根据用户描述生成 RuleGo 规则链 DSL 并调用 DevPilot 内部 Wails IPC 接口创建/执行规则链。当用户描述一个自动化流程、数据处理管道、AI 工作流或希望创建规则链时使用。触发短语：创建规则链、生成规则链、构建工作流、自动化流程、rule chain、rulego。
---

# RuleGo 规则链构建器

## 核心概念

DevPilot 使用 **RuleGo** 规则引擎，规则链是一个有向图：节点处理消息，连接决定路由。

**DSL 格式**（JSON 字符串，存入 `definition` 字段）：

```json
{
  "ruleChain": {
    "id": "chain-001",
    "name": "链名称",
    "debugMode": false,
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [ /* 节点数组 */ ],
    "connections": [ /* 连接数组 */ ],
    "ruleChainConnections": []
  }
}
```

**节点格式**：
```json
{ "id": "n1", "type": "jsFilter", "name": "显示名", "debugMode": false, "configuration": { /* 见节点参考 */ } }
```

**连接格式**：
```json
{ "fromId": "n1", "toId": "n2", "type": "Success" }
```

常用连接类型：`Success`、`Failure`、`True`、`False`、`Do`、`Default`、`Case1`~`Case6`

## 构建步骤

1. **理解需求**：梳理数据流入口 → 处理步骤 → 输出目标
2. **选节点**：参考 [nodes-reference.md](nodes-reference.md) 选择对应节点类型
3. **组装 DSL**：每条链必须以 `startTrigger` 开始；根据处理逻辑串联节点
4. **调用接口**：通过 Wails JS API 创建或执行

## 调用架构说明

DevPilot 是一个 **Wails 桌面应用**，调用分两个层次：

```
┌─────────────────────────────────────────┐
│  前端 JS（浏览器渲染层）                  │
│  window.go.rulego.Service.*             │  ← Wails IPC
├─────────────────────────────────────────┤
│  Go 后端（rulego.Service）              │
│  ├─ CreateRuleGoRule / ExecuteRule      │
│  ├─ ai/llm 节点（RuleGo 引擎内部）      │  ← LLM 在此运行
│  └─ RuleChainExecutor（技能→规则链桥）  │
└─────────────────────────────────────────┘
```

**大模型（LLM）运行在后端 Go 进程中**，不在前端 JS 中。大模型无法直接调用 `window.go.*`，它有两种方式操作规则链：

### 方式一：前端调用（用户/UI 触发）

前端 JS 通过 Wails IPC 操作规则链，大模型生成的 DSL 由前端代码提交：

```javascript
// 规则链落盘为 ~/.devpilot/rulego/{id}.json，API 仅传完整 DSL 字符串（名称/描述/Scratch/三套请求参数均在
// ruleChain 与 ruleChain.configuration.devpilot 内，见项目 devpilot_dsl 约定）。

// 创建规则链（仅 definition）
const result = await window.go.rulego.Service.CreateRuleGoRule({
  definition: JSON.stringify(dsl),
});

// 测试执行（不存库）
const out = await window.go.rulego.Service.ExecuteRuleDefinition(
  JSON.stringify(dsl),
  { message_type: "default", metadata: {}, data: JSON.stringify({ key: "value" }) }
);

// 执行已保存的规则链
const out = await window.go.rulego.Service.ExecuteRule(ruleId, {
  message_type: "default",
  metadata: {},
  data: JSON.stringify({ key: "value" })
});

// 其他操作（列表项仅 id / definition / updated_at，展示字段从 definition 解析）
await window.go.rulego.Service.ListRuleGoRules();
await window.go.rulego.Service.UpdateRuleGoRule(id, { definition: JSON.stringify(dsl) });
await window.go.rulego.Service.DeleteRuleGoRule(id);
```

### 方式二：大模型通过技能自动触发（后端 Go 内部）

当规则链创建后，可以为它生成一个**技能**（`SKILL.md` + `rule_chain_id` 字段）。之后当 `ai/llm` 节点的 `enabled_skill_names` 包含该技能名时，LLM 判断需要调用该技能，后端的 `RuleChainExecutor` 会**直接调用 `rulego.Service.ExecuteRule()`**（Go 函数调用，不经过 HTTP/IPC）。

调用链：`ai/llm 节点` → `GenerateWithToolLoop` → `skillExecutor.Execute` → `RuleChainExecutor` → `svc.ExecuteRule(ruleChainID, input)`

这是 DevPilot 中 LLM 触发规则链的**唯一后端路径**，由 `app.startup()` 中的 `InitRuleChainExecutor` 注入。

## 常用模式

### 简单 LLM 问答链
```
startTrigger → ai/llm → [可选回调 restApiCall]
```

### 条件分支链
```
startTrigger → jsFilter[True→处理A, False→处理B]
```

### 循环处理链
```
startTrigger → for[Do→处理节点] → 汇总
```

### 并行处理链
```
startTrigger → fork → [n 个并行节点] → join
```

### Web RPA（Chrome 远程调试）
```
startTrigger → x/rpaBrowserNavigate → x/rpaBrowserQuery → x/rpaBrowserClick → [可选 x/rpaBrowserScreenshot → x/rpaOcr]
```
- 先用 `--remote-debugging-port=9222`（或等价方式）启动 Chrome；链上各 `x/rpaBrowser*` 使用**相同 `debuggerUrl`** 时，**一次执行内复用同一 CDP 连接与同一标签**，不会在每步结束后关页或断连。
- `timeoutMs` 为节点级墙钟超时，行为说明见 [nodes-reference.md](nodes-reference.md)「浏览器 CDP 会话与超时」。

### 桌面 RPA（macOS）
```
startTrigger → x/rpaMacWindow → x/rpaScreenCapture → x/rpaDesktopClick
```
- `x/rpaScreenCapture`、`x/rpaMacWindow`、`x/rpaDesktopClick` **仅 macOS** 可用；其他平台需用浏览器节点或 `exec`/外部服务代替。

## 注意事项

- **`ruleChain.id` 必须是 UUID v4 格式**（如 `"550e8400-e29b-41d4-a716-446655440000"`），可用 `crypto.randomUUID()` 生成；节点 id（`metadata.nodes[].id`）建议用短标识（s1, s2...）即可
- `disabled: false` = 启用；`disabled: true` = 停用（**不是 `enabled` 字段**）
- `root: false` 表示子规则链（可被 `flow` 节点引用）
- `ai/llm` 节点的 `key` 字段（API Key）会在执行时由系统自动覆盖，填空字符串即可
- `for` 节点的 `configuration.do` 填循环体首节点 id，同时需在 connections 中加 `fromId=for节点id, type=Do` 的连接
- **RPA**：浏览器自动化依赖本机 Chrome 远程调试端口；**多浏览器节点请保持 `debuggerUrl` 一致**以复用会话。OCR 依赖本机 `tesseract`；macOS 桌面操作依赖系统权限（截屏、辅助功能、自动化等），详见 [nodes-reference.md](nodes-reference.md)「RPA 类」

## 详细参考

- 节点配置参数详细说明：[nodes-reference.md](nodes-reference.md)
- 完整 DSL 示例（LLM链、条件链、循环链等）：[dsl-examples.md](dsl-examples.md)
