package rulego

import (
	"errors"
	"strings"
	"testing"

	"github.com/rulego/rulego/api/types"
)

type fakeWorkspaceResolver struct {
	resolve func(id string) (string, error)
}

func (f fakeWorkspaceResolver) ResolveRoot(workspaceID string) (string, error) {
	if f.resolve == nil {
		return "", errors.New("no resolver")
	}
	return f.resolve(workspaceID)
}

func TestNormalizeACPArgsForWorkspace_DedupAndInject(t *testing.T) {
	root := "/abs/ws/root"
	in := []string{
		"acp",
		"--workspace", "/old/1",
		"--workspace=/old/2",
		"--foo",
		"--workspace", "/old/3",
	}
	out := normalizeACPArgsForWorkspace(in, root)

	// 1) 只剩一个 --workspace 且值为 root
	gotWorkspace := 0
	for i := 0; i < len(out); i++ {
		if strings.TrimSpace(out[i]) == "--workspace" {
			gotWorkspace++
			if i+1 >= len(out) {
				t.Fatalf("missing workspace value: %v", out)
			}
			if out[i+1] != root {
				t.Fatalf("workspace root mismatch: got=%q want=%q out=%v", out[i+1], root, out)
			}
		}
		if strings.HasPrefix(strings.TrimSpace(out[i]), "--workspace=") {
			t.Fatalf("unexpected workspace= form left in args: %v", out)
		}
	}
	if gotWorkspace != 1 {
		t.Fatalf("expected exactly 1 --workspace, got=%d out=%v", gotWorkspace, out)
	}

	// 2) acp 子命令仍存在
	hasACP := false
	for _, a := range out {
		if strings.TrimSpace(a) == "acp" {
			hasACP = true
			break
		}
	}
	if !hasACP {
		t.Fatalf("missing acp subcommand: %v", out)
	}

	// 3) --workspace 必须在 acp 之前（global option）
	wsIdx := -1
	acpIdx := -1
	for i, a := range out {
		if strings.TrimSpace(a) == "--workspace" && wsIdx < 0 {
			wsIdx = i
		}
		if strings.TrimSpace(a) == "acp" && acpIdx < 0 {
			acpIdx = i
		}
	}
	if wsIdx < 0 || acpIdx < 0 || wsIdx > acpIdx {
		t.Fatalf("expected --workspace before acp: out=%v wsIdx=%d acpIdx=%d", out, wsIdx, acpIdx)
	}
}

func TestNormalizeACPArgsForWorkspace_EnsureACPWhenArgsEmpty(t *testing.T) {
	root := "/abs/ws/root"
	out := normalizeACPArgsForWorkspace(nil, root)
	if len(out) < 3 {
		t.Fatalf("unexpected args: %v", out)
	}
	if strings.TrimSpace(out[0]) != "--workspace" || out[1] != root {
		t.Fatalf("expected --workspace injection, out=%v", out)
	}
	if strings.TrimSpace(out[2]) != "acp" {
		t.Fatalf("expected acp subcommand, out=%v", out)
	}
}

func TestResolveCursorACPCwd_WorkspaceForcesOverride(t *testing.T) {
	cfg := &cursorACPAgentConfig{WorkDir: "/should/not/use"}
	msg := types.NewMsg(0, "", types.JSON, types.NewMetadata(), "")
	msg.Metadata.PutValue("cursor_acp_cwd", "/also/should/not/use")

	cwd, err := resolveCursorACPCwd(cfg, msg, true, "/ws/root", "cursor/acp_agent")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if cwd != "/ws/root" {
		t.Fatalf("cwd not forced to workspaceRoot: got=%q", cwd)
	}
}

func TestResolveWorkspaceRoot_WorkspaceIDNotFound(t *testing.T) {
	prev := globalWorkspaceRootResolver
	defer func() { globalWorkspaceRootResolver = prev }()

	SetGlobalWorkspaceRootResolver(fakeWorkspaceResolver{
		resolve: func(id string) (string, error) {
			return "", errors.New("workspace 不存在: " + id)
		},
	})

	cfg := &cursorACPAgentConfig{WorkspaceID: "nope"}
	_, enabled, err := resolveWorkspaceRoot(cfg)
	if !enabled {
		t.Fatalf("expected workspace enabled")
	}
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), "workspace 不存在") {
		t.Fatalf("error not clear enough: %v", err)
	}
}

func TestNormalizeACPArgsForWorkspace_DoesNotBreakFlagValuePairs(t *testing.T) {
	root := "/abs/ws/root"
	in := []string{"--model", "gpt-4o", "--header", "k: v"} // 没有 acp
	out := normalizeACPArgsForWorkspace(in, root)

	// 确保 flag+value 对未被打断
	// 期望：--model gpt-4o --header k: v --workspace <root> acp（或 --workspace 在 acp 前的任意位置）
	for i := 0; i < len(out)-1; i++ {
		if strings.TrimSpace(out[i]) == "--model" && strings.TrimSpace(out[i+1]) != "gpt-4o" {
			t.Fatalf("flag-value pair broken: out=%v", out)
		}
		if strings.TrimSpace(out[i]) == "--header" && strings.TrimSpace(out[i+1]) != "k: v" {
			t.Fatalf("flag-value pair broken: out=%v", out)
		}
	}
	// --workspace 在 acp 之前
	wsIdx := -1
	acpIdx := -1
	for i, a := range out {
		if strings.TrimSpace(a) == "--workspace" && wsIdx < 0 {
			wsIdx = i
		}
		if strings.TrimSpace(a) == "acp" && acpIdx < 0 {
			acpIdx = i
		}
	}
	if wsIdx < 0 || acpIdx < 0 || wsIdx > acpIdx {
		t.Fatalf("expected --workspace before acp: out=%v wsIdx=%d acpIdx=%d", out, wsIdx, acpIdx)
	}
}

func TestRemoveWorkspaceArgs_MissingValueDoesNotSwallowNextFlag(t *testing.T) {
	in := []string{"--workspace", "--foo", "acp"}
	out := removeWorkspaceArgs(in)
	if len(out) != 2 || strings.TrimSpace(out[0]) != "--foo" || strings.TrimSpace(out[1]) != "acp" {
		t.Fatalf("unexpected removal behavior: in=%v out=%v", in, out)
	}
}

