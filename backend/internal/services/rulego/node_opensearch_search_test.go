package rulego

import (
	"encoding/json"
	"testing"
)

func TestResolveOpenSearchBody_BusinessJSONMerged(t *testing.T) {
	defaultJSON := `{"size":100,"query":{"match_all":{}}}`
	msg := `{"serverName":"channel-platform-server","query":"/entry/withdraw/invoice/feishu/callback"}`
	body, err := resolveOpenSearchBody(msg, defaultJSON)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(body, &m); err != nil {
		t.Fatal(err)
	}
	q, ok := m["query"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected query object, got %T", m["query"])
	}
	b, ok := q["bool"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected bool query, got %#v", q)
	}
	must, ok := b["must"].([]interface{})
	if !ok || len(must) < 3 {
		t.Fatalf("expected bool.must with base + 2 matches, got %#v", b["must"])
	}
}

func TestResolveOpenSearchBody_FullDSLPassThrough(t *testing.T) {
	defaultJSON := `{"size":10,"query":{"match_all":{}}}`
	msg := `{"size":5,"query":{"match_all":{}}}`
	body, err := resolveOpenSearchBody(msg, defaultJSON)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != msg {
		t.Fatalf("expected passthrough, got %s", string(body))
	}
}

func TestResolveOpenSearchBody_RootQueryStringMerged(t *testing.T) {
	defaultJSON := `{"size":100,"query":{"match_all":{}}}`
	msg := `{"query":"literal only"}`
	body, err := resolveOpenSearchBody(msg, defaultJSON)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(body, &m); err != nil {
		t.Fatal(err)
	}
	rootQ, ok := m["query"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected query object, got %s", string(body))
	}
	b, ok := rootQ["bool"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected merged bool query, got %s", string(body))
	}
	must, ok := b["must"].([]interface{})
	if !ok || len(must) < 2 {
		t.Fatalf("expected bool.must with base + match, got %#v", b["must"])
	}
}

func TestNormalizeQueryStringInBody_PathQuoted(t *testing.T) {
	raw := `{"query":{"bool":{"must":[{"query_string":{"query":"/entry/withdraw/invoice/feishu/callback"}}]}}}`
	out := normalizeQueryStringInBody([]byte(raw))
	var m map[string]interface{}
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	boolQ := m["query"].(map[string]interface{})["bool"].(map[string]interface{})
	must := boolQ["must"].([]interface{})
	qs := must[0].(map[string]interface{})["query_string"].(map[string]interface{})
	q := qs["query"].(string)
	if q != `"/entry/withdraw/invoice/feishu/callback"` {
		t.Fatalf("expected quoted phrase query, got %q", q)
	}
}

func TestResolveOpenSearchBody_EmptyMsgUsesDefaultWithPathQueryString(t *testing.T) {
	defaultJSON := `{"query":{"query_string":{"query":"/entry/withdraw/invoice/feishu/callback"}}}`
	body, err := resolveOpenSearchBody("", defaultJSON)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(body, &m); err != nil {
		t.Fatal(err)
	}
	qs := m["query"].(map[string]interface{})["query_string"].(map[string]interface{})
	q := qs["query"].(string)
	if q != `"/entry/withdraw/invoice/feishu/callback"` {
		t.Fatalf("expected quoted phrase query, got %q", q)
	}
}
