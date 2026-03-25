package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// studioPartitionDir 工作室分区根目录：~/.devpilot/workspace/<studio_id>/
func studioPartitionDir(studioID string) (string, error) {
	studioID = strings.TrimSpace(studioID)
	if studioID == "" {
		return "", fmt.Errorf("studio id empty")
	}
	base, err := AgentGlobalDataDir()
	if err != nil {
		return "", err
	}
	safe := sanitizeAgentIDForFile(studioID)
	return filepath.Join(base, "workspace", safe), nil
}

// EnsureStudioPartition 创建工作室分区目录（创建工作室或首次在工作室内运行时调用）
func EnsureStudioPartition(studioID string) error {
	root, err := studioPartitionDir(studioID)
	if err != nil {
		return err
	}
	return os.MkdirAll(root, 0o755)
}

func studioAgentScopedDir(studioID, agentID string) (string, error) {
	root, err := studioPartitionDir(studioID)
	if err != nil {
		return "", err
	}
	safeAgent := sanitizeAgentIDForFile(agentID)
	if safeAgent == "" {
		return "", fmt.Errorf("agent id empty")
	}
	return filepath.Join(root, "agents", safeAgent), nil
}

// StudioAgentWorkDataDir 工作室内该 Agent 的默认文件工具根：.../agents/<agent>/workData/（不存在则创建）
func StudioAgentWorkDataDir(studioID, agentID string) (string, error) {
	agentDir, err := studioAgentScopedDir(studioID, agentID)
	if err != nil {
		return "", err
	}
	wd := filepath.Join(agentDir, "workData")
	if err := os.MkdirAll(wd, 0o755); err != nil {
		return "", err
	}
	abs, err := filepath.Abs(wd)
	if err != nil {
		return wd, nil
	}
	if sym, err := filepath.EvalSymlinks(abs); err == nil {
		return sym, nil
	}
	return abs, nil
}

// studioAgentMemoryPath 工作室内对话记忆：.../agents/<agent>/memory.json
func studioAgentMemoryPath(studioID, agentID string) string {
	studioID = strings.TrimSpace(studioID)
	agentID = strings.TrimSpace(agentID)
	if studioID == "" || agentID == "" {
		return ""
	}
	root, err := studioPartitionDir(studioID)
	if err != nil || root == "" {
		return ""
	}
	safeAgent := sanitizeAgentIDForFile(agentID)
	if safeAgent == "" {
		return ""
	}
	return filepath.Join(root, "agents", safeAgent, "memory.json")
}

// writeStudioPartitionMetadata 写入 studio.json（工作室名、主 Agent 等，便于人工浏览分区）
func writeStudioPartitionMetadata(st Studio) error {
	if err := EnsureStudioPartition(st.ID); err != nil {
		return err
	}
	root, err := studioPartitionDir(st.ID)
	if err != nil {
		return err
	}
	meta := map[string]string{
		"studio_id":       st.ID,
		"name":            st.Name,
		"main_agent_id":   st.MainAgentID,
		"created_at":      st.CreatedAt.UTC().Format(time.RFC3339),
		"partition_note":  "agent-memory、agent-config.json、workData 均在 agents/<agent_id>/ 下",
	}
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(root, "studio.json")
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// saveStudioAgentConfigSnapshot 将当前 Agent 配置快照写入分区（与全局 agents.json 同源字段，便于备份与排查）
func saveStudioAgentConfigSnapshot(studioID string, cfg AgentConfig) error {
	studioID = strings.TrimSpace(studioID)
	if studioID == "" || strings.TrimSpace(cfg.ID) == "" {
		return nil
	}
	agentDir, err := studioAgentScopedDir(studioID, cfg.ID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(agentDir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(agentDir, "agent-config.json")
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
