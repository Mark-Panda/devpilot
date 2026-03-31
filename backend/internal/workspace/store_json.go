package workspace

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"devpilot/backend/internal/agent"
)

const workspaceStoreFileVersion = 1

type workspaceStoreFileDoc struct {
	Version int                  `json:"version"`
	Items   map[string]Workspace `json:"items"`
	Order   []string             `json:"order"`
}

// WorkspaceStore 提供 Workspace 元数据持久化（单文件 JSON）。
// 注意：每个 workspaceRoot 下的 WORKSPACE.json 由 WorkspaceService 负责（本 Store 不写该文件）。
type WorkspaceStore interface {
	List() ([]Workspace, error)
	Get(id string) (Workspace, bool, error)
	Upsert(w Workspace) error
	Delete(id string) error
}

// JSONWorkspaceStore 将 Workspace 列表持久化到 <appData>/workspaces.json（当前 appData = ~/.devpilot）。
// 写入采用原子写：先写临时文件，再 rename 覆盖。
//
// 并发策略：
// - 文件读写锁：写入阶段全局串行；读取可并发，且不会读到半文件（rename 原子）。
type JSONWorkspaceStore struct {
	path string
	// fallbacks 是可选的备用读取路径（只读）。用于 dataDir 变更/迁移期间避免“重启后丢失”。
	// 约束：写入始终只写 s.path。
	fallbacks []string

	fileMu sync.RWMutex
}

func NewJSONWorkspaceStoreDefault() (*JSONWorkspaceStore, error) {
	base, err := agent.AgentGlobalDataDir()
	if err != nil {
		return nil, err
	}
	return NewJSONWorkspaceStoreAt(base), nil
}

// NewJSONWorkspaceStoreAt 使用指定 appData 目录（例如 ~/.devpilot）创建 store。
func NewJSONWorkspaceStoreAt(appDataDir string) *JSONWorkspaceStore {
	appDataDir = strings.TrimSpace(appDataDir)
	return &JSONWorkspaceStore{
		path: filepath.Join(appDataDir, "workspaces.json"),
	}
}

// NewJSONWorkspaceStoreAtWithFallbacks 使用指定 appDataDir 并追加若干 fallback appDataDir（只读）作为回退读取来源。
// 写入始终只写 primary appDataDir 下的 workspaces.json。
func NewJSONWorkspaceStoreAtWithFallbacks(appDataDir string, fallbackAppDataDirs ...string) *JSONWorkspaceStore {
	appDataDir = strings.TrimSpace(appDataDir)
	primary := filepath.Join(appDataDir, "workspaces.json")

	fallbacks := make([]string, 0, len(fallbackAppDataDirs))
	for _, d := range fallbackAppDataDirs {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}
		fp := filepath.Join(d, "workspaces.json")
		if filepath.Clean(fp) == filepath.Clean(primary) {
			continue
		}
		fallbacks = append(fallbacks, fp)
	}

	return &JSONWorkspaceStore{path: primary, fallbacks: fallbacks}
}

func (s *JSONWorkspaceStore) List() ([]Workspace, error) {
	s.fileMu.RLock()
	defer s.fileMu.RUnlock()

	doc, err := s.loadUnlocked()
	if err != nil {
		return nil, err
	}
	doc = reconcileWorkspaceStoreDoc(doc)
	out := make([]Workspace, 0, len(doc.Items))
	for _, id := range doc.Order {
		if w, ok := doc.Items[id]; ok {
			out = append(out, w)
		}
	}
	return out, nil
}

func (s *JSONWorkspaceStore) Get(id string) (Workspace, bool, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return Workspace{}, false, nil
	}

	s.fileMu.RLock()
	defer s.fileMu.RUnlock()

	doc, err := s.loadUnlocked()
	if err != nil {
		return Workspace{}, false, err
	}
	doc = reconcileWorkspaceStoreDoc(doc)
	w, ok := doc.Items[id]
	return w, ok, nil
}

func (s *JSONWorkspaceStore) Upsert(w Workspace) error {
	id := strings.TrimSpace(w.ID)
	if id == "" {
		return fmt.Errorf("workspace id 不能为空")
	}
	w.ID = id

	s.fileMu.Lock()
	defer s.fileMu.Unlock()

	doc, err := s.loadUnlocked()
	if err != nil {
		return err
	}
	doc = reconcileWorkspaceStoreDoc(doc)
	if doc.Items == nil {
		doc.Items = make(map[string]Workspace)
	}

	_, exists := doc.Items[id]
	doc.Items[id] = w
	if !containsString(doc.Order, id) {
		// 兼容：旧文件可能缺 order，或 order 不完整；确保新/旧 workspace 都能在 list 中可见
		doc.Order = append(doc.Order, id)
	} else if !exists {
		// 正常新增场景理论上不会走到这里（Order 已含 id），但保持逻辑稳健
	}

	return s.saveUnlocked(doc)
}

func (s *JSONWorkspaceStore) Delete(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}

	s.fileMu.Lock()
	defer s.fileMu.Unlock()

	doc, err := s.loadUnlocked()
	if err != nil {
		return err
	}
	doc = reconcileWorkspaceStoreDoc(doc)
	if doc.Items == nil {
		return nil
	}
	if _, ok := doc.Items[id]; !ok {
		return nil
	}
	delete(doc.Items, id)
	if len(doc.Order) > 0 {
		out := doc.Order[:0]
		for _, x := range doc.Order {
			if x != id {
				out = append(out, x)
			}
		}
		doc.Order = out
	}
	return s.saveUnlocked(doc)
}

func (s *JSONWorkspaceStore) loadUnlocked() (*workspaceStoreFileDoc, error) {
	doc := &workspaceStoreFileDoc{
		Version: workspaceStoreFileVersion,
		Items:   make(map[string]Workspace),
		Order:   nil,
	}
	if strings.TrimSpace(s.path) == "" {
		return nil, fmt.Errorf("workspaces.json path empty")
	}

	paths := append([]string{s.path}, s.fallbacks...)
	best, err := readBestWorkspaceStoreDoc(paths, doc)
	if err != nil {
		return nil, err
	}
	if best == nil {
		return doc, nil
	}
	doc = best
	if doc.Version == 0 {
		doc.Version = workspaceStoreFileVersion
	}
	if doc.Items == nil {
		doc.Items = make(map[string]Workspace)
	}
	return doc, nil
}

func readBestWorkspaceStoreDoc(paths []string, into *workspaceStoreFileDoc) (*workspaceStoreFileDoc, error) {
	type cand struct {
		path string
		mt   time.Time
	}

	seen := make(map[string]struct{}, len(paths))
	cands := make([]cand, 0, len(paths))
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		cp := filepath.Clean(p)
		if _, ok := seen[cp]; ok {
			continue
		}
		seen[cp] = struct{}{}
		st, err := os.Stat(cp)
		if err != nil {
			continue
		}
		if st.IsDir() {
			continue
		}
		cands = append(cands, cand{path: cp, mt: st.ModTime()})
	}

	// 优先读最近修改的文件（更符合“用户刚刚创建但 dataDir 改了”的直觉）。
	sort.Slice(cands, func(i, j int) bool { return cands[i].mt.After(cands[j].mt) })
	for _, c := range cands {
		b, err := os.ReadFile(c.path)
		if err != nil {
			continue
		}
		if len(strings.TrimSpace(string(b))) == 0 {
			continue
		}
		tmp := into
		if tmp == nil {
			tmp = &workspaceStoreFileDoc{}
		}
		*tmp = workspaceStoreFileDoc{Version: workspaceStoreFileVersion, Items: make(map[string]Workspace), Order: nil}
		if err := json.Unmarshal(b, tmp); err != nil {
			// 文件损坏则继续尝试其它候选（不要因为一个坏文件导致“全部丢失”）
			continue
		}
		return tmp, nil
	}

	// 如果 primary 存在但读不了，按原行为报错更利于排查；但此时上面已尝试其它候选。
	primary := ""
	if len(paths) > 0 {
		primary = strings.TrimSpace(paths[0])
	}
	if primary != "" {
		if b, err := os.ReadFile(primary); err == nil && len(strings.TrimSpace(string(b))) > 0 {
			// primary 有内容但无法解析，且其它候选也不可用
			return nil, fmt.Errorf("parse workspaces.json: %w", fmt.Errorf("no valid candidates (primary may be corrupted): %s", primary))
		}
	}

	return nil, nil
}

func (s *JSONWorkspaceStore) saveUnlocked(doc *workspaceStoreFileDoc) error {
	if strings.TrimSpace(s.path) == "" {
		return fmt.Errorf("workspaces.json path empty")
	}
	if doc == nil {
		return fmt.Errorf("doc is nil")
	}
	if doc.Items == nil {
		doc.Items = make(map[string]Workspace)
	}
	doc.Version = workspaceStoreFileVersion

	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	// 为了让 diff/排查更友好，保持缩进格式。
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}

	// 原子写：同目录写临时文件再 rename。
	tmp := fmt.Sprintf("%s.%d.tmp", s.path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		// rename 失败时避免遗留临时文件（尽力清理）
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func reconcileWorkspaceStoreDoc(doc *workspaceStoreFileDoc) *workspaceStoreFileDoc {
	if doc == nil {
		return &workspaceStoreFileDoc{
			Version: workspaceStoreFileVersion,
			Items:   make(map[string]Workspace),
			Order:   nil,
		}
	}
	if doc.Items == nil {
		doc.Items = make(map[string]Workspace)
	}

	seen := make(map[string]struct{}, len(doc.Items))
	out := make([]string, 0, len(doc.Items))

	// 保留既有顺序，但剔除不存在的 id 与重复项
	for _, id := range doc.Order {
		if _, ok := doc.Items[id]; !ok {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}

	// 补齐缺失项，按字典序保证确定性（避免 map 遍历顺序导致不稳定）
	if len(seen) != len(doc.Items) {
		missing := make([]string, 0, len(doc.Items)-len(seen))
		for id := range doc.Items {
			if _, ok := seen[id]; !ok {
				missing = append(missing, id)
			}
		}
		sort.Strings(missing)
		out = append(out, missing...)
	}

	doc.Order = out
	return doc
}

func containsString(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}
