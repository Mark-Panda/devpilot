package llm

import (
	"testing"

	"github.com/tmc/langchaingo/llms"
)

func TestNormalizeModelChain(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		primary string
		extras  []string
		want    []string
	}{
		{"primary only", "a", nil, []string{"a"}},
		{"dedupe", "a", []string{"a", "b"}, []string{"a", "b"}},
		{"empty primary", "", []string{"x", "y"}, []string{"x", "y"}},
		{"trim", " a ", []string{" b ", "b"}, []string{"a", "b"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := NormalizeModelChain(tc.primary, tc.extras)
			if len(got) != len(tc.want) {
				t.Fatalf("len got %d want %d: %v vs %v", len(got), len(tc.want), got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("got %v want %v", got, tc.want)
				}
			}
		})
	}
}

func TestCloneMessageContents(t *testing.T) {
	t.Parallel()
	src := []llms.MessageContent{
		{Role: llms.ChatMessageTypeHuman, Parts: []llms.ContentPart{llms.TextContent{Text: "hi"}}},
	}
	dst := CloneMessageContents(src)
	if len(dst) != 1 || dst[0].Role != src[0].Role {
		t.Fatal("clone mismatch")
	}
	dst[0].Parts[0] = llms.TextContent{Text: "x"}
	if tc, ok := src[0].Parts[0].(llms.TextContent); !ok || tc.Text != "hi" {
		t.Fatal("mutating clone should not affect source Parts")
	}
}
