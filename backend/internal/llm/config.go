package llm

// Config 自定义 LLM 组件配置（兼容 OpenAI API 的第三方服务）。
// 除基础 baseUrl/apiKey/model 外，支持加载 skill 与 MCP 能力。
type Config struct {
	// BaseURL 兼容 OpenAI 的 API 根地址，如 https://api.openai.com/v1 或自建代理
	BaseURL string `json:"base_url"`
	// APIKey 认证密钥
	APIKey string `json:"api_key"`
	// Model 模型名称，如 gpt-4o、gpt-3.5-turbo、deepseek-chat 等
	Model string `json:"model"`

	// SkillDir 技能目录路径。目录下可放置多个子目录，每个子目录包含 SKILL.md（参考 claude-code/openclaw 的 SKILL 格式）
	// 加载后会在对话时按需或全部注入为系统上下文
	SkillDir string `json:"skill_dir,omitempty"`
	// MCP MCP（Model Context Protocol）配置，用于声明要使用的 MCP 服务器及其工具
	MCP *MCPConfig `json:"mcp,omitempty"`

	// 以下为可选生成参数
	// MaxTokens 单次回复最大 token 数，0 表示使用模型默认
	MaxTokens int `json:"max_tokens,omitempty"`
	// Temperature 采样温度 [0, 2]，0 表示更确定，越大越随机
	Temperature float64 `json:"temperature,omitempty"`
}

// ChatMessage 与 RuleGo 官方 LLM 节点一致的消息结构，见 https://rulego.cc/pages/llm/
type ChatMessage struct {
	Role    string `json:"role"`    // user 或 assistant
	Content string `json:"content"` // 消息内容，可使用 ${} 占位符
}

// Params 大模型参数，与 RuleGo 官方 LLM 节点 Params 结构一致，见 https://rulego.cc/pages/llm/#大模型参数-params-结构
type Params struct {
	Temperature      float32   `json:"temperature"`      // 采样温度 [0.0, 2.0]，默认 0
	TopP             float32   `json:"topP"`             // 采样方法 [0.0, 1.0]
	PresencePenalty  float32   `json:"presencePenalty"`  // 对已有标记的惩罚 [0.0, 1.0]
	FrequencyPenalty float32   `json:"frequencyPenalty"` // 对重复标记的惩罚 [0.0, 1.0]
	MaxTokens        int       `json:"maxTokens"`        // 最大输出长度
	Stop             []string  `json:"stop"`             // 停止输出标记
	ResponseFormat   string    `json:"responseFormat"`   // text / json_object / json_schema
	JSONSchema       string    `json:"jsonSchema"`       // JSON Schema（responseFormat=json_schema 时）
	KeepThink        bool      `json:"keepThink"`        // 是否保留思考过程（仅 text 格式）
}

// NodeConfig RuleGo ai/llm 节点配置，与官方文档字段一致，见 https://rulego.cc/pages/llm/
// 同时保留 skill_dir、mcp 扩展。
type NodeConfig struct {
	URL          string        `json:"url"`                    // 请求地址，默认 https://ai.gitee.com/v1
	Key          string        `json:"key"`                    // API Key
	Model        string        `json:"model"`                  // 模型名称
	SystemPrompt string        `json:"systemPrompt"`          // 系统提示，支持 ${} 占位符
	Messages     []ChatMessage `json:"messages"`               // 上下文/用户消息列表
	Images       []string     `json:"images"`                  // 图片 URL 列表（可选，多模态）
	Params       *Params       `json:"params"`                 // 大模型参数
	SkillDir     string        `json:"skill_dir,omitempty"`    // 扩展：技能目录
	MCP          *MCPConfig    `json:"mcp,omitempty"`         // 扩展：MCP 配置
}

// MCPConfig 描述 MCP 服务器配置，便于 LLM 调用 MCP 暴露的 tools/resources。
// 实际与 MCP 服务器通信需配合 MCP Go SDK（如 modelcontextprotocol/go-sdk 或 mark3labs/mcp-go）。
type MCPConfig struct {
	// ServerCommand 通过 stdio 启动的 MCP 服务命令，如 ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path"]
	ServerCommand []string `json:"server_command,omitempty"`
	// ServerURL 若使用 HTTP/SSE 等传输，可填服务器 URL
	ServerURL string `json:"server_url,omitempty"`
	// Env 启动 MCP 进程时的环境变量，如 API 密钥
	Env map[string]string `json:"env,omitempty"`
	// ToolNames 仅启用部分工具时填写名称列表，为空表示使用全部
	ToolNames []string `json:"tool_names,omitempty"`
}
