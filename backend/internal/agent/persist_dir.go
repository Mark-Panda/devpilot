package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// AgentGlobalDataDir 返回 ~/.devpilot。
// agents.json、mcp.json、agent-memory/ 等 Agent 全局数据均在此目录下（与 Pebble、skills 并列）。
// 未来「工作室 / workspace」可将多 Agent 空间放在例如 ~/.devpilot/workspaces/<id>/（另行实现）。
func AgentGlobalDataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".devpilot"), nil
}

func agentGlobalDataDirOrEmpty() string {
	d, _ := AgentGlobalDataDir()
	return d
}

// AgentProjectPersistDir 旧版按项目哈希分目录：~/.devpilot/projects/<key>/（仅用于读取迁移，不再作为写入目标）
func AgentProjectPersistDir(projectRoot string) (string, error) {
	t := strings.TrimSpace(projectRoot)
	if t == "" {
		return "", fmt.Errorf("project root is empty")
	}
	abs, err := filepath.Abs(filepath.Clean(t))
	if err != nil {
		return "", err
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	h := sha256.Sum256([]byte(abs))
	key := hex.EncodeToString(h[:12])
	base := filepath.Base(abs)
	safe := sanitizeProjectDirSegment(base)
	return filepath.Join(home, ".devpilot", "projects", key+"_"+safe), nil
}

func sanitizeProjectDirSegment(s string) string {
	s = strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', ':', '<', '>', '|', '?', '*', '"':
			return '-'
		}
		if r < 32 || r > 126 {
			return '-'
		}
		return r
	}, strings.TrimSpace(s))
	if s == "" || s == "." {
		return "project"
	}
	if len(s) > 80 {
		s = s[:80]
	}
	return s
}

// legacyDevPilotDir 仓库内 <项目根>/.devpilot/（迁移用）
func legacyDevPilotDir(projectRoot string) string {
	t := strings.TrimSpace(projectRoot)
	if t == "" {
		return ""
	}
	abs, err := filepath.Abs(filepath.Clean(t))
	if err != nil {
		abs = t
	}
	return filepath.Join(abs, ".devpilot")
}

func globalAgentsRegistryPath() string {
	base := agentGlobalDataDirOrEmpty()
	if base == "" {
		return ""
	}
	return filepath.Join(base, "agents.json")
}

func globalMcpConfigPath() string {
	base := agentGlobalDataDirOrEmpty()
	if base == "" {
		return ""
	}
	return filepath.Join(base, "mcp.json")
}

// globalStudiosPath ~/.devpilot/studios.json
func globalStudiosPath() string {
	base := agentGlobalDataDirOrEmpty()
	if base == "" {
		return ""
	}
	return filepath.Join(base, "studios.json")
}

func globalAgentMemoryDir() string {
	base := agentGlobalDataDirOrEmpty()
	if base == "" {
		return ""
	}
	return filepath.Join(base, "agent-memory")
}

func projectScopedAgentsRegistryPath(projectRoot string) string {
	dir, err := AgentProjectPersistDir(projectRoot)
	if err != nil || dir == "" {
		return ""
	}
	return filepath.Join(dir, "agents.json")
}

func projectScopedMcpConfigPath(projectRoot string) string {
	dir, err := AgentProjectPersistDir(projectRoot)
	if err != nil || dir == "" {
		return ""
	}
	return filepath.Join(dir, "mcp.json")
}

func latestModTimePath(paths []string) string {
	var best string
	var bestT time.Time
	for _, p := range paths {
		st, err := os.Stat(p)
		if err != nil {
			continue
		}
		if st.ModTime().After(bestT) {
			bestT = st.ModTime()
			best = p
		}
	}
	return best
}

func findLatestProjectsAgentsJSON() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	pattern := filepath.Join(home, ".devpilot", "projects", "*", "agents.json")
	matches, _ := filepath.Glob(pattern)
	return latestModTimePath(matches)
}

func findLatestProjectsMCPJSON() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	pattern := filepath.Join(home, ".devpilot", "projects", "*", "mcp.json")
	matches, _ := filepath.Glob(pattern)
	return latestModTimePath(matches)
}

func findLatestProjectScopedMemoryFile(agentID string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	name := sanitizeAgentIDForFile(agentID) + ".json"
	pattern := filepath.Join(home, ".devpilot", "projects", "*", "agent-memory", name)
	matches, _ := filepath.Glob(pattern)
	return latestModTimePath(matches)
}
