package main

import (
	"path/filepath"
	"testing"
)

func TestResolveRuntimeDataDir_Default(t *testing.T) {
	home := "/Users/tester"
	got := resolveRuntimeDataDir(home, "/tmp", false)
	want := filepath.Join(home, ".devpilot")
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestResolveRuntimeDataDir_BindingsUsesTempDir(t *testing.T) {
	home := "/Users/tester"
	got := resolveRuntimeDataDir(home, "/tmp", true)
	want := filepath.Join("/tmp", "devpilot-wails-bindings")
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}
