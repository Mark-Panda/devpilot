package main

import (
	"os"
	"path/filepath"
)

func resolveRuntimeDataDir(homeDir string, tempDir string, bindingsMode bool) string {
	if bindingsMode {
		return filepath.Join(tempDir, "devpilot-wails-bindings")
	}
	return filepath.Join(homeDir, ".devpilot")
}

func currentRuntimeDataDir(homeDir string) string {
	return resolveRuntimeDataDir(homeDir, os.TempDir(), useBindingsRuntimeDataDir())
}
