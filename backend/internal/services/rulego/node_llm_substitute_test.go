package rulego

import (
	"testing"
	"time"

	"github.com/rulego/rulego/api/types"

	"devpilot/backend/internal/llm"
)

func TestBuildLLMSubstituteFromMsg_msgAndNested(t *testing.T) {
	meta := types.NewMetadata()
	meta.PutValue("url", "https://x")
	m := types.NewMsg(time.Now().UnixMilli(), "default", types.JSON, meta, `{"contentArray":["a","b"],"n":1}`)

	sub := buildLLMSubstituteFromMsg(m)
	if sub["url"] != "https://x" {
		t.Fatalf("metadata url: got %q", sub["url"])
	}
	if sub["msg"] != `{"contentArray":["a","b"],"n":1}` {
		t.Fatalf("msg full: got %q", sub["msg"])
	}
	if sub["msg.contentArray"] != `["a","b"]` {
		t.Fatalf("msg.contentArray: got %q", sub["msg.contentArray"])
	}
	if sub["msg.n"] != "1" {
		t.Fatalf("msg.n: got %q", sub["msg.n"])
	}

	s := llm.ReplacePlaceholders("u=${url} body=${msg} arr=${msg.contentArray}", sub)
	want := `u=https://x body={"contentArray":["a","b"],"n":1} arr=["a","b"]`
	if s != want {
		t.Fatalf("replace: got %q want %q", s, want)
	}
}

func TestBuildLLMSubstituteFromMsg_plainTextData(t *testing.T) {
	m := types.NewMsg(time.Now().UnixMilli(), "default", types.JSON, nil, "hello")
	sub := buildLLMSubstituteFromMsg(m)
	if sub["msg"] != "hello" {
		t.Fatalf("msg: %q", sub["msg"])
	}
	if _, ok := sub["msg.contentArray"]; ok {
		t.Fatal("unexpected msg.contentArray")
	}
}
