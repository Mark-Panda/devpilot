package rulego

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGitRepoDirNameFromURL(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{"https://gitlab.com/foo/bar.git", "bar"},
		{"https://gitlab.com/foo/bar", "bar"},
		{"http://host/a/b/c.repo.git", "c.repo"},
		{"git@gitlab.com:group/my-service.git", "my-service"},
		{"git@gitlab.com:my-service.git", "my-service"},
		{"ssh://git@gitlab.com/group/sub/repo.git", "repo"},
	}
	for _, tc := range tests {
		got, err := gitRepoDirNameFromURL(tc.raw)
		if err != nil {
			t.Fatalf("gitRepoDirNameFromURL(%q): %v", tc.raw, err)
		}
		if got != tc.want {
			t.Fatalf("gitRepoDirNameFromURL(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

func TestGitRepoDirNameFromURL_errors(t *testing.T) {
	for _, raw := range []string{"", "git@host", "https://host/", "https://host", "ssh://git@x/"} {
		if _, err := gitRepoDirNameFromURL(raw); err == nil {
			t.Fatalf("expected error for %q", raw)
		}
	}
}

func TestExpandUserPath_gitPrepareWorkDir(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		t.Skip("UserHomeDir unavailable")
	}
	if got := expandUserPath("~"); got != home {
		t.Fatalf("expandUserPath(~) = %q, want %q", got, home)
	}
	if got := expandUserPath("  ~  "); got != home {
		t.Fatalf("expandUserPath(  ~  ) = %q, want %q", got, home)
	}
	wantSub := filepath.Join(home, "devpilot", "repos")
	if got := expandUserPath("~/devpilot/repos"); got != wantSub {
		t.Fatalf("expandUserPath(~/devpilot/repos) = %q, want %q", got, wantSub)
	}
	if got := expandUserPath("/abs/no/tilde"); got != "/abs/no/tilde" {
		t.Fatalf("expandUserPath(/abs/no/tilde) = %q", got)
	}
	if got := expandUserPath(""); got != "" {
		t.Fatalf("expandUserPath(\"\") = %q", got)
	}
}
