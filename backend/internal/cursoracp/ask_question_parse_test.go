package cursoracp

import "testing"

func TestParseAskQuestionUI(t *testing.T) {
	title, opts := ParseAskQuestionUI([]byte(`{"message":"选一项","options":[{"id":"a","label":"甲"},{"id":"b"}]}`))
	if title != "选一项" {
		t.Fatalf("title=%q", title)
	}
	if len(opts) != 2 || opts[0].ID != "a" || opts[0].Label != "甲" || opts[1].ID != "b" || opts[1].Label != "b" {
		t.Fatalf("opts=%+v", opts)
	}
}

func TestParseAskQuestionUI_choices(t *testing.T) {
	_, opts := ParseAskQuestionUI([]byte(`{"choices":[{"id":"x","title":"叉"}]}`))
	if len(opts) != 1 || opts[0].ID != "x" || opts[0].Label != "叉" {
		t.Fatalf("%+v", opts)
	}
}
