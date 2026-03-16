package llm

import "strings"

// MCP 相关能力说明（与 claude-code / openclaw 中的 MCP 用法对应）：
//
// 1) MCP（Model Context Protocol）用于让 LLM 调用外部工具（tools）、访问资源（resources）和提示模板（prompts）。
// 2) 本组件通过 Config.MCP 声明 MCP 服务器（如 stdio 命令或 URL）。实际与 MCP 通信需在业务层集成 MCP Go SDK：
//    - 官方: github.com/modelcontextprotocol/go-sdk
//    - 或:   github.com/mark3labs/mcp-go
// 3) 典型流程：根据 MCPConfig 启动或连接 MCP 服务 -> 拉取 tools 列表 -> 将 tools 转为 langchaingo 的 llms.Tool 传入 GenerateContent 的 CallOption。
//
// 以下提供将 MCP 工具描述注入系统提示的辅助方法，便于在不使用 langchaingo 工具调用时，仍能让模型“知道”有哪些工具可用。

// MCPToolDescription 描述一个 MCP 工具的 name 与 description，可用于拼接到系统提示。
type MCPToolDescription struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	InputSchema string `json:"input_schema,omitempty"` // JSON schema 字符串，可选
}

// BuildMCPToolsSystemPrompt 将 MCP 工具列表拼成一段系统提示，告知模型可用工具及用法。
func BuildMCPToolsSystemPrompt(tools []MCPToolDescription) string {
	if len(tools) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("## Available MCP tools\n\n")
	for _, t := range tools {
		b.WriteString("- **")
		b.WriteString(t.Name)
		b.WriteString("**: ")
		b.WriteString(t.Description)
		if t.InputSchema != "" {
			b.WriteString("\n  Input schema: ")
			b.WriteString(t.InputSchema)
		}
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}
