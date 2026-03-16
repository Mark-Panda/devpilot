// Package llm 提供基于 langchaingo 的自定义 LLM 组件，支持：
//
//   - 基础参数：BaseURL、APIKey、Model（兼容 OpenAI API 的第三方服务）
//   - Skill 加载：从指定目录加载 SKILL.md（格式参考 claude-code / openclaw 的 Universal Skill Loader），
//     按 name/description 解析，并可将描述或完整内容注入系统提示
//   - MCP 配置：通过 Config.MCP 声明 MCP 服务器；实际调用 MCP 工具需在业务层集成 MCP Go SDK，
//     或将工具描述通过 BuildMCPToolsSystemPrompt 注入系统提示
//
// 使用示例：
//
//	cfg := llm.Config{
//	    BaseURL:  "https://api.openai.com/v1",
//	    APIKey:   "sk-xxx",
//	    Model:    "gpt-4o",
//	    SkillDir: "/path/to/skills",
//	}
//	client, err := llm.NewClient(ctx, cfg)
//	if err != nil { ... }
//	reply, err := client.Chat(ctx, "你好")
package llm
