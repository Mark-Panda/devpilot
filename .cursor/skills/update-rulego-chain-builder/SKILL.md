---
name: update-rulego-chain-builder
description: 更新 initSkills/rulego-chain-builder/ 技能文档，包括新增/修改节点类型、示例、调用接口说明。当有新的 RuleGo 节点需要注册、已有节点配置变更、新增 Wails IPC 接口、或需要刷新 DSL 示例时使用。触发短语：更新规则链技能、新增节点、更新节点、刷新 rulego-chain-builder、update rulego skill。
---

# 更新 RuleGo Chain Builder 技能

维护 `initSkills/rulego-chain-builder/` 的工作流，确保技能文档与项目代码保持同步。

## 技能文件结构

```
initSkills/rulego-chain-builder/
├── SKILL.md           # 主技能：核心概念 + 调用架构 + 常用模式 + 注意事项
├── nodes-reference.md # 节点速查表：所有节点类型及完整 configuration 参数
└── dsl-examples.md    # DSL 完整示例：8 个端到端示例 + 创建流程代码
```

## 触发场景 → 对应操作

| 场景 | 需要修改的文件 |
|------|--------------|
| 新增后端节点（`node_*.go` 新文件） | `nodes-reference.md`（增加节点条目）+ `dsl-examples.md`（酌情加示例） |
| 已有节点 configuration 字段变更 | `nodes-reference.md` 对应节点条目 |
| 新增/修改前端块（`rulego-blocks/blocks/*.ts`） | `SKILL.md` 常用模式（如有新模式）|
| 新增 Wails IPC 方法（`methods.go`） | `SKILL.md` 调用方式章节 |
| DSL 格式变更 | `SKILL.md` 核心概念 + `dsl-examples.md` 所有示例 |
| 修复文档错误 | 对应文件 |

---

## 执行步骤

### Step 1：确认变更范围

先阅读代码确认实际变更，不要凭印象修改：

```
# 新增节点：查看节点实现文件
backend/internal/services/rulego/node_*.go

# 确认后端已注册节点列表（权威来源）
.cursor/rules/rulego-backend-nodes.mdc

# 前端块定义
frontend/src/modules/rulego/rulego-blocks/blocks/*.ts

# Wails IPC 方法
backend/internal/services/rulego/methods.go
```

关键检查点：
- 节点 `type` 字段（必须与 `node.type` 或 `rulego-backend-nodes.mdc` 一致）
- `configuration` 结构体字段（对应 Go struct 的 json tag）
- 连接类型（`TellSuccess`/`TellFailure`/`TellNext` 对应 `Success`/`Failure`/自定义）

### Step 2：更新 nodes-reference.md

每个节点条目的标准格式：

```markdown
### `nodeType` — 节点显示名

（可选：所属分类标题 ## 触发器类 / ## 动作类 / ## 条件判断类 / ## 流程控制类 / 等）

```json
{
  "type": "nodeType",
  "configuration": {
    "field1": "默认值或示例值",
    "field2": 0
  }
}
```

- `field1`：字段说明（类型、取值范围、支持的变量插值）
- `field2`：字段说明
- 连接：`Success` / `Failure` / ...（列出所有可能的 connection type）
```

**节点分类顺序**（保持文件内顺序一致）：
1. 触发器类（startTrigger）
2. 动作类（ai/llm、restApiCall、jsTransform、jsFilter、delay、log、dbClient）
3. 条件判断类（switch、jsSwitch、msgTypeSwitch、exprFilter）
4. 流程控制类（for、fork、join、groupAction、flow、break、while）
5. 数据处理类（exprTransform、metadataTransform、text/template、fieldFilter、fetchNodeOutput）
6. 缓存类（cacheSet、cacheGet、cacheDelete）
7. 外部通信类（mqttClient、sendEmail、ssh、exec）

### Step 3：更新 dsl-examples.md（如需）

仅在以下情况增加或修改示例：
- 新节点没有任何示例覆盖
- 已有示例中引用了变更的配置字段

**示例规范**：
- `ruleChain.id`：必须是 UUID v4 格式（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）
- 节点内部 `id`：用短标识（s1, s2...）
- 每个示例必须以 `startTrigger` 节点开头
- `connections` 数组中的 `type` 必须与节点实际输出的 relation type 一致

### Step 4：更新 SKILL.md（如需）

仅在以下情况修改：
- 新增了值得提炼的常用模式（`## 常用模式` 章节）
- 新增了重要注意事项（`## 注意事项` 章节）
- Wails IPC 方法增减（`## 调用架构说明` 章节）

不要把节点细节写进 SKILL.md，那些属于 nodes-reference.md。

### Step 5：同步 .cursor/rules/rulego-backend-nodes.mdc

若有新节点注册，还需更新 `.cursor/rules/rulego-backend-nodes.mdc` 的节点列表（或运行 `make rulego-rules` 自动生成）：

```bash
make rulego-rules
```

若 Makefile 目标不存在，手动在 `rulego-backend-nodes.mdc` 节点列表中追加新节点的 `type` 值（字母序排列）。

---

## 关键约定（勿违反）

1. **节点 `type` 来自后端注册，不是前端块名**：前端块名是 `rulego_jsFilter`，对应的 DSL `type` 是 `jsFilter`——不要混淆

2. **连接类型来自代码**：查看节点 Go 实现中的 `ctx.TellSuccess/Failure/Next(msg, "TypeName")` 确定实际输出的 relation type

3. **`ai/llm` 的 key 字段留空**：执行时由 `PatchDefinitionWithLLMKeys` 自动注入，文档中 `"key": ""` 是正确的

4. **`ruleChain.disabled` 不是 `enabled`**：`disabled: false` = 启用，`disabled: true` = 停用

5. **大模型不能直接调用 `window.go.*`**：LLM 在 Go 后端运行，触发规则链走 `RuleChainExecutor`（后端 Go 调用），不走 Wails IPC

---

## 新增节点完整 Checklist

```
- [ ] 阅读 backend/internal/services/rulego/node_新节点.go，确认：
      - type 字段值
      - Config struct 的所有 json tag 字段
      - TellSuccess/TellFailure/TellNext 输出的 relation type
- [ ] 在 nodes-reference.md 对应分类下插入新节点条目（含完整 configuration JSON）
- [ ] 在 .cursor/rules/rulego-backend-nodes.mdc 追加节点 type（或 make rulego-rules）
- [ ] 若新节点有独特使用场景，在 dsl-examples.md 增加示例
- [ ] 若新节点引入了新的"常用模式"，在 SKILL.md 的 ## 常用模式 中追加
```
