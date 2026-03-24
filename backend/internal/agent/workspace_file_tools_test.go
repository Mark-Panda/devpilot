package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkspaceResolvePath(t *testing.T) {
	root := t.TempDir()
	sub := filepath.Join(root, "pkg")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}

	abs, rel, err := workspaceResolvePath(root, "pkg/a.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(abs, filepath.Join("pkg", "a.go")) {
		t.Fatalf("abs=%q", abs)
	}
	if rel != filepath.Join("pkg", "a.go") {
		t.Fatalf("rel=%q want pkg/a.go", rel)
	}

	_, _, err = workspaceResolvePath(root, "../outside")
	if err == nil {
		t.Fatal("expected error for .. path")
	}

	// Clean("pkg/../../x") -> "../x"，应拒绝
	_, _, err = workspaceResolvePath(root, "pkg/../../x")
	if err == nil {
		t.Fatal("expected error for path with parent segment outside root")
	}
}

func TestWorkspaceFinalizeSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	link := filepath.Join(root, "out")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	abs := filepath.Join(rootAbs, "out")
	rel := "out"
	_, _, err = workspaceFinalizeExistingPath(rootAbs, abs, rel)
	if err == nil {
		t.Fatal("expected error for symlink pointing outside project root")
	}
}

func TestReadWorkspaceFileLineRangeLarge(t *testing.T) {
	root := t.TempDir()
	p := filepath.Join(root, "big.txt")
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	// 每行短文本，总行数多、文件体积超过 maxWorkspaceFileToolBytes
	line := strings.Repeat("a", 100) + "\n"
	for i := 0; i < 15000; i++ {
		if _, err := f.WriteString(line); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	fi, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Size() <= maxWorkspaceFileToolBytes {
		t.Fatalf("test file too small: %d", fi.Size())
	}
	out, err := readWorkspaceFileLineRange(p, 1, 5)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "(lines 1-5 of") {
		t.Fatalf("unexpected header: %q", out[:min(80, len(out))])
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
