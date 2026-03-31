package rulego

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"devpilot/backend/internal/cursoracp"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
)

// cursorACPNode 通过 Cursor CLI 的 ACP（agent acp）执行一次会话内 Prompt。
// 本节点支持流式、工具权限自动批复与会话协议。
type cursorACPNode struct {
	cfg cursorACPConfig
}

type cursorACPConfig struct {
	AgentCommand       string   `json:"agentCommand"`
	Args               []string `json:"args"`
	TimeoutSec         int      `json:"timeoutSec"`
	WorkDir            string   `json:"workDir"`
	SessionMode        string   `json:"sessionMode"`
	PermissionOptionID string   `json:"permissionOptionId"`
	ClientName         string   `json:"clientName"`
	ClientVersion      string   `json:"clientVersion"`
	VerboseLog         bool     `json:"verboseLog"`
}

func (n *cursorACPNode) Type() string { return "cursor/acp" }

func (n *cursorACPNode) New() types.Node { return &cursorACPNode{} }

func (n *cursorACPNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.AgentCommand = strings.TrimSpace(n.cfg.AgentCommand)
	if n.cfg.AgentCommand == "" {
		n.cfg.AgentCommand = "agent"
	}
	if n.cfg.TimeoutSec <= 0 {
		n.cfg.TimeoutSec = 1800
	}
	cursorACPVerboseLogDefault(configuration, &n.cfg.VerboseLog)
	return nil
}

func (n *cursorACPNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	cwd := expandUserPath(n.cfg.WorkDir)
	if msg.Metadata != nil {
		if v := strings.TrimSpace(msg.Metadata.GetValue("cursor_acp_cwd")); v != "" {
			cwd = expandUserPath(v)
		}
		if cwd == "" {
			if v := strings.TrimSpace(msg.Metadata.GetValue("api_route_tracer_service_path")); v != "" {
				cwd = expandUserPath(v)
			}
		}
	}
	if cwd == "" {
		ctx.TellFailure(msg, errors.New("cursor/acp: 缺少工作目录，请配置 workDir 或在 metadata 中设置 cursor_acp_cwd（或与 gitPrepare 联用 api_route_tracer_service_path）"))
		return
	}

	prompt := strings.TrimSpace(msg.GetData())
	if prompt == "" {
		ctx.TellFailure(msg, errors.New("cursor/acp: msg.Data 为空，请传入用户提示词"))
		return
	}

	agentCmd := expandUserPath(n.cfg.AgentCommand)
	if agentCmd == "" {
		agentCmd = "agent"
	}

	cfg := cursoracp.Config{
		SessionMode:        normalizeACPSessionMode(n.cfg.SessionMode),
		AgentCommand:       agentCmd,
		Args:               n.cfg.Args,
		Env:                os.Environ(),
		ClientName:         n.cfg.ClientName,
		ClientVersion:      n.cfg.ClientVersion,
		PermissionOptionID: n.cfg.PermissionOptionID,
		VerboseLog:         n.cfg.VerboseLog,
	}

	parent := ctx.GetContext()
	if parent == nil {
		parent = context.Background()
	}
	runCtx, cancel := context.WithTimeout(parent, time.Duration(n.cfg.TimeoutSec)*time.Second)
	defer cancel()

	once, err := cursoracp.RunOnce(runCtx, cfg, cwd, prompt)
	if err != nil {
		log.Printf("[rulego] cursor/acp 失败: %v", err)
		ctx.TellFailure(msg, err)
		return
	}
	pr := once.Prompt
	stream := once.Stream

	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	if pr != nil {
		out.Metadata.PutValue("cursor_acp_stop_reason", pr.StopReason)
	}
	if stream != "" {
		out.Metadata.PutValue("cursor_acp_stream_text", stream)
	}
	if strings.TrimSpace(once.StderrTail) != "" {
		out.Metadata.PutValue("cursor_acp_stderr_tail", once.StderrTail)
	}
	final := stream
	if pr != nil && strings.TrimSpace(final) == "" && len(pr.Raw) > 0 {
		final = string(pr.Raw)
	}
	out.SetData(final)
	ctx.TellSuccess(out)
}

func (n *cursorACPNode) Destroy() { n.cfg = cursorACPConfig{} }

func expandUserPath(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	if strings.HasPrefix(s, "~/") {
		h, err := os.UserHomeDir()
		if err == nil && h != "" {
			return filepath.Join(h, strings.TrimPrefix(s, "~/"))
		}
	}
	return s
}

func normalizeACPSessionMode(s string) string {
	switch strings.TrimSpace(strings.ToLower(s)) {
	case "plan", "ask":
		return strings.TrimSpace(strings.ToLower(s))
	default:
		return ""
	}
}

// cursorACPVerboseLogDefault 未在 DSL 中配置 verboseLog 时默认 true，便于观察工作区与流式输出。
func cursorACPVerboseLogDefault(configuration types.Configuration, verbose *bool) {
	if configuration == nil {
		*verbose = true
		return
	}
	b, err := json.Marshal(configuration)
	if err != nil {
		return
	}
	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return
	}
	if _, ok := m["verboseLog"]; !ok {
		*verbose = true
	}
}

func init() {
	rulego.Registry.Register(&cursorACPNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&cursorACPNode{}).Type())
}
