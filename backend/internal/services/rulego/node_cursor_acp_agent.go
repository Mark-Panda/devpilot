package rulego

import (
	"context"
	"errors"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"devpilot/backend/internal/cursoracp"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
)

// cursorACPAgentNode 在同一 ACP 会话内多轮 session/prompt，并对权限 / 规划 / elicitation / cursor/* 自动批复。
type cursorACPAgentNode struct {
	cfg cursorACPAgentConfig
}

type cursorACPAgentConfig struct {
	AgentCommand               string   `json:"agentCommand"`
	Args                       []string `json:"args"`
	TimeoutSec                 int      `json:"timeoutSec"`
	WorkDir                    string   `json:"workDir"`
	SessionMode                string   `json:"sessionMode"`
	PermissionOptionID         string   `json:"permissionOptionId"`
	ClientName                 string   `json:"clientName"`
	ClientVersion              string   `json:"clientVersion"`
	MaxPromptRounds            int      `json:"maxPromptRounds"`
	ContinuationPrompt         string   `json:"continuationPrompt"`
	AutoPlanOptionID           string   `json:"autoPlanOptionId"`
	AutoAskQuestionOptionIndex int      `json:"autoAskQuestionOptionIndex"`
	ElicitationURLAction       string   `json:"elicitationUrlAction"`
	VerboseLog                 bool     `json:"verboseLog"`
}

func (n *cursorACPAgentNode) Type() string { return "cursor/acp_agent" }

func (n *cursorACPAgentNode) New() types.Node { return &cursorACPAgentNode{} }

func (n *cursorACPAgentNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.AgentCommand = strings.TrimSpace(n.cfg.AgentCommand)
	if n.cfg.AgentCommand == "" {
		n.cfg.AgentCommand = "agent"
	}
	if n.cfg.TimeoutSec <= 0 {
		n.cfg.TimeoutSec = 3600
	}
	cursorACPVerboseLogDefault(configuration, &n.cfg.VerboseLog)
	return nil
}

func (n *cursorACPAgentNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
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
		ctx.TellFailure(msg, errors.New("cursor/acp_agent: 缺少工作目录，请配置 workDir 或在 metadata 中设置 cursor_acp_cwd（或与 gitPrepare 联用 api_route_tracer_service_path）"))
		return
	}

	prompt := strings.TrimSpace(msg.GetData())
	if prompt == "" {
		ctx.TellFailure(msg, errors.New("cursor/acp_agent: msg.Data 为空，请传入首轮任务描述"))
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
		AutoReply: cursoracp.AutoReplyConfig{
			PlanOptionID:           n.cfg.AutoPlanOptionID,
			AskQuestionOptionIndex: n.cfg.AutoAskQuestionOptionIndex,
			ElicitationURLAction:   n.cfg.ElicitationURLAction,
		},
		VerboseLog: n.cfg.VerboseLog,
	}

	runCtx, cancel := context.WithTimeout(context.Background(), time.Duration(n.cfg.TimeoutSec)*time.Second)
	defer cancel()

	ar, err := cursoracp.RunAgentLoop(runCtx, cfg, cursoracp.AgentLoopParams{
		Cwd:                 cwd,
		InitialPrompt:       prompt,
		MaxPromptRounds:     n.cfg.MaxPromptRounds,
		ContinuationPrompt:  n.cfg.ContinuationPrompt,
	})
	if err != nil {
		log.Printf("[rulego] cursor/acp_agent 失败: %v", err)
		ctx.TellFailure(msg, err)
		return
	}

	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	out.Metadata.PutValue("cursor_acp_agent_rounds", strconv.Itoa(ar.Rounds))
	out.Metadata.PutValue("cursor_acp_stop_reason", ar.StopReason)
	if ar.LastStreamText != "" {
		out.Metadata.PutValue("cursor_acp_last_stream_text", ar.LastStreamText)
	}
	final := ar.CombinedText
	if strings.TrimSpace(final) == "" && ar.LastPrompt != nil && len(ar.LastPrompt.Raw) > 0 {
		final = string(ar.LastPrompt.Raw)
	}
	out.SetData(final)
	ctx.TellSuccess(out)
}

func (n *cursorACPAgentNode) Destroy() { n.cfg = cursorACPAgentConfig{} }

func init() {
	rulego.Registry.Register(&cursorACPAgentNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&cursorACPAgentNode{}).Type())
}
