package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// ChatHistoryEntry 持久化与 IPC 用的对话条目（user / assistant 文本轮次）
type ChatHistoryEntry struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

const (
	maxMemoryMessages = 80 // 约 40 轮 user+assistant，控制 token
)

func sanitizeAgentIDForFile(id string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', ':', '<', '>', '|', '?', '*':
			return '_'
		default:
			return r
		}
	}, id)
}

// agentMemoryFilePath 全局聊天会话：~/.devpilot/agent-memory/<id>.json
func agentMemoryFilePath(agentID string) string {
	return agentMemoryFilePathForSession(agentID, "")
}

// agentMemoryFilePathForSession studioID 为空为「聊天」页全局会话；非空为某工作室内该 Agent 的独立会话（与 OpenClaw 多 session 一致）
func agentMemoryFilePathForSession(agentID, studioID string) string {
	studioID = strings.TrimSpace(studioID)
	if agentID == "" {
		return ""
	}
	dir := globalAgentMemoryDir()
	if dir == "" {
		return ""
	}
	safeAgent := sanitizeAgentIDForFile(agentID)
	if studioID == "" {
		return filepath.Join(dir, safeAgent+".json")
	}
	safeStudio := sanitizeAgentIDForFile(studioID)
	return filepath.Join(dir, "studio_"+safeStudio+"_"+safeAgent+".json")
}

// DeleteAllSessionMemoryFilesForAgent 删除该 Agent 的全局会话与所有 studio_*_<agent>.json 及摘要
func DeleteAllSessionMemoryFilesForAgent(agentID string) {
	if agentID == "" {
		return
	}
	dir := globalAgentMemoryDir()
	if dir == "" {
		return
	}
	safe := sanitizeAgentIDForFile(agentID)
	globalPath := filepath.Join(dir, safe+".json")
	deleteAgentMemoryFile(globalPath)
	deleteMemorySummaryFile(memorySummaryFilePath(globalPath))
	pattern := filepath.Join(dir, "studio_*_"+safe+".json")
	matches, _ := filepath.Glob(pattern)
	for _, m := range matches {
		deleteAgentMemoryFile(m)
		deleteMemorySummaryFile(memorySummaryFilePath(m))
	}
}

func projectScopedAgentMemoryFilePath(projectRoot, agentID string) string {
	if agentID == "" {
		return ""
	}
	pdir, err := AgentProjectPersistDir(projectRoot)
	if err != nil || pdir == "" {
		return ""
	}
	return filepath.Join(pdir, "agent-memory", sanitizeAgentIDForFile(agentID)+".json")
}

// migrationMemoryCandidatePaths 旧版记忆文件路径（按尝试顺序；不含全局路径）
func migrationMemoryCandidatePaths(projectRoot, agentID string) []string {
	seen := make(map[string]struct{})
	var out []string
	add := func(p string) {
		if p == "" {
			return
		}
		if _, ok := seen[p]; ok {
			return
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	if projectRoot != "" {
		add(legacyAgentMemoryFilePath(projectRoot, agentID))
		add(projectScopedAgentMemoryFilePath(projectRoot, agentID))
	}
	add(findLatestProjectScopedMemoryFile(agentID))
	return out
}

func legacyAgentMemoryFilePath(projectRoot, agentID string) string {
	base := legacyDevPilotDir(projectRoot)
	if base == "" || agentID == "" {
		return ""
	}
	return filepath.Join(base, "agent-memory", sanitizeAgentIDForFile(agentID)+".json")
}

func loadChatHistoryFromFile(path string) ([]llms.MessageContent, error) {
	if path == "" {
		return nil, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var entries []ChatHistoryEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	out := make([]llms.MessageContent, 0, len(entries))
	for _, e := range entries {
		role := strings.ToLower(strings.TrimSpace(e.Role))
		var llmRole llms.ChatMessageType
		switch role {
		case "user", "human":
			llmRole = llms.ChatMessageTypeHuman
		case "assistant", "ai":
			llmRole = llms.ChatMessageTypeAI
		default:
			continue
		}
		if e.Content == "" {
			continue
		}
		out = append(out, llms.MessageContent{
			Role:  llmRole,
			Parts: []llms.ContentPart{llms.TextContent{Text: e.Content}},
		})
	}
	return out, nil
}

func saveChatHistoryToFile(path string, memory []llms.MessageContent) error {
	if path == "" {
		return nil
	}
	entries := memoryToEntries(memory)
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func deleteAgentMemoryFile(path string) {
	if path == "" {
		return
	}
	_ = os.Remove(path)
}

// memorySummaryFilePath 与 agent-memory/<id>.json 同目录，滚动摘要文本
func memorySummaryFilePath(memoryJSONPath string) string {
	if memoryJSONPath == "" {
		return ""
	}
	base := strings.TrimSuffix(memoryJSONPath, filepath.Ext(memoryJSONPath))
	return base + "-summary.txt"
}

func loadMemorySummaryFromFile(path string) string {
	if path == "" {
		return ""
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func saveMemorySummaryFile(path, text string) error {
	if path == "" {
		return nil
	}
	if strings.TrimSpace(text) == "" {
		_ = os.Remove(path)
		return nil
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(text), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func deleteMemorySummaryFile(path string) {
	if path == "" {
		return
	}
	_ = os.Remove(path)
}

func memoryToEntries(memory []llms.MessageContent) []ChatHistoryEntry {
	entries := make([]ChatHistoryEntry, 0, len(memory))
	for _, m := range memory {
		var text string
		for _, p := range m.Parts {
			if tc, ok := p.(llms.TextContent); ok {
				text += tc.Text
			}
		}
		if text == "" {
			continue
		}
		switch m.Role {
		case llms.ChatMessageTypeHuman:
			entries = append(entries, ChatHistoryEntry{Role: "user", Content: text})
		case llms.ChatMessageTypeAI:
			entries = append(entries, ChatHistoryEntry{Role: "assistant", Content: text})
		default:
			continue
		}
	}
	return entries
}

func trimMemory(memory []llms.MessageContent) []llms.MessageContent {
	if len(memory) <= maxMemoryMessages {
		return memory
	}
	return memory[len(memory)-maxMemoryMessages:]
}

func cloneMessageSlice(src []llms.MessageContent) []llms.MessageContent {
	if len(src) == 0 {
		return nil
	}
	out := make([]llms.MessageContent, len(src))
	copy(out, src)
	return out
}
