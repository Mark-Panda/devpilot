package rulego

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
)

// cursorCLINode 使用 Cursor Agent CLI 的 --print 非交互模式执行一次 Prompt，不经 ACP（无 agent acp JSON-RPC）。
// 等价于终端：agent --print --output-format <fmt> [--workspace <dir>] ... "<prompt>"
type cursorCLINode struct {
	cfg           cursorCLIConfig
	promptTmpl    el.Template
	promptTmplSet bool
	workDirTmpl   el.Template
}

type cursorCLIConfig struct {
	AgentCommand        string   `json:"agentCommand"`
	TimeoutSec          int      `json:"timeoutSec"`
	WorkDir             string   `json:"workDir"`
	Model               string   `json:"model"`
	Mode                string   `json:"mode"` // "", "agent", "plan", "ask"
	OutputFormat        string   `json:"outputFormat"`
	Trust               bool     `json:"trust"`
	Force               bool     `json:"force"`
	StreamPartialOutput bool     `json:"streamPartialOutput"`
	ExtraArgs           []string `json:"extraArgs"`
	// PromptTemplate 非空时作为提示词模板，经 ${...} 渲染（RuleGo el 模板，可用 metadata、data 等）；为空则使用上游 msg.Data。
	PromptTemplate string `json:"promptTemplate"`
}

func (n *cursorCLINode) Type() string { return "cursor/cli" }

func (n *cursorCLINode) New() types.Node { return &cursorCLINode{} }

func (n *cursorCLINode) Init(_ types.Config, configuration types.Configuration) error {
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
	n.cfg.Model = strings.TrimSpace(n.cfg.Model)
	n.cfg.Mode = strings.TrimSpace(strings.ToLower(n.cfg.Mode))
	n.cfg.OutputFormat = strings.TrimSpace(strings.ToLower(n.cfg.OutputFormat))
	if n.cfg.OutputFormat == "" {
		n.cfg.OutputFormat = "text"
	}
	if pt := strings.TrimSpace(n.cfg.PromptTemplate); pt != "" {
		tmpl, err := el.NewTemplate(pt)
		if err != nil {
			return fmt.Errorf("cursor/cli: promptTemplate 模板: %w", err)
		}
		n.promptTmpl = tmpl
		n.promptTmplSet = true
	} else {
		n.promptTmplSet = false
	}
	wdTmpl, err := el.NewTemplate(n.cfg.WorkDir)
	if err != nil {
		return fmt.Errorf("cursor/cli: workDir 模板: %w", err)
	}
	n.workDirTmpl = wdTmpl
	return nil
}

func (n *cursorCLINode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	cwd := resolveCursorWorkDir(ctx, msg, n.workDirTmpl)
	if cwd == "" {
		ctx.TellFailure(msg, errors.New("cursor/cli: 缺少工作目录，请配置 workDir 或在 metadata 中设置 cursor_acp_cwd（或与 gitPrepare 联用 api_route_tracer_service_path）"))
		return
	}

	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	var prompt string
	if n.promptTmplSet {
		prompt = strings.TrimSpace(n.promptTmpl.ExecuteAsString(env))
	} else {
		prompt = strings.TrimSpace(msg.GetData())
	}
	if prompt == "" {
		ctx.TellFailure(msg, errors.New("cursor/cli: 提示词为空（未配置 promptTemplate 时请在上游传入 msg.Data；已配置时请检查模板与变量）"))
		return
	}

	agentCmd := expandUserPath(n.cfg.AgentCommand)
	if agentCmd == "" {
		agentCmd = "agent"
	}

	args := buildCursorCLIPrintArgs(&n.cfg, cwd, prompt)

	log.Printf("[rulego] cursor/cli 参数: cwd=%q agentCommand=%q timeoutSec=%d outputFormat=%q mode=%q model=%q trust=%v force=%v streamPartial=%v extraArgs=%v promptFromTemplate=%v promptLen=%d workDirRaw=%q",
		cwd, agentCmd, n.cfg.TimeoutSec, n.cfg.OutputFormat, n.cfg.Mode, n.cfg.Model, n.cfg.Trust, n.cfg.Force, n.cfg.StreamPartialOutput, n.cfg.ExtraArgs, n.promptTmplSet, len(prompt), n.cfg.WorkDir)

	parent := ctx.GetContext()
	if parent == nil {
		parent = context.Background()
	}
	runCtx, cancel := context.WithTimeout(parent, time.Duration(n.cfg.TimeoutSec)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(runCtx, agentCmd, args...)
	cmd.Dir = cwd
	cmd.Env = os.Environ()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		tail := trimRunOutputTail(stderr.String(), 8000)
		log.Printf("[rulego] cursor/cli 失败: %v stderrTail=%q", err, tail)
		wrapped := err
		if tail != "" {
			wrapped = fmt.Errorf("%w; stderr: %s", err, tail)
		}
		ctx.TellFailure(msg, wrapped)
		return
	}

	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	out.Metadata.PutValue("cursor_cli_exit_code", "0")
	stderrStr := strings.TrimSpace(stderr.String())
	if stderrStr != "" {
		out.Metadata.PutValue("cursor_cli_stderr_tail", trimRunOutputTail(stderrStr, 8000))
	}
	text := strings.TrimSpace(stdout.String())
	out.SetData(text)
	ctx.TellSuccess(out)
}

func buildCursorCLIPrintArgs(cfg *cursorCLIConfig, workspace, prompt string) []string {
	out := []string{"--print"}
	outf := cfg.OutputFormat
	if outf == "" {
		outf = "text"
	}
	out = append(out, "--output-format", outf)
	ws := strings.TrimSpace(workspace)
	if ws != "" {
		out = append(out, "--workspace", ws)
	}
	if m := strings.TrimSpace(cfg.Model); m != "" {
		out = append(out, "--model", m)
	}
	switch cfg.Mode {
	case "plan":
		out = append(out, "--mode", "plan")
	case "ask":
		out = append(out, "--mode", "ask")
	}
	if cfg.Trust {
		out = append(out, "--trust")
	}
	if cfg.Force {
		out = append(out, "--force")
	}
	if cfg.StreamPartialOutput {
		out = append(out, "--stream-partial-output")
	}
	for _, a := range cfg.ExtraArgs {
		a = strings.TrimSpace(a)
		if a != "" {
			out = append(out, a)
		}
	}
	out = append(out, prompt)
	return out
}

func trimRunOutputTail(s string, max int) string {
	s = strings.TrimSpace(s)
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[len(s)-max:]
}

func (n *cursorCLINode) Destroy() {
	n.cfg = cursorCLIConfig{}
	n.promptTmpl = nil
	n.promptTmplSet = false
	n.workDirTmpl = nil
}

func init() {
	rulego.Registry.Register(&cursorCLINode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&cursorCLINode{}).Type())
}
