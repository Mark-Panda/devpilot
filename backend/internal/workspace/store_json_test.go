package workspace

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestJSONWorkspaceStore_UpsertGetListDelete(t *testing.T) {
	dir := t.TempDir()
	s := NewJSONWorkspaceStoreAt(dir)

	w1 := Workspace{ID: "w1", Name: "one", RootPath: "/abs/one"}
	if err := s.Upsert(w1); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	got, ok, err := s.Get("w1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !ok || got.ID != "w1" || got.Name != "one" {
		t.Fatalf("Get mismatch: ok=%v got=%+v", ok, got)
	}

	list, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 || list[0].ID != "w1" {
		t.Fatalf("List mismatch: %+v", list)
	}

	if err := s.Delete("w1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	_, ok, err = s.Get("w1")
	if err != nil {
		t.Fatalf("Get after delete: %v", err)
	}
	if ok {
		t.Fatalf("expected deleted")
	}
}

func TestJSONWorkspaceStore_ConcurrentUpsertDifferentIDs_JSONNotCorrupted(t *testing.T) {
	dir := t.TempDir()
	s := NewJSONWorkspaceStoreAt(dir)

	const n = 64
	var wg sync.WaitGroup
	errCh := make(chan error, n)
	wg.Add(n)
	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			id := "w" + itoa(i)
			if err := s.Upsert(Workspace{ID: id, Name: id, RootPath: "/tmp/" + id}); err != nil {
				errCh <- err
			}
		}()
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Fatalf("Upsert error: %v", err)
	}

	// 直接读文件，确认是完整 JSON
	b, err := os.ReadFile(filepath.Join(dir, "workspaces.json"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var doc workspaceStoreFileDoc
	if err := json.Unmarshal(b, &doc); err != nil {
		t.Fatalf("Unmarshal workspaces.json: %v\n%s", err, string(b))
	}
	if len(doc.Items) != n {
		t.Fatalf("expected %d items, got %d", n, len(doc.Items))
	}
}

func TestJSONWorkspaceStore_ConcurrentUpsertSameID(t *testing.T) {
	dir := t.TempDir()
	s := NewJSONWorkspaceStoreAt(dir)

	const n = 50
	var wg sync.WaitGroup
	errCh := make(chan error, n)
	wg.Add(n)
	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			if err := s.Upsert(Workspace{ID: "same", Name: "v" + itoa(i), RootPath: "/tmp/same"}); err != nil {
				errCh <- err
			}
		}()
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Fatalf("Upsert error: %v", err)
	}

	_, ok, err := s.Get("same")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !ok {
		t.Fatalf("expected exists")
	}
}

func TestJSONWorkspaceStore_List_ReconcilesMissingOrder(t *testing.T) {
	dir := t.TempDir()

	// 模拟历史/异常文件：Items 有值但 Order 缺失
	doc := workspaceStoreFileDoc{
		Version: workspaceStoreFileVersion,
		Items: map[string]Workspace{
			"b": {ID: "b", Name: "B", RootPath: "/b"},
			"a": {ID: "a", Name: "A", RootPath: "/a"},
		},
		Order: nil,
	}
	b, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "workspaces.json"), b, 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	s := NewJSONWorkspaceStoreAt(dir)
	list, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2, got %d: %+v", len(list), list)
	}
	// 缺失项补齐时按字典序稳定输出：a, b
	if list[0].ID != "a" || list[1].ID != "b" {
		t.Fatalf("unexpected order: %+v", []string{list[0].ID, list[1].ID})
	}
}

func TestJSONWorkspaceStore_Upsert_EnsuresOrderContainsExistingID(t *testing.T) {
	dir := t.TempDir()

	// 模拟异常文件：Items 含 same，但 Order 为空
	doc := workspaceStoreFileDoc{
		Version: workspaceStoreFileVersion,
		Items: map[string]Workspace{
			"same": {ID: "same", Name: "old", RootPath: "/old"},
		},
		Order: nil,
	}
	b, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "workspaces.json"), b, 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	s := NewJSONWorkspaceStoreAt(dir)
	if err := s.Upsert(Workspace{ID: "same", Name: "new", RootPath: "/new"}); err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	list, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 || list[0].ID != "same" {
		t.Fatalf("expected same, got: %+v", list)
	}
}

func TestJSONWorkspaceStore_Save_RenameFailureCleansTemp(t *testing.T) {
	dir := t.TempDir()
	s := NewJSONWorkspaceStoreAt(dir)

	// 让目标路径变成目录，使 rename(tmp, target) 必然失败，并可观察 tmp 是否残留
	target := filepath.Join(dir, "workspaces.json")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatalf("Mkdir target dir: %v", err)
	}

	err := s.Upsert(Workspace{ID: "w1", Name: "one", RootPath: "/abs/one"})
	if err == nil {
		t.Fatalf("expected error")
	}

	entries, err2 := os.ReadDir(dir)
	if err2 != nil {
		t.Fatalf("ReadDir: %v", err2)
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "workspaces.json.") && strings.HasSuffix(name, ".tmp") {
			t.Fatalf("temp file should be cleaned, found: %s", name)
		}
	}
}

func TestJSONWorkspaceStore_List_JSONCorruptedReturnsError(t *testing.T) {
	dir := t.TempDir()
	s := NewJSONWorkspaceStoreAt(dir)

	if err := os.WriteFile(filepath.Join(dir, "workspaces.json"), []byte("{bad"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	_, err := s.List()
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestJSONWorkspaceStore_List_FallsBackWhenPrimaryMissing(t *testing.T) {
	primaryDir := t.TempDir()
	fallbackDir := t.TempDir()

	// 只在 fallback 写入
	fdoc := workspaceStoreFileDoc{
		Version: workspaceStoreFileVersion,
		Items: map[string]Workspace{
			"w1": {ID: "w1", Name: "one", RootPath: "/abs/one"},
		},
		Order: []string{"w1"},
	}
	b, err := json.MarshalIndent(fdoc, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent: %v", err)
	}
	if err := os.WriteFile(filepath.Join(fallbackDir, "workspaces.json"), b, 0o600); err != nil {
		t.Fatalf("WriteFile fallback: %v", err)
	}

	s := NewJSONWorkspaceStoreAtWithFallbacks(primaryDir, fallbackDir)
	list, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 || list[0].ID != "w1" {
		t.Fatalf("unexpected list: %+v", list)
	}
}

func TestJSONWorkspaceStore_List_FallsBackWhenPrimaryCorrupted(t *testing.T) {
	primaryDir := t.TempDir()
	fallbackDir := t.TempDir()

	if err := os.WriteFile(filepath.Join(primaryDir, "workspaces.json"), []byte("{bad"), 0o600); err != nil {
		t.Fatalf("WriteFile primary: %v", err)
	}

	fdoc := workspaceStoreFileDoc{
		Version: workspaceStoreFileVersion,
		Items: map[string]Workspace{
			"w1": {ID: "w1", Name: "one", RootPath: "/abs/one"},
		},
		Order: []string{"w1"},
	}
	b, err := json.MarshalIndent(fdoc, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent: %v", err)
	}
	if err := os.WriteFile(filepath.Join(fallbackDir, "workspaces.json"), b, 0o600); err != nil {
		t.Fatalf("WriteFile fallback: %v", err)
	}

	s := NewJSONWorkspaceStoreAtWithFallbacks(primaryDir, fallbackDir)
	list, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 || list[0].ID != "w1" {
		t.Fatalf("unexpected list: %+v", list)
	}
}

// itoa 避免引入 strconv（保持测试依赖最小）
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	var b [32]byte
	n := 0
	for i > 0 {
		b[n] = byte('0' + i%10)
		n++
		i /= 10
	}
	out := make([]byte, 0, n+1)
	if neg {
		out = append(out, '-')
	}
	for j := n - 1; j >= 0; j-- {
		out = append(out, b[j])
	}
	return string(out)
}
