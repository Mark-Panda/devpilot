package cursoracp

import (
	"encoding/json"
	"testing"
)

func TestConfig_permissionOption(t *testing.T) {
	var d Config
	if got := d.permissionOption(); got != "allow-once" {
		t.Fatalf("default: %q", got)
	}
	cfg := Config{PermissionOptionID: "allow-always"}
	if got := cfg.permissionOption(); got != "allow-always" {
		t.Fatalf("allow-always: %q", got)
	}
	cfg.PermissionOptionID = "reject-once"
	if got := cfg.permissionOption(); got != "reject-once" {
		t.Fatalf("reject-once: %q", got)
	}
}

func TestConfig_args(t *testing.T) {
	var d Config
	if got := d.args(); len(got) != 1 || got[0] != "acp" {
		t.Fatalf("default args: %v", got)
	}
	custom := Config{Args: []string{"-k", "acp"}}
	got := custom.args()
	if len(got) != 2 || got[0] != "-k" || got[1] != "acp" {
		t.Fatalf("custom args: %v", got)
	}
}

func TestParseID(t *testing.T) {
	raw := json.RawMessage(`42`)
	id, ok := parseID(raw)
	if !ok || id != 42 {
		t.Fatalf("parseID(42) = %v, %v", id, ok)
	}
	if _, ok := parseID(nil); ok {
		t.Fatal("nil should fail")
	}
}

func TestClient_handleIncomingLine_response(t *testing.T) {
	c := NewClient(Config{})
	ch := make(chan outcome, 1)
	c.mu.Lock()
	c.pending[1] = ch
	c.mu.Unlock()

	line := []byte(`{"jsonrpc":"2.0","id":1,"result":{"sessionId":"abc"}}`)
	c.handleIncomingLine(line)

	select {
	case oc := <-ch:
		if oc.rpcErr != nil {
			t.Fatal(oc.rpcErr)
		}
		var out struct {
			SessionID string `json:"sessionId"`
		}
		if err := json.Unmarshal(oc.result, &out); err != nil || out.SessionID != "abc" {
			t.Fatalf("result: %+v err=%v", out, err)
		}
	default:
		t.Fatal("expected outcome")
	}
}

func TestClient_handleIncomingLine_sessionUpdate(t *testing.T) {
	var got string
	c := NewClient(Config{})
	c.SetOnChunk(func(text string) { got += text })

	line, err := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "session/update",
		"params": map[string]interface{}{
			"update": map[string]interface{}{
				"sessionUpdate": "agent_message_chunk",
				"content":       map[string]string{"text": "hi"},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	c.handleIncomingLine(line)
	if got != "hi" {
		t.Fatalf("chunk: %q", got)
	}
	if c.StreamText() != "hi" {
		t.Fatalf("stream: %q", c.StreamText())
	}
}
