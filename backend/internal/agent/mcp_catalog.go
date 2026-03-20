package agent

// ListMCPServerPresets 返回 ~/.devpilot/mcp.json 中的全部 MCP（供 Agent 勾选展示；缺失时从旧路径迁移）。
func ListMCPServerPresets(projectRoot string) []MCPServerPreset {
	doc, err := loadMCPServersDoc(projectRoot)
	if err != nil || len(doc.Servers) == 0 {
		return []MCPServerPreset{}
	}
	out := make([]MCPServerPreset, 0, len(doc.Servers))
	for _, s := range doc.Servers {
		out = append(out, MCPServerPreset{
			ID:          s.ID,
			Name:        s.Name,
			Description: s.Description,
		})
	}
	return out
}
