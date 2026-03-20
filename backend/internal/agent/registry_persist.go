package agent

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/rs/zerolog/log"
)

const agentRegistryFileName = "agents.json"

type agentRegistryDoc struct {
	Version int           `json:"version"`
	Agents  []AgentConfig `json:"agents"`
}

func legacyAgentRegistryPath(projectRoot string) string {
	base := legacyDevPilotDir(projectRoot)
	if base == "" {
		return ""
	}
	return filepath.Join(base, agentRegistryFileName)
}

// loadAgentRegistry 读取全局 ~/.devpilot/agents.json；若不存在则依次尝试旧路径并迁移。
// projectRoot 仅用于迁移定位（当前工作区曾使用的 projects 分目录、仓库 .devpilot）。
func loadAgentRegistry(projectRoot string) ([]AgentConfig, error) {
	p := globalAgentsRegistryPath()
	if p == "" {
		return nil, nil
	}
	data, err := os.ReadFile(p)
	var fromLegacyPath string
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			tryPaths := []string{}
			if projectRoot != "" {
				if ps := projectScopedAgentsRegistryPath(projectRoot); ps != "" && ps != p {
					tryPaths = append(tryPaths, ps)
				}
				if lp := legacyAgentRegistryPath(projectRoot); lp != "" && lp != p {
					tryPaths = append(tryPaths, lp)
				}
			}
			if latest := findLatestProjectsAgentsJSON(); latest != "" && latest != p {
				tryPaths = append(tryPaths, latest)
			}
			for _, tp := range tryPaths {
				data, err = os.ReadFile(tp)
				if err == nil {
					fromLegacyPath = tp
					break
				}
			}
		}
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, nil
			}
			return nil, err
		}
	}
	var doc agentRegistryDoc
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	if len(doc.Agents) == 0 {
		return nil, nil
	}
	sorted := topoSortAgentConfigs(doc.Agents)
	if fromLegacyPath != "" {
		if err := saveAgentRegistry(sorted); err != nil {
			log.Warn().Err(err).Str("from", fromLegacyPath).Msg("migrate agents.json to ~/.devpilot failed")
		} else {
			log.Info().Str("from", fromLegacyPath).Msg("migrated agents.json to ~/.devpilot/agents.json")
		}
	}
	return sorted, nil
}

// saveAgentRegistry 写入 ~/.devpilot/agents.json
func saveAgentRegistry(configs []AgentConfig) error {
	p := globalAgentsRegistryPath()
	if p == "" {
		return nil
	}
	doc := agentRegistryDoc{Version: 1, Agents: configs}
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

// topoSortAgentConfigs 按 parent 先于 child 排序，供冷启动恢复时 CreateAgent。
func topoSortAgentConfigs(configs []AgentConfig) []AgentConfig {
	if len(configs) == 0 {
		return nil
	}
	byID := make(map[string]AgentConfig, len(configs))
	order := make([]string, 0, len(configs))
	for _, c := range configs {
		if c.ID == "" {
			continue
		}
		if _, dup := byID[c.ID]; dup {
			log.Warn().Str("agent_id", c.ID).Msg("skip duplicate agent id in registry")
			continue
		}
		byID[c.ID] = c
		order = append(order, c.ID)
	}
	added := make(map[string]bool, len(byID))
	out := make([]AgentConfig, 0, len(byID))
	for len(out) < len(byID) {
		n := len(out)
		for _, id := range order {
			if added[id] {
				continue
			}
			c := byID[id]
			if c.ParentID != "" {
				if _, has := byID[c.ParentID]; has && !added[c.ParentID] {
					continue
				}
			}
			out = append(out, c)
			added[id] = true
		}
		if len(out) == n {
			for _, id := range order {
				if !added[id] {
					log.Warn().Str("agent_id", id).Msg("agent registry: parent missing or cycle, restoring anyway")
					out = append(out, byID[id])
					added[id] = true
				}
			}
			break
		}
	}
	return out
}

func deleteAgentRegistry() {
	p := globalAgentsRegistryPath()
	if p == "" {
		return
	}
	_ = os.Remove(p)
}
