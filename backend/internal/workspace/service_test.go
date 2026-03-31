package workspace

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkspaceService_CreateWorkspace_CreatesDirsAndFile(t *testing.T) {
	appData := t.TempDir()
	store := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(store, appData)

	w, err := svc.CreateWorkspace("demo")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	if w.ID == "" {
		t.Fatalf("expected id")
	}
	wantRoot := filepath.Join(appData, "workspaces", w.ID)
	if filepath.Clean(w.RootPath) != filepath.Clean(wantRoot) {
		t.Fatalf("root mismatch: got %q want %q", w.RootPath, wantRoot)
	}

	if _, err := os.Stat(filepath.Join(wantRoot, "projects")); err != nil {
		t.Fatalf("projects dir missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(wantRoot, "scratch")); err != nil {
		t.Fatalf("scratch dir missing: %v", err)
	}
	meta := filepath.Join(wantRoot, "WORKSPACE.json")
	b, err := os.ReadFile(meta)
	if err != nil {
		t.Fatalf("read WORKSPACE.json: %v", err)
	}
	var onDisk Workspace
	if err := json.Unmarshal(b, &onDisk); err != nil {
		t.Fatalf("unmarshal: %v\n%s", err, string(b))
	}
	if onDisk.SchemaVersion == 0 {
		t.Fatalf("expected schema_version to be present/non-zero")
	}
}

func TestWorkspaceService_AddProject_CreatesSymlink(t *testing.T) {
	appData := t.TempDir()
	store := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(store, appData)

	w, err := svc.CreateWorkspace("demo")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	projectDir := filepath.Join(t.TempDir(), "myproj")
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatalf("MkdirAll project: %v", err)
	}

	w2, err := svc.AddProject(w.ID, projectDir, "")
	if err != nil {
		t.Fatalf("AddProject: %v", err)
	}
	if len(w2.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(w2.Projects))
	}
	slug := w2.Projects[0].Slug
	linkPath := filepath.Join(w2.RootPath, "projects", slug)
	fi, err := os.Lstat(linkPath)
	if err != nil {
		t.Fatalf("Lstat symlink: %v", err)
	}
	if fi.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("expected symlink at %s", linkPath)
	}
}

func TestWorkspaceService_RemoveProject_DeletesSymlink(t *testing.T) {
	appData := t.TempDir()
	store := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(store, appData)

	w, err := svc.CreateWorkspace("demo")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	projectDir := filepath.Join(t.TempDir(), "myproj")
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatalf("MkdirAll project: %v", err)
	}
	w, err = svc.AddProject(w.ID, projectDir, "My Proj")
	if err != nil {
		t.Fatalf("AddProject: %v", err)
	}
	pid := w.Projects[0].ID
	slug := w.Projects[0].Slug
	linkPath := filepath.Join(w.RootPath, "projects", slug)
	if _, err := os.Lstat(linkPath); err != nil {
		t.Fatalf("expected symlink exists: %v", err)
	}

	w2, err := svc.RemoveProject(w.ID, pid)
	if err != nil {
		t.Fatalf("RemoveProject: %v", err)
	}
	if len(w2.Projects) != 0 {
		t.Fatalf("expected 0 projects, got %d", len(w2.Projects))
	}
	if _, err := os.Lstat(linkPath); err == nil {
		t.Fatalf("expected symlink removed")
	}
}

func TestWorkspaceService_GetWorkspace_NotFound(t *testing.T) {
	appData := t.TempDir()
	store := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(store, appData)

	_, err := svc.GetWorkspace("nope")
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestWorkspaceService_DeleteWorkspace_RemovesFromStoreAndCleansDefaultRoot(t *testing.T) {
	appData := t.TempDir()
	store := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(store, appData)

	w, err := svc.CreateWorkspace("demo")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	root := w.RootPath
	if _, err := os.Stat(root); err != nil {
		t.Fatalf("expected root exists: %v", err)
	}

	if err := svc.DeleteWorkspace(w.ID); err != nil {
		t.Fatalf("DeleteWorkspace: %v", err)
	}
	_, ok, err := store.Get(w.ID)
	if err != nil {
		t.Fatalf("store.Get: %v", err)
	}
	if ok {
		t.Fatalf("expected deleted from store")
	}
	if _, err := os.Stat(root); err == nil {
		t.Fatalf("expected root removed")
	}
}

func TestWorkspaceService_DeleteWorkspaceForce_DeletesCustomRootWhenVerified(t *testing.T) {
	appData := t.TempDir()
	store := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(store, appData)

	w, err := svc.CreateWorkspace("demo")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}

	// 将 root_path 改为自定义目录（不在默认 workspaces/<id> 下）
	customRoot := filepath.Join(t.TempDir(), "custom-root")
	w.RootPath = customRoot
	if err := svc.ensureWorkspaceDirs(customRoot); err != nil {
		t.Fatalf("ensureWorkspaceDirs: %v", err)
	}
	if err := svc.writeWorkspaceFileAtomic(customRoot, w); err != nil {
		t.Fatalf("writeWorkspaceFileAtomic: %v", err)
	}
	if err := store.Upsert(w); err != nil {
		t.Fatalf("store.Upsert: %v", err)
	}

	if err := svc.DeleteWorkspaceForce(w.ID); err != nil {
		t.Fatalf("DeleteWorkspaceForce: %v", err)
	}
	if _, err := os.Stat(customRoot); err == nil {
		t.Fatalf("expected custom root removed")
	}
	_, ok, err := store.Get(w.ID)
	if err != nil {
		t.Fatalf("store.Get: %v", err)
	}
	if ok {
		t.Fatalf("expected deleted from store")
	}
}

type failingUpsertStore struct {
	inner     WorkspaceStore
	upsertErr error
}

func (s failingUpsertStore) List() ([]Workspace, error) { return s.inner.List() }
func (s failingUpsertStore) Get(id string) (Workspace, bool, error) {
	return s.inner.Get(id)
}
func (s failingUpsertStore) Upsert(w Workspace) error { return s.upsertErr }
func (s failingUpsertStore) Delete(id string) error   { return s.inner.Delete(id) }

type failingUpsertAndRollbackStore struct {
	inner     WorkspaceStore
	upsertErr error
}

func (s failingUpsertAndRollbackStore) List() ([]Workspace, error) { return s.inner.List() }
func (s failingUpsertAndRollbackStore) Get(id string) (Workspace, bool, error) {
	return s.inner.Get(id)
}
func (s failingUpsertAndRollbackStore) Upsert(w Workspace) error {
	// 尽力把刚创建的 symlink 变成“非 symlink”，让 AddProject 的 rollback 删除必然失败，
	// 用于验证 errors.Join 合并错误时不会吞掉原始 upsertErr。
	if strings.TrimSpace(w.RootPath) != "" && len(w.Projects) > 0 {
		slug := strings.TrimSpace(w.Projects[len(w.Projects)-1].Slug)
		if slug != "" {
			linkPath := filepath.Join(w.RootPath, "projects", slug)
			_ = os.Remove(linkPath)          // 删除 symlink（若存在）
			_ = os.Mkdir(linkPath, 0o755)    // 创建同名目录，使 rollback 的 removeSymlinkIfExists 报错
		}
	}
	return s.upsertErr
}
func (s failingUpsertAndRollbackStore) Delete(id string) error { return s.inner.Delete(id) }

func TestWorkspaceService_AddProject_RollbackSymlinkOnStoreUpsertFail(t *testing.T) {
	appData := t.TempDir()
	realStore := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(realStore, appData)

	w, err := svc.CreateWorkspace("demo")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	projectDir := filepath.Join(t.TempDir(), "myproj")
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatalf("MkdirAll project: %v", err)
	}

	// 用 stub store 强制 Upsert 失败（但仍能 Get 到刚创建的 workspace）
	upsertErr := errors.New("boom upsert")
	svc.store = failingUpsertStore{inner: realStore, upsertErr: upsertErr}

	_, err = svc.AddProject(w.ID, projectDir, "My Proj")
	if err == nil {
		t.Fatalf("expected error")
	}

	projectsDir := filepath.Join(w.RootPath, "projects")
	ents, rdErr := os.ReadDir(projectsDir)
	if rdErr != nil {
		t.Fatalf("ReadDir projects: %v", rdErr)
	}
	if len(ents) != 0 {
		t.Fatalf("expected symlink rollback (projects empty), got %d entries", len(ents))
	}
}

func TestWorkspaceService_AddProject_RollbackFailureIsJoinedAndDoesNotHideOriginalErr(t *testing.T) {
	appData := t.TempDir()
	realStore := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(realStore, appData)

	w, err := svc.CreateWorkspace("demo")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	projectDir := filepath.Join(t.TempDir(), "myproj")
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatalf("MkdirAll project: %v", err)
	}

	upsertErr := errors.New("boom upsert")
	svc.store = failingUpsertAndRollbackStore{inner: realStore, upsertErr: upsertErr}

	_, err = svc.AddProject(w.ID, projectDir, "My Proj")
	if err == nil {
		t.Fatalf("expected error")
	}
	if !errors.Is(err, upsertErr) {
		t.Fatalf("expected errors.Is(err, upsertErr)=true, got err=%v", err)
	}
	if !strings.Contains(err.Error(), "rollback symlink failed") {
		t.Fatalf("expected rollback clue in error string, got: %v", err)
	}
}

func TestEnsureSymlink_TargetMissingButAlreadyPointsSamePath(t *testing.T) {
	root := t.TempDir()
	linkPath := filepath.Join(root, "projects", "p1")
	missingTarget := filepath.Join(t.TempDir(), "missing-target-does-not-exist")
	if err := os.MkdirAll(filepath.Dir(linkPath), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	// 先手工创建一个指向“不存在 target”的 symlink
	if err := os.Symlink(missingTarget, linkPath); err != nil {
		t.Fatalf("Symlink: %v", err)
	}

	created, err := ensureSymlink(linkPath, missingTarget)
	if err != nil {
		t.Fatalf("ensureSymlink: %v", err)
	}
	if created {
		t.Fatalf("expected created=false when already consistent")
	}
}

func TestUniqueSlug_DeterministicFallbackWhenExhausted(t *testing.T) {
	base := "proj"
	normPath := "/abs/path/to/proj"

	used := map[string]struct{}{
		"proj":   {},
		"proj-2": {},
		"proj-3": {},
	}
	// maxN=4 会让循环仅尝试 2,3 两个候选，从而触发确定性哈希兜底
	got1 := uniqueSlugWithMax(base, normPath, used, 4)
	got2 := uniqueSlugWithMax(base, normPath, used, 4)
	if got1 != got2 {
		t.Fatalf("expected deterministic slug, got %q vs %q", got1, got2)
	}
	if got1 == "proj" || got1 == "proj-2" || got1 == "proj-3" {
		t.Fatalf("expected fallback slug not in used, got %q", got1)
	}
}

func TestWorkspaceService_ValidateWorkspace_BadSymlinkAndLoopReported(t *testing.T) {
	appData := t.TempDir()
	store := NewJSONWorkspaceStoreAt(appData)
	svc := NewWorkspaceService(store, appData)

	w, err := svc.CreateWorkspace("demo")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}

	// 造一个“不可解析”的项目：symlink 指向不存在目录
	missingTarget := filepath.Join(t.TempDir(), "missing")
	badSlug := "missing"
	badLink := filepath.Join(w.RootPath, "projects", badSlug)
	if err := os.Symlink(missingTarget, badLink); err != nil {
		t.Fatalf("Symlink missing: %v", err)
	}
	w.Projects = append(w.Projects, Project{
		ID:      "p_missing",
		Name:    "missing",
		AbsPath: missingTarget,
		Slug:    badSlug,
		Enabled: true,
	})

	// 造一个“循环”的项目：symlink 指向自己
	loopSlug := "loop"
	loopLink := filepath.Join(w.RootPath, "projects", loopSlug)
	if err := os.Symlink(loopLink, loopLink); err != nil {
		t.Fatalf("Symlink loop: %v", err)
	}
	w.Projects = append(w.Projects, Project{
		ID:      "p_loop",
		Name:    "loop",
		AbsPath: loopLink,
		Slug:    loopSlug,
		Enabled: true,
	})

	// 写回 store，确保 ValidateWorkspace 从 store 读取到这两项
	if err := store.Upsert(w); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	rep, err := svc.ValidateWorkspace(w.ID)
	if err != nil {
		t.Fatalf("ValidateWorkspace: %v", err)
	}
	if rep.OK {
		t.Fatalf("expected rep.OK=false")
	}
	if len(rep.Projects) != 2 {
		t.Fatalf("expected 2 project statuses, got %d", len(rep.Projects))
	}
	// 至少应包含 EvalSymlinks 失败的错误信息
	for _, ps := range rep.Projects {
		if ps.OK {
			t.Fatalf("expected project not ok: %+v", ps)
		}
		if ps.Error == "" {
			t.Fatalf("expected error message: %+v", ps)
		}
	}
}
