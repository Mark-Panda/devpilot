# 服务内 LLM 使用梳理与统一方案

## 一、当前 LLM 使用全景

### 1. 统一底层：`backend/internal/llm`

所有“真正调用大模型”的代码都经过 **`backend/internal/llm`** 包：

| 能力 | 说明 |
|------|------|
| **Client** | 基于 langchaingo 的 OpenAI 兼容客户端，封装 `base_url` / `api_key` / `model` |
| **NewClient** | 创建客户端并可选加载 `SkillDir`（默认 `~/.devpilot/skills/`）下的技能 |
| **NewClientWithSkills** | 创建客户端并仅使用指定技能列表（不扫目录），用于「仅暴露 create-skill」等场景 |
| **ChatWithSystem** | 单轮：systemPrompt + userMessage → 一次 `GenerateContent` |
| **GenerateFromMessages** / **GenerateFromMessagesWithOptions** | 多轮或自定义 CallOption 的生成 |
| **GenerateWithToolLoop** | 带 tools + ToolExecutor 的循环：模型返回 tool_calls 时执行并继续，直到纯文本或达到 maxRounds |
| **Skill 体系** | LoadSkills、BuildSkillSystemPrompt、SkillsToTools、NewSkillExecutor；技能可 command / rule_chain_id / 子轮 LLM |
| **NodeConfig/Params** | RuleGo ai/llm 节点配置与 CallOptionsFromParams 转换 |

底层仅使用 **langchaingo** 的 `openai` + `llms`，无其他散落调用。

---

### 2. 调用入口（两处）

#### 入口 1：RuleGo 节点 `ai/llm`（`backend/internal/services/rulego/node_llm.go`）

- **创建 Client**：`llm.NodeConfigToConfig(&nc)` → `llm.NewClient(ctx, cfg)`（带默认 SkillDir）。
- **消息来源**：  
  - 若配置了 `messages`：`llm.BuildMessageContentFromNodeConfig(n.config, substitute)`；  
  - 否则：可选的 systemPrompt（占位符替换）+ 从 `msg.Data` 解析的 conversation_history + 当前用户输入。
- **技能**：从 client 已加载技能中按 `enabled_skill_names` 过滤；若有启用技能则注入技能系统提示并走 **GenerateWithToolLoop**，否则 **GenerateFromMessagesWithOptions**。
- **执行时 Key 覆盖**：规则链执行前通过 `PatchDefinitionWithLLMKeys` 用「模型管理」中匹配 baseURL+model 的 API Key 覆盖节点里的 key，与模型管理保持一致。
- **Context**：故意使用 `context.Background()`，避免上游取消导致技能执行（如 API 追踪）被中断。

#### 入口 2：生成技能 `GenerateSkillFromRuleChain`（`backend/internal/services/rulego/skill_gen.go`）

- **创建 Client**：由前端传入的 `baseURL`、`apiKey`、`model` 构造 `llm.Config`，`llm.NewClientWithSkills(ctx, cfg, []llm.Skill{*createSkill})`，仅暴露内置 create-skill。
- **消息**：手动拼接 systemPrompt（BuildSkillSystemPrompt）+ 一条 user（规则链信息与说明）。
- **调用**：`client.GenerateWithToolLoop(ctx, messages, tools, nil, executor, 4)`，executor 为 `createSkillExecutor`（解析 create-skill 参数并写入 SKILL.md、更新规则 SkillDirName）。
- **凭证**：当前未走模型管理，完全依赖前端传入；若希望与规则链执行“同一套凭证”，可后续增加按模型配置 ID 从模型管理拉取 baseURL/apiKey/model。

---

### 3. 数据流与配置来源

```
模型管理 (model_management.Service)
    → ListModelConfigs() → ruleGoLLMConfigLister.ListLLMConfigs(ctx)（Wails 绑定方法不使用 context 首参，避免与前端参数错位）
    → PatchDefinitionWithLLMKeys() 覆盖 ai/llm 节点 key（执行时）

ai/llm 节点配置 (DSL/前端)
    → url, key, model, systemPrompt, messages, params, enabled_skill_names
    → 执行前 key 可被模型管理覆盖

生成技能 (前端入参)
    → baseURL, apiKey, model（当前未与模型管理打通）
```

---

## 二、已满足的“一套底层逻辑”

- 所有 LLM 调用都通过 **`backend/internal/llm`** 的 Client 与 Generate* / Chat* 接口。
- 规则链内 ai/llm 与「模型管理」通过 PatchDefinitionWithLLMKeys 使用同一套 API Key。
- 技能加载、系统提示、Tool 循环、SkillExecutor 均在同一包内实现，无重复的 openai/langchaingo 封装。

---

## 三、可优化点与建议

### 1. 占位符替换逻辑统一

- **现状**：`llm/node_config.go` 内有未导出的 `replacePlaceholders(s, m)`，供 `BuildMessageContentFromNodeConfig` 使用；`rulego/node_llm.go` 内有一份逻辑相同的 `replacePlaceholders(s, m)` 用于 systemPrompt。
- **建议**：在 `llm` 包中导出 `ReplacePlaceholders(s string, m map[string]string) string`，`BuildMessageContentFromNodeConfig` 与 `node_llm.go` 均改为调用该函数，去掉重复实现。

### 2. 系统+用户消息构建复用

- **现状**：`skill_gen.go` 里手动 append system 与 user 两条 `MessageContent`；与 `client.ChatWithSystem` 的拼装方式一致，但未复用。
- **建议**：在 `llm` 包中增加 `BuildSystemUserMessages(systemPrompt, userMessage string) []llms.MessageContent`，供 skill_gen 与未来其他“仅需 system+user”的调用方使用，减少重复并统一风格。

### 3. 错误信息用户侧展示统一

- **现状**：`skill_gen.go` 的 `formatLLMError` 将底层错误转为对用户更友好的提示（如 401/400/502 等）。
- **建议**：将此类逻辑抽到 `llm` 包，例如 `FormatErrorForUser(err error) error`，供 skill_gen 与后续任何直接面向用户的 LLM 调用（如其它 API）复用。

### 4. 生成技能与模型管理凭证统一（可选）

- **现状**：生成技能所需 baseURL/apiKey/model 完全由前端传入，未从模型管理拉取。
- **建议**：若产品上希望“生成技能”与“规则链内 ai/llm”使用同一套凭证，可为 `GenerateSkillFromRuleChain` 增加可选参数（如 `modelConfigID`），在 backend 通过现有 `LLMConfigLister` 解析出 baseURL/apiKey/model 再创建 Client，前端可优先选择“当前选中的模型配置”传入，减少重复配置与 401 不一致问题。

### 5. Context 使用

- **现状**：ai/llm 节点为长耗时技能执行使用 `context.Background()`，有注释说明；skill_gen 使用 `context.Background()` 合理。
- **建议**：保持现状；若未来有请求级超时需求，可在 RuleGo 或 skill_gen 层传入带 timeout 的 context，仍由同一套 Client 接口完成调用。

---

## 四、小结

- **底层已统一**：全服务 LLM 调用均经 `backend/internal/llm`，一套 Client、Generate*、Skill、Tool 逻辑。
- **优化方向**：统一占位符替换、抽系统+用户消息构建、统一 LLM 错误转用户提示；可选地让生成技能走模型管理凭证。按上述建议小步重构即可在保持行为不变的前提下提升可维护性与一致性。
