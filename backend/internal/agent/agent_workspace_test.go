package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeAgentWorkspaceRoot(t *testing.T) {
	out, err := NormalizeAgentWorkspaceRoot("")
	if err != nil || out != "" {
		t.Fatalf("empty: got %q err=%v", out, err)
	}
	root := t.TempDir()
	sub := filepath.Join(root, "w")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}
	out, err = NormalizeAgentWorkspaceRoot(sub)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.EvalSymlinks(filepath.Clean(sub))
	got, _ := filepath.EvalSymlinks(filepath.Clean(out))
	if got != want {
		t.Fatalf("got %q want %q", out, sub)
	}
	_, err = NormalizeAgentWorkspaceRoot(filepath.Join(root, "nope"))
	if err == nil {
		t.Fatal("expected error for missing dir")
	}
}
