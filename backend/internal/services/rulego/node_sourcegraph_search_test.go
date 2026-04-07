package rulego

import (
	"encoding/json"
	"testing"
)

func TestResolveSourcegraphQuery_UsesFirstBatchQuery(t *testing.T) {
	data := `{"queries":["repo:frontend test1","repo:frontend test2"]}`

	got := resolveSourcegraphQuery(data, "")

	if got != "repo:frontend test1" {
		t.Fatalf("resolveSourcegraphQuery batch = %q, want first query", got)
	}
}

func TestResolveSourcegraphQueries_UsesBatchQueries(t *testing.T) {
	data := `{"queries":[" repo:frontend test1 ","","repo:frontend test2 "]}`

	got := resolveSourcegraphQueries(data, "")

	if len(got) != 2 {
		t.Fatalf("resolveSourcegraphQueries len = %d, want 2", len(got))
	}
	if got[0] != "repo:frontend test1" || got[1] != "repo:frontend test2" {
		t.Fatalf("resolveSourcegraphQueries = %#v", got)
	}
}

func TestMergeSourcegraphSearchResults_AggregatesSearchPayload(t *testing.T) {
	queries := []string{"q1", "q2"}
	results := []json.RawMessage{
		json.RawMessage(`{"search":{"results":{"matchCount":1,"limitHit":false,"results":[{"__typename":"FileMatch","repository":{"name":"repo1"}}]}}}`),
		json.RawMessage(`{"search":{"results":{"matchCount":2,"limitHit":true,"results":[{"__typename":"FileMatch","repository":{"name":"repo2"}},{"__typename":"CommitSearchResult","url":"https://example.com/commit"}]}}}`),
	}

	raw, err := mergeSourcegraphSearchResults(queries, results)
	if err != nil {
		t.Fatal(err)
	}

	var payload struct {
		Query   string   `json:"query"`
		Queries []string `json:"queries"`
		Search  struct {
			Results struct {
				MatchCount int               `json:"matchCount"`
				LimitHit   bool              `json:"limitHit"`
				Results    []json.RawMessage `json:"results"`
			} `json:"results"`
		} `json:"search"`
		Results []struct {
			Query string          `json:"query"`
			Data  json.RawMessage `json:"data"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Query != "q1" {
		t.Fatalf("payload.Query = %q, want q1", payload.Query)
	}
	if len(payload.Queries) != 2 || payload.Queries[1] != "q2" {
		t.Fatalf("payload.Queries = %#v", payload.Queries)
	}
	if payload.Search.Results.MatchCount != 3 {
		t.Fatalf("matchCount = %d, want 3", payload.Search.Results.MatchCount)
	}
	if !payload.Search.Results.LimitHit {
		t.Fatalf("limitHit = false, want true")
	}
	if len(payload.Search.Results.Results) != 3 {
		t.Fatalf("merged results len = %d, want 3", len(payload.Search.Results.Results))
	}
	if len(payload.Results) != 2 || payload.Results[1].Query != "q2" {
		t.Fatalf("per-query results = %#v", payload.Results)
	}
}
