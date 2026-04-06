package rulego

import (
	"slices"
	"testing"
)

func TestBuildCursorCLIPrintArgs(t *testing.T) {
	cfg := &cursorCLIConfig{
		OutputFormat: "json",
		Model:        "sonnet-4",
		Mode:         "plan",
		Trust:        true,
		Force:        true,
		ExtraArgs:    []string{"  ", "--list-models"},
	}
	args := buildCursorCLIPrintArgs(cfg, "/tmp/ws", "hello world")
	want := []string{
		"--print", "--output-format", "json",
		"--workspace", "/tmp/ws",
		"--model", "sonnet-4",
		"--mode", "plan",
		"--trust", "--force",
		"--list-models",
		"hello world",
	}
	if !slices.Equal(args, want) {
		t.Fatalf("args mismatch\ngot:  %#v\nwant: %#v", args, want)
	}
}
