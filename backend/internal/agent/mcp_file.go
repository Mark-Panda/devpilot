package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/rs/zerolog/log"
)

const mcpConfigFileName = "mcp.json"

// MCPServersDocument ~/.devpilot/mcp.json 根结构
type MCPServersDocument struct {
	Version int                   `json:"version"`
	Servers []MCPServerDefinition `json:"servers"`
}

func legacyMcpConfigPath(projectRoot string) string {
	base := legacyDevPilotDir(projectRoot)
	if base == "" {
		return ""
	}
	return filepath.Join(base, mcpConfigFileName)
}

// loadMCPServersDoc 读取全局 ~/.devpilot/mcp.json；不存在时尝试旧路径并迁移。
func loadMCPServersDoc(projectRoot string) (MCPServersDocument, error) {
	p := globalMcpConfigPath()
	if p == "" {
		return MCPServersDocument{}, fmt.Errorf("无法解析 ~/.devpilot 目录")
	}
	data, err := os.ReadFile(p)
	var fromLegacyPath string
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return MCPServersDocument{}, err
		}
		tryPaths := []string{}
		if projectRoot != "" {
			if ps := projectScopedMcpConfigPath(projectRoot); ps != "" && ps != p {
				tryPaths = append(tryPaths, ps)
			}
			if lp := legacyMcpConfigPath(projectRoot); lp != "" && lp != p {
				tryPaths = append(tryPaths, lp)
			}
		}
		if latest := findLatestProjectsMCPJSON(); latest != "" && latest != p {
			tryPaths = append(tryPaths, latest)
		}
		for _, tp := range tryPaths {
			data, err = os.ReadFile(tp)
			if err == nil {
				fromLegacyPath = tp
				break
			}
		}
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return MCPServersDocument{}, nil
			}
			return MCPServersDocument{}, err
		}
	}
	var doc MCPServersDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		return MCPServersDocument{}, err
	}
	if fromLegacyPath != "" && len(doc.Servers) > 0 {
		if err := saveMCPServersDoc(doc); err != nil {
			log.Warn().Err(err).Str("from", fromLegacyPath).Msg("migrate mcp.json to ~/.devpilot failed")
		} else {
			log.Info().Str("from", fromLegacyPath).Msg("migrated mcp.json to ~/.devpilot/mcp.json")
		}
	}
	return doc, nil
}

// saveMCPServersDoc 写入 ~/.devpilot/mcp.json
func saveMCPServersDoc(doc MCPServersDocument) error {
	p := globalMcpConfigPath()
	if p == "" {
		return fmt.Errorf("无法解析 ~/.devpilot 目录")
	}
	if doc.Version == 0 {
		doc.Version = 1
	}
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

func validateMCPServerDefinitions(servers []MCPServerDefinition) error {
	seen := make(map[string]struct{}, len(servers))
	for i, s := range servers {
		id := strings.TrimSpace(s.ID)
		if id == "" {
			return fmt.Errorf("servers[%d]: id 不能为空", i)
		}
		if _, dup := seen[id]; dup {
			return fmt.Errorf("重复的 MCP id: %s", id)
		}
		seen[id] = struct{}{}
		if !s.Enabled {
			continue
		}
		cmd := len(strings.TrimSpace(strings.Join(s.ServerCommand, " "))) > 0
		url := strings.TrimSpace(s.ServerURL) != ""
		if !cmd && !url {
			return fmt.Errorf("已启用的 MCP %q 需要配置 server_command 或 server_url", id)
		}
	}
	return nil
}

func mcpDefinitionsByID(doc MCPServersDocument) map[string]MCPServerDefinition {
	m := make(map[string]MCPServerDefinition, len(doc.Servers))
	for _, s := range doc.Servers {
		if strings.TrimSpace(s.ID) == "" {
			continue
		}
		m[s.ID] = s
	}
	return m
}
