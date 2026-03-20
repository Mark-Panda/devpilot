package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"

	"devpilot/backend/internal/llm"

	mcpclient "github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/rs/zerolog/log"
	"github.com/tmc/langchaingo/llms"
)

var mcpToolNameSanitize = regexp.MustCompile(`[^a-zA-Z0-9_]+`)

func mcpToolFuncName(serverID, toolName string) string {
	a := mcpToolNameSanitize.ReplaceAllString(serverID, "_")
	b := mcpToolNameSanitize.ReplaceAllString(toolName, "_")
	a = strings.Trim(a, "_")
	b = strings.Trim(b, "_")
	if a == "" {
		a = "srv"
	}
	if b == "" {
		b = "tool"
	}
	return "mcp_" + a + "__" + b
}

func mcpToolInputParams(t mcp.Tool) map[string]any {
	defaultObj := map[string]any{"type": "object"}
	if len(t.RawInputSchema) > 0 {
		var m map[string]any
		if err := json.Unmarshal(t.RawInputSchema, &m); err == nil && len(m) > 0 {
			return m
		}
	}
	b, err := json.Marshal(t.InputSchema)
	if err != nil {
		return defaultObj
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil || len(m) == 0 {
		return defaultObj
	}
	return m
}

func mcpToolToLLM(serverID string, t mcp.Tool, llmName string) llms.Tool {
	desc := strings.TrimSpace(t.Description)
	if desc == "" {
		desc = "MCP tool"
	}
	desc += fmt.Sprintf(" [MCP:%s / %s]", serverID, t.Name)
	return llms.Tool{
		Type: "function",
		Function: &llms.FunctionDefinition{
			Name:        llmName,
			Description: desc,
			Parameters:  mcpToolInputParams(t),
		},
	}
}

func mergeProcessEnv(extra map[string]string) []string {
	if len(extra) == 0 {
		return nil
	}
	base := os.Environ()
	for k, v := range extra {
		base = append(base, k+"="+v)
	}
	return base
}

func connectOneMCP(ctx context.Context, def MCPServerDefinition) (*mcpclient.Client, error) {
	if u := strings.TrimSpace(def.ServerURL); u != "" {
		c, err := mcpclient.NewSSEMCPClient(u)
		if err != nil {
			return nil, err
		}
		if err := c.Start(ctx); err != nil {
			_ = c.Close()
			return nil, fmt.Errorf("mcp sse start: %w", err)
		}
		return c, nil
	}
	parts := def.ServerCommand
	var nonEmpty []string
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			nonEmpty = append(nonEmpty, p)
		}
	}
	if len(nonEmpty) == 0 {
		return nil, fmt.Errorf("server_command 为空")
	}
	cmd := nonEmpty[0]
	args := nonEmpty[1:]
	env := mergeProcessEnv(def.Env)
	c, err := mcpclient.NewStdioMCPClientWithOptions(cmd, env, args)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func mcpInitialize(ctx context.Context, cli *mcpclient.Client) error {
	req := mcp.InitializeRequest{}
	req.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	req.Params.ClientInfo = mcp.Implementation{Name: "devpilot", Version: "0.1.0"}
	req.Params.Capabilities = mcp.ClientCapabilities{}
	_, err := cli.Initialize(ctx, req)
	return err
}

type mcpToolRoute struct {
	client *mcpclient.Client
	orig   string
}

func toolNameAllowed(def MCPServerDefinition, toolName string) bool {
	if len(def.ToolNames) == 0 {
		return true
	}
	for _, n := range def.ToolNames {
		if n == toolName {
			return true
		}
	}
	return false
}

// attachMCPForAgent 按 server id 连接 MCP，合并工具定义；cleanup 须 defer 调用。
func attachMCPForAgent(ctx context.Context, projectRoot string, serverIDs []string) (
	tools []llms.Tool,
	route map[string]mcpToolRoute,
	cleanup func(),
	err error,
) {
	route = make(map[string]mcpToolRoute)
	cleanup = func() {}

	if len(serverIDs) == 0 {
		return nil, route, cleanup, nil
	}
	doc, err := loadMCPServersDoc(projectRoot)
	if err != nil {
		return nil, nil, func() {}, err
	}
	byID := mcpDefinitionsByID(doc)

	var closers []*mcpclient.Client
	seenClose := make(map[*mcpclient.Client]struct{})

	registerCloser := func(c *mcpclient.Client) {
		if c == nil {
			return
		}
		if _, ok := seenClose[c]; ok {
			return
		}
		seenClose[c] = struct{}{}
		closers = append(closers, c)
	}

	cleanup = func() {
		for _, c := range closers {
			_ = c.Close()
		}
	}

	for _, sid := range serverIDs {
		def, ok := byID[sid]
		if !ok || !def.Enabled {
			continue
		}
		cli, connErr := connectOneMCP(ctx, def)
		if connErr != nil {
			log.Warn().Err(connErr).Str("mcp_id", sid).Msg("mcp connect failed")
			continue
		}
		if initErr := mcpInitialize(ctx, cli); initErr != nil {
			log.Warn().Err(initErr).Str("mcp_id", sid).Msg("mcp initialize failed")
			_ = cli.Close()
			continue
		}
		registerCloser(cli)
		tl, listErr := cli.ListTools(ctx, mcp.ListToolsRequest{})
		if listErr != nil {
			log.Warn().Err(listErr).Str("mcp_id", sid).Msg("mcp list tools failed")
			continue
		}
		for _, t := range tl.Tools {
			if !toolNameAllowed(def, t.Name) {
				continue
			}
			llmName := mcpToolFuncName(sid, t.Name)
			if _, dup := route[llmName]; dup {
				llmName = mcpToolFuncName(sid+"_x", t.Name)
			}
			route[llmName] = mcpToolRoute{client: cli, orig: t.Name}
			tools = append(tools, mcpToolToLLM(sid, t, llmName))
		}
	}

	return tools, route, cleanup, nil
}

func formatCallToolResult(res *mcp.CallToolResult) string {
	if res == nil {
		return ""
	}
	var parts []string
	if res.IsError {
		parts = append(parts, "[MCP tool error]")
	}
	for _, c := range res.Content {
		switch v := c.(type) {
		case mcp.TextContent:
			parts = append(parts, v.Text)
		default:
			if b, err := json.Marshal(c); err == nil {
				parts = append(parts, string(b))
			}
		}
	}
	if res.StructuredContent != nil {
		if b, err := json.Marshal(res.StructuredContent); err == nil {
			parts = append(parts, string(b))
		}
	}
	if len(parts) == 0 {
		return "(empty MCP result)"
	}
	return strings.Join(parts, "\n")
}

func callMCPTool(ctx context.Context, cli *mcpclient.Client, origName, arguments string) (string, error) {
	var args any
	s := strings.TrimSpace(arguments)
	if s != "" {
		if err := json.Unmarshal([]byte(s), &args); err != nil {
			args = map[string]any{"input": s}
		}
	}
	req := mcp.CallToolRequest{}
	req.Params.Name = origName
	req.Params.Arguments = args
	res, err := cli.CallTool(ctx, req)
	if err != nil {
		return "", err
	}
	return formatCallToolResult(res), nil
}

// compositeToolExecutor 先走技能，再走 MCP 工具。
type compositeToolExecutor struct {
	skill llm.ToolExecutor
	mcp   map[string]mcpToolRoute
}

func (e *compositeToolExecutor) Execute(ctx context.Context, name, arguments string) (string, error) {
	if e.skill != nil {
		out, err := e.skill.Execute(ctx, name, arguments)
		if err == nil {
			return out, nil
		}
		if !errors.Is(err, llm.ErrSkillNotFound) {
			return out, err
		}
	}
	if r, ok := e.mcp[name]; ok {
		return callMCPTool(ctx, r.client, r.orig, arguments)
	}
	return "", llm.ErrSkillNotFound
}

func newCompositeToolExecutor(skill llm.ToolExecutor, mcpRoutes map[string]mcpToolRoute) llm.ToolExecutor {
	if skill == nil && len(mcpRoutes) == 0 {
		return nil
	}
	return &compositeToolExecutor{skill: skill, mcp: mcpRoutes}
}

// resolvedMCPServerIDs 主 Agent 使用全部已启用服务；其它 Agent 仅使用其 mcp_servers 与配置的交集。
func resolvedMCPServerIDs(root string, agentType AgentType, selected []string) []string {
	doc, err := loadMCPServersDoc(root)
	if err != nil || len(doc.Servers) == 0 {
		return nil
	}
	enabled := make([]MCPServerDefinition, 0, len(doc.Servers))
	for _, s := range doc.Servers {
		if !s.Enabled || strings.TrimSpace(s.ID) == "" {
			continue
		}
		if !mcpServerRunnable(s) {
			continue
		}
		enabled = append(enabled, s)
	}
	if agentType == AgentTypeMain {
		ids := make([]string, 0, len(enabled))
		for _, s := range enabled {
			ids = append(ids, s.ID)
		}
		return ids
	}
	sel := make(map[string]struct{}, len(selected))
	for _, id := range selected {
		id = strings.TrimSpace(id)
		if id != "" {
			sel[id] = struct{}{}
		}
	}
	var out []string
	for _, s := range enabled {
		if _, ok := sel[s.ID]; ok {
			out = append(out, s.ID)
		}
	}
	return out
}

func mcpServerRunnable(s MCPServerDefinition) bool {
	if strings.TrimSpace(s.ServerURL) != "" {
		return true
	}
	for _, p := range s.ServerCommand {
		if strings.TrimSpace(p) != "" {
			return true
		}
	}
	return false
}
