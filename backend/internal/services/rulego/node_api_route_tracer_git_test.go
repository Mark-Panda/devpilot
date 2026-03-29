package rulego

import "testing"

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
