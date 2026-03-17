package llm

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// MCP 相关能力说明（与 claude-code / openclaw 中的 MCP 用法对应）：
//
// 1) MCP（Model Context Protocol）用于让 LLM 调用外部工具（tools）、访问资源（resources）和提示模板（prompts）。
// 2) 本组件通过 Config.MCP 声明 MCP 服务器（如 stdio 命令或 URL）。实际与 MCP 通信需在业务层集成 MCP Go SDK：
//    - 官方: github.com/modelcontextprotocol/go-sdk
//    - 或:   github.com/mark3labs/mcp-go
// 3) 典型流程：根据 MCPConfig 启动或连接 MCP 服务 -> 拉取 tools 列表 -> 将 tools 转为 llms.Tool -> 使用
//    Client.GenerateWithToolLoop 传入 tools 与 ToolExecutor，当模型返回 tool_calls 时自动执行并继续对话。
//
// ToolExecutor 由业务层实现（如通过 MCP SDK 的 CallTool），使“模型识别到该调用时”能真正执行。

// MCPToolDescription 描述一个 MCP 工具的 name 与 description，可用于拼接到系统提示。
type MCPToolDescription struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	InputSchema string `json:"input_schema,omitempty"` // JSON schema 字符串，可选
}

// ToolExecutor 执行单次工具调用（可由 MCP SDK 或其它实现提供）。当模型返回 tool_calls 时，
// GenerateWithToolLoop 会按 name/arguments 调用 Execute，将结果回传给模型继续生成。
type ToolExecutor interface {
	Execute(ctx context.Context, name, arguments string) (content string, err error)
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

// MCPToolDescriptionsFromLangchainTools 将 langchaingo 的 llms.Tool 转为 MCPToolDescription 列表，便于注入系统提示。
func MCPToolDescriptionsFromLangchainTools(tools []llms.Tool) []MCPToolDescription {
	out := make([]MCPToolDescription, 0, len(tools))
	for _, t := range tools {
		if t.Function == nil {
			continue
		}
		desc := MCPToolDescription{Name: t.Function.Name, Description: t.Function.Description}
		if t.Function.Parameters != nil {
			if b, err := json.Marshal(t.Function.Parameters); err == nil {
				desc.InputSchema = string(b)
			}
		}
		out = append(out, desc)
	}
	return out
}
