package workspace

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"

	"devpilot/backend/internal/agent"
	"github.com/google/uuid"
)

const (
	workspaceMetaFileName = "WORKSPACE.json"
	workspaceProjectsDir  = "projects"
	workspaceScratchDir   = "scratch"
)

// WorkspaceService 管理 workspaceRoot、WORKSPACE.json 与 store(workspaces.json)。
type WorkspaceService struct {
	store WorkspaceStore

	appDataDir string
	locks      *keyedLocks
}

func NewWorkspaceServiceDefault() (*WorkspaceService, error) {
	base, err := agent.AgentGlobalDataDir()
	if err != nil {
		return nil, err
	}
	store, err := NewJSONWorkspaceStoreDefault()
	if err != nil {
		return nil, err
	}
	return NewWorkspaceService(store, base), nil
}

func NewWorkspaceService(store WorkspaceStore, appDataDir string) *WorkspaceService {
	return &WorkspaceService{
		store:      store,
		appDataDir: strings.TrimSpace(appDataDir),
		locks:      newKeyedLocks(),
	}
}

func (s *WorkspaceService) CreateWorkspace(name string) (Workspace, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Workspace{}, fmt.Errorf("workspace name 不能为空")
	}

	id := uuid.NewString()
	unlock := s.locks.Lock(id)
	defer unlock()

	now := time.Now().UTC().Format(time.RFC3339)
	root := s.defaultWorkspaceRoot(id)

	w := Workspace{
		ID:        id,
		Name:      name,
		RootPath:  root,
		Projects:  nil,
		CreatedAt: now,
		UpdatedAt: now,
		// SchemaVersion 由 MarshalJSON 默认写入
	}

	if err := s.ensureWorkspaceDirs(root); err != nil {
		return Workspace{}, err
	}
	if err := s.writeWorkspaceFileAtomic(root, w); err != nil {
		return Workspace{}, err
	}
	if err := s.store.Upsert(w); err != nil {
		return Workspace{}, err
	}
	return w, nil
}

func (s *WorkspaceService) ListWorkspaces() ([]Workspace, error) {
	return s.store.List()
}

func (s *WorkspaceService) GetWorkspace(id string) (Workspace, bool, error) {
	return s.store.Get(id)
}

// ResolveRoot 返回 workspaceId 对应的 workspaceRoot（绝对路径）。
func (s *WorkspaceService) ResolveRoot(workspaceID string) (string, error) {
	w, ok, err := s.store.Get(workspaceID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", fmt.Errorf("workspace 不存在: %s", strings.TrimSpace(workspaceID))
	}
	root := strings.TrimSpace(w.RootPath)
	if root == "" {
		return "", fmt.Errorf("workspace root_path 为空")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	return abs, nil
}

// EnsureReady 补齐缺失目录/元数据文件，不会写入真实项目目录。
func (s *WorkspaceService) EnsureReady(workspaceID string) (Workspace, error) {
	unlock := s.locks.Lock(workspaceID)
	defer unlock()

	w, ok, err := s.store.Get(workspaceID)
	if err != nil {
		return Workspace{}, err
	}
	if !ok {
		return Workspace{}, fmt.Errorf("workspace 不存在: %s", strings.TrimSpace(workspaceID))
	}

	root := strings.TrimSpace(w.RootPath)
	if root == "" {
		return Workspace{}, fmt.Errorf("workspace root_path 为空")
	}
	if err := s.ensureWorkspaceDirs(root); err != nil {
		return Workspace{}, err
	}

	// 以 store 为准刷新 WORKSPACE.json（若文件缺失/损坏，也可自愈）
	if err := s.writeWorkspaceFileAtomic(root, w); err != nil {
		return Workspace{}, err
	}
	return w, nil
}

func (s *WorkspaceService) AddProject(workspaceID, projectAbsPath, name string) (w Workspace, err error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return Workspace{}, fmt.Errorf("workspaceId 不能为空")
	}
	unlock := s.locks.Lock(workspaceID)
	defer unlock()

	var ok bool
	w, ok, err = s.store.Get(workspaceID)
	if err != nil {
		return Workspace{}, err
	}
	if !ok {
		return Workspace{}, fmt.Errorf("workspace 不存在: %s", workspaceID)
	}

	root := strings.TrimSpace(w.RootPath)
	if root == "" {
		return Workspace{}, fmt.Errorf("workspace root_path 为空")
	}
	if err := s.ensureWorkspaceDirs(root); err != nil {
		return Workspace{}, err
	}

	normPath, err := normalizeAbsPath(projectAbsPath)
	if err != nil {
		return Workspace{}, err
	}
	if err := assertExistingDir(normPath); err != nil {
		return Workspace{}, err
	}

	// 已存在则返回（幂等）：按 abs_path 匹配
	for _, p := range w.Projects {
		if samePath(p.AbsPath, normPath) {
			return w, nil
		}
	}

	projName := strings.TrimSpace(name)
	if projName == "" {
		projName = filepath.Base(normPath)
		if strings.TrimSpace(projName) == "" || projName == "." || projName == string(filepath.Separator) {
			projName = "project"
		}
	}

	baseSlug := slugify(projName)
	slug := uniqueSlug(baseSlug, normPath, w.Projects)

	linkPath := filepath.Join(root, workspaceProjectsDir, slug)
	created, err := ensureSymlink(linkPath, normPath)
	if err != nil {
		return Workspace{}, err
	}
	committed := false
	if created {
		// 一致性补偿：若本次创建了 symlink，但后续写 WORKSPACE.json / store.Upsert 失败，
		// 必须回滚删除该 symlink，避免 workspaceRoot 出现“孤儿 link”。
		//
		// 注意：仅当 symlink 是本次创建的才回滚；如果本来就存在且已指向同一 target，则不应删除。
		defer func() {
			if committed {
				return
			}
			if rmErr := removeSymlinkIfExists(linkPath); rmErr != nil {
				// 必须保留原始失败，同时把 rollback 失败也带回去，便于排障。
				if err != nil {
					err = errors.Join(err, fmt.Errorf("workspace.AddProject rollback symlink failed: link=%s err=%w", linkPath, rmErr))
				}
			}
		}()
	}

	now := time.Now().UTC().Format(time.RFC3339)
	w.Projects = append(w.Projects, Project{
		ID:      uuid.NewString(),
		Name:    projName,
		AbsPath: normPath,
		Slug:    slug,
		Enabled: true,
	})
	w.UpdatedAt = now

	// 写入顺序：symlink 已创建 -> 原子写 WORKSPACE.json -> 更新 store
	if err := s.writeWorkspaceFileAtomic(root, w); err != nil {
		return Workspace{}, err
	}
	if err := s.store.Upsert(w); err != nil {
		return Workspace{}, err
	}
	committed = true
	return w, nil
}

func (s *WorkspaceService) RemoveProject(workspaceID, projectID string) (Workspace, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	projectID = strings.TrimSpace(projectID)
	if workspaceID == "" || projectID == "" {
		return Workspace{}, fmt.Errorf("workspaceId/projectId 不能为空")
	}
	unlock := s.locks.Lock(workspaceID)
	defer unlock()

	w, ok, err := s.store.Get(workspaceID)
	if err != nil {
		return Workspace{}, err
	}
	if !ok {
		return Workspace{}, fmt.Errorf("workspace 不存在: %s", workspaceID)
	}
	root := strings.TrimSpace(w.RootPath)
	if root == "" {
		return Workspace{}, fmt.Errorf("workspace root_path 为空")
	}

	idx := -1
	var slug string
	var absPath string
	for i, p := range w.Projects {
		if strings.TrimSpace(p.ID) == projectID {
			idx = i
			slug = p.Slug
			absPath = p.AbsPath
			break
		}
	}
	if idx < 0 {
		return w, nil
	}

	// 仅删除 symlink（不触碰真实目录）
	removedByUs := false
	if strings.TrimSpace(slug) != "" {
		linkPath := filepath.Join(root, workspaceProjectsDir, slug)
		if fi, err := os.Lstat(linkPath); err == nil && fi.Mode()&os.ModeSymlink != 0 {
			removedByUs = true
		}
		if err := removeSymlinkIfExists(linkPath); err != nil {
			return Workspace{}, err
		}
	}

	// 更新元数据
	w.Projects = append(w.Projects[:idx], w.Projects[idx+1:]...)
	w.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	if err := s.writeWorkspaceFileAtomic(root, w); err != nil {
		// 一致性补偿策略（最小改动）：保持现有“先删 symlink”顺序，
		// 若后续写入失败且本次确实删除了 symlink，则尽力恢复该 symlink（best-effort）。
		if removedByUs && strings.TrimSpace(slug) != "" {
			linkPath := filepath.Join(root, workspaceProjectsDir, slug)
			restoreTarget, restoreTargetErr := normalizeRestoreSymlinkTarget(absPath)
			restoreErr := os.Symlink(restoreTarget, linkPath)
			if restoreErr != nil {
				return Workspace{}, errors.Join(
					err,
					fmt.Errorf("RemoveProject restore symlink failed after write failure (may be inconsistent): link=%s restoreErr=%w", linkPath, restoreErr),
					restoreTargetErr,
				)
			}
			return Workspace{}, fmt.Errorf("RemoveProject 写入失败，已恢复 symlink: %w", err)
		}
		return Workspace{}, err
	}
	if err := s.store.Upsert(w); err != nil {
		if removedByUs && strings.TrimSpace(slug) != "" {
			linkPath := filepath.Join(root, workspaceProjectsDir, slug)
			restoreTarget, restoreTargetErr := normalizeRestoreSymlinkTarget(absPath)
			restoreErr := os.Symlink(restoreTarget, linkPath)
			if restoreErr != nil {
				return Workspace{}, errors.Join(
					err,
					fmt.Errorf("RemoveProject restore symlink failed after store.Upsert failure (may be inconsistent): link=%s restoreErr=%w", linkPath, restoreErr),
					restoreTargetErr,
				)
			}
			return Workspace{}, fmt.Errorf("RemoveProject store.Upsert 失败，已恢复 symlink: %w", err)
		}
		return Workspace{}, err
	}
	return w, nil
}

func (s *WorkspaceService) ValidateWorkspace(workspaceID string) (ValidationReport, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return ValidationReport{}, fmt.Errorf("workspaceId 不能为空")
	}
	w, ok, err := s.store.Get(workspaceID)
	if err != nil {
		return ValidationReport{}, err
	}
	if !ok {
		return ValidationReport{}, fmt.Errorf("workspace 不存在: %s", workspaceID)
	}

	root := strings.TrimSpace(w.RootPath)
	rep := ValidationReport{
		WorkspaceID: w.ID,
		RootPath:    root,
		OK:          true,
		Errors:      nil,
		Projects:    nil,
	}

	if root == "" {
		rep.OK = false
		rep.Errors = append(rep.Errors, "root_path 为空")
		return rep, nil
	}
	if err := assertExistingDir(root); err != nil {
		rep.OK = false
		rep.Errors = append(rep.Errors, fmt.Sprintf("workspaceRoot 不可用: %v", err))
		// 继续检查项目（能给出更具体的问题）
	} else {
		// root 本身至少可列出一级条目（满足 spec 的“实际可读性”最低要求）
		if _, err := os.ReadDir(root); err != nil {
			rep.OK = false
			rep.Errors = append(rep.Errors, fmt.Sprintf("workspaceRoot 不可读: %v", err))
		}
	}

	for _, p := range w.Projects {
		st := ProjectStatus{
			ProjectID:   p.ID,
			Name:        p.Name,
			AbsPath:     p.AbsPath,
			Slug:        p.Slug,
			SymlinkPath: filepath.Join(root, workspaceProjectsDir, p.Slug),
			OK:          true,
		}

		if strings.TrimSpace(p.Slug) == "" {
			st.OK = false
			st.Error = "slug 为空"
			rep.OK = false
			rep.Projects = append(rep.Projects, st)
			continue
		}

		// 1) EvalSymlinks：检测循环/不可解析
		resolved, err := filepath.EvalSymlinks(st.SymlinkPath)
		if err != nil {
			st.OK = false
			st.Error = fmt.Sprintf("解析 symlink 失败: %v", err)
			rep.OK = false
			rep.Projects = append(rep.Projects, st)
			continue
		}
		st.ResolvedPath = resolved

		// 2) 目标目录存在性
		fi, err := os.Stat(resolved)
		if err != nil {
			st.OK = false
			st.Error = fmt.Sprintf("目标路径不可用: %v", err)
			rep.OK = false
			rep.Projects = append(rep.Projects, st)
			continue
		}
		if !fi.IsDir() {
			st.OK = false
			st.Error = "目标路径不是目录"
			rep.OK = false
			rep.Projects = append(rep.Projects, st)
			continue
		}

		// 3) 实际可读性探测：至少 ReadDir 一级
		if _, err := os.ReadDir(resolved); err != nil {
			st.OK = false
			st.Error = fmt.Sprintf("目录不可读: %v", err)
			rep.OK = false
			rep.Projects = append(rep.Projects, st)
			continue
		}

		rep.Projects = append(rep.Projects, st)
	}

	return rep, nil
}

func (s *WorkspaceService) defaultWorkspaceRoot(id string) string {
	base := strings.TrimSpace(s.appDataDir)
	if base == "" {
		// 严格按约束：appData 来自 AgentGlobalDataDir；此处保底再取一次
		if d, err := agent.AgentGlobalDataDir(); err == nil {
			base = d
		}
	}
	return filepath.Join(base, "workspaces", id)
}

func (s *WorkspaceService) ensureWorkspaceDirs(root string) error {
	root = strings.TrimSpace(root)
	if root == "" {
		return fmt.Errorf("workspaceRoot 为空")
	}
	if err := os.MkdirAll(filepath.Join(root, workspaceProjectsDir), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(root, workspaceScratchDir), 0o755); err != nil {
		return err
	}
	return nil
}

func (s *WorkspaceService) writeWorkspaceFileAtomic(workspaceRoot string, w Workspace) error {
	workspaceRoot = strings.TrimSpace(workspaceRoot)
	if workspaceRoot == "" {
		return fmt.Errorf("workspaceRoot 为空")
	}
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		return err
	}
	path := filepath.Join(workspaceRoot, workspaceMetaFileName)
	data, err := json.MarshalIndent(w, "", "  ")
	if err != nil {
		return err
	}
	tmp := fmt.Sprintf("%s.%d.tmp", path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func normalizeAbsPath(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", fmt.Errorf("projectAbsPath 不能为空")
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	abs = filepath.Clean(abs)
	abs = strings.TrimRight(abs, string(filepath.Separator))
	if abs == "" {
		return "", fmt.Errorf("projectAbsPath 无效")
	}
	return abs, nil
}

func assertExistingDir(p string) error {
	fi, err := os.Stat(p)
	if err != nil {
		return err
	}
	if !fi.IsDir() {
		return fmt.Errorf("not a directory: %s", p)
	}
	return nil
}

func samePath(a, b string) bool {
	return filepath.Clean(strings.TrimSpace(a)) == filepath.Clean(strings.TrimSpace(b))
}

func ensureSymlink(linkPath, target string) (created bool, err error) {
	linkPath = strings.TrimSpace(linkPath)
	target = strings.TrimSpace(target)
	if linkPath == "" || target == "" {
		return false, fmt.Errorf("symlink 路径为空")
	}
	if err := os.MkdirAll(filepath.Dir(linkPath), 0o755); err != nil {
		return false, err
	}
	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return false, err
	}
	targetAbs = filepath.Clean(targetAbs)

	fi, err := os.Lstat(linkPath)
	if err == nil {
		if fi.Mode()&os.ModeSymlink == 0 {
			return false, fmt.Errorf("目标已存在且不是 symlink: %s", linkPath)
		}
		existingRaw, err := os.Readlink(linkPath)
		if err != nil {
			return false, err
		}
		// 不依赖 target 是否存在：只判断 link 目标是否“语义上等价”于 targetAbs。
		// - Readlink 取到的可能是相对路径：相对路径以 linkPath 所在目录为基准解析。
		var existingAbs string
		if filepath.IsAbs(existingRaw) {
			existingAbs = filepath.Clean(existingRaw)
		} else {
			existingAbs, err = filepath.Abs(filepath.Join(filepath.Dir(linkPath), existingRaw))
			if err != nil {
				return false, err
			}
			existingAbs = filepath.Clean(existingAbs)
		}
		if existingAbs == targetAbs {
			return false, nil
		}
		// link 已有但指向不同，返回明确错误，不做自动覆盖（避免误删用户手工内容）
		return false, fmt.Errorf("symlink 已存在且指向不同目标: %s -> %s", linkPath, existingRaw)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return false, err
	}
	if err := os.Symlink(targetAbs, linkPath); err != nil {
		return false, err
	}
	return true, nil
}

func removeSymlinkIfExists(linkPath string) error {
	fi, err := os.Lstat(linkPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if fi.Mode()&os.ModeSymlink == 0 {
		return fmt.Errorf("不是 symlink，拒绝删除: %s", linkPath)
	}
	return os.Remove(linkPath)
}

func normalizeRestoreSymlinkTarget(absPath string) (string, error) {
	raw := strings.TrimSpace(absPath)
	if raw == "" {
		// 目标为空时交由 os.Symlink 返回更明确的错误
		return raw, nil
	}
	abs, err := filepath.Abs(raw)
	if err != nil {
		// 失败时回退原值，但返回可追踪的错误，供上层 join
		return raw, fmt.Errorf("normalize restore symlink target failed (fallback to raw=%q): %w", raw, err)
	}
	return filepath.Clean(abs), nil
}

func slugify(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "project"
	}
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		r = unicode.ToLower(r)
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if r == '-' || r == '_' || unicode.IsSpace(r) {
			if !prevDash {
				b.WriteByte('-')
				prevDash = true
			}
			continue
		}
		// 其他字符统一转为 '-'
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "project"
	}
	return out
}

func uniqueSlug(base, normPath string, existing []Project) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "project"
	}
	normPath = strings.TrimSpace(normPath)
	if normPath == "" {
		// normPath 理论上应为 normalizeAbsPath 的输出；此处仅做保底，避免兜底哈希不稳定。
		normPath = base
	}
	used := make(map[string]struct{}, len(existing))
	for _, p := range existing {
		if x := strings.TrimSpace(p.Slug); x != "" {
			used[x] = struct{}{}
		}
	}
	if _, ok := used[base]; !ok {
		return base
	}
	return uniqueSlugWithMax(base, normPath, used, 10000)
}

func uniqueSlugWithMax(base, normPath string, used map[string]struct{}, maxN int) string {
	for i := 2; i < maxN; i++ {
		cand := fmt.Sprintf("%s-%d", base, i)
		if _, ok := used[cand]; !ok {
			return cand
		}
	}
	// 极端兜底：必须确定性（同输入重复调用 slug 不变）。
	// 采用稳定哈希 (base + normPath + counter) 生成短后缀，直到找到未使用值。
	for counter := 0; counter < 128; counter++ {
		sum := sha1.Sum([]byte(fmt.Sprintf("%s\n%s\n%d", base, normPath, counter)))
		suffix := hex.EncodeToString(sum[:])[:8]
		cand := fmt.Sprintf("%s-%s", base, suffix)
		if _, ok := used[cand]; !ok {
			return cand
		}
	}
	// 理论上不会到这里；为了保持确定性，再加长后缀。
	sum := sha1.Sum([]byte(fmt.Sprintf("%s\n%s\nfinal", base, normPath)))
	return fmt.Sprintf("%s-%s", base, hex.EncodeToString(sum[:])[:12])
}

// keyedLocks 用于对单 workspaceId 串行化写操作，避免无界泄漏（refcount + 清理）。
type keyedLocks struct {
	mu sync.Mutex
	m  map[string]*keyedLockEntry
}

type keyedLockEntry struct {
	mu   sync.Mutex
	refs int
}

func newKeyedLocks() *keyedLocks {
	return &keyedLocks{m: make(map[string]*keyedLockEntry)}
}

func (k *keyedLocks) Lock(key string) func() {
	key = strings.TrimSpace(key)
	if key == "" {
		// 空 key 不应出现；直接退化为全局串行
		key = "__empty__"
	}
	k.mu.Lock()
	e := k.m[key]
	if e == nil {
		e = &keyedLockEntry{}
		k.m[key] = e
	}
	e.refs++
	k.mu.Unlock()

	e.mu.Lock()
	return func() {
		e.mu.Unlock()
		k.mu.Lock()
		e.refs--
		if e.refs <= 0 {
			delete(k.m, key)
		}
		k.mu.Unlock()
	}
}
