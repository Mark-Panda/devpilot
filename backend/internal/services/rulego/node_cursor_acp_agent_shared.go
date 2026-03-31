package rulego

import (
	"context"
	"errors"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"devpilot/backend/internal/cursoracp"

	"github.com/rulego/rulego/api/types"
)

// acpProgressLogMaxChars 执行日志中单次写入的流式预览上限，避免 Pebble value 过大。
const acpProgressLogMaxChars = 240_000

func limitACPProgressBody(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= acpProgressLogMaxChars {
		return s
	}
	return s[:acpProgressLogMaxChars] + "\n…(truncated)"
}

// cursorACPAgentConfig 为 cursor/acp_agent 与 cursor/acp_agent_step 共用配置（step 忽略多轮相关字段）。
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
	// UseRegisteredAfterRoundHook 为 true 时使用 cursoracp.SetAfterRoundHook 注册的回调作为每轮后决策。
	UseRegisteredAfterRoundHook bool `json:"useRegisteredAfterRoundHook"`
	// UseAskQuestionDialog 为 true 且桌面已注册 AskQuestionGlobalPicker 时，cursor/ask_question 由弹窗人工选选项；否则用 autoAskQuestionOptionIndex。
	UseAskQuestionDialog bool `json:"useAskQuestionDialog"`
}

func initCursorACPAgentConfig(configuration types.Configuration, cfg *cursorACPAgentConfig) error {
	if err := mapConfigurationToStruct(configuration, cfg); err != nil {
		return err
	}
	cfg.AgentCommand = strings.TrimSpace(cfg.AgentCommand)
	if cfg.AgentCommand == "" {
		cfg.AgentCommand = "agent"
	}
	if cfg.TimeoutSec <= 0 {
		cfg.TimeoutSec = 3600
	}
	cursorACPVerboseLogDefault(configuration, &cfg.VerboseLog)
	return nil
}

// runCursorACPAgent 执行 ACP 多轮循环；maxRoundsOverride>0 时覆盖配置中的 maxPromptRounds（step 节点传 1）。
func runCursorACPAgent(ctx types.RuleContext, msg types.RuleMsg, cfg *cursorACPAgentConfig, maxRoundsOverride int, nodeType string) {
	cwd := expandUserPath(cfg.WorkDir)
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
		ctx.TellFailure(msg, errors.New(nodeType+": 缺少工作目录，请配置 workDir 或在 metadata 中设置 cursor_acp_cwd（或与 gitPrepare 联用 api_route_tracer_service_path）"))
		return
	}

	prompt := strings.TrimSpace(msg.GetData())
	if prompt == "" {
		ctx.TellFailure(msg, errors.New(nodeType+": msg.Data 为空，请传入任务描述"))
		return
	}

	maxR := cfg.MaxPromptRounds
	if maxRoundsOverride > 0 {
		maxR = maxRoundsOverride
	}

	var afterRound cursoracp.AfterRoundFunc
	if cfg.UseRegisteredAfterRoundHook {
		if maxR <= 1 {
			ctx.TellFailure(msg, errors.New(nodeType+": useRegisteredAfterRoundHook 需要 maxPromptRounds>=2（单轮请用 cursor/acp_agent_step 或 cursor/acp）"))
			return
		}
		fn := cursoracp.AfterRoundHook()
		if fn == nil {
			ctx.TellFailure(msg, errors.New(nodeType+": 已开启 useRegisteredAfterRoundHook 但未注册 cursoracp.SetAfterRoundHook"))
			return
		}
		afterRound = fn
	}

	agentCmd := expandUserPath(cfg.AgentCommand)
	if agentCmd == "" {
		agentCmd = "agent"
	}

	acpCfg := cursoracp.Config{
		SessionMode:        normalizeACPSessionMode(cfg.SessionMode),
		AgentCommand:       agentCmd,
		Args:               cfg.Args,
		Env:                os.Environ(),
		ClientName:         cfg.ClientName,
		ClientVersion:      cfg.ClientVersion,
		PermissionOptionID: cfg.PermissionOptionID,
		AutoReply: cursoracp.AutoReplyConfig{
			PlanOptionID:           cfg.AutoPlanOptionID,
			AskQuestionOptionIndex: cfg.AutoAskQuestionOptionIndex,
			ElicitationURLAction:   cfg.ElicitationURLAction,
		},
		VerboseLog: cfg.VerboseLog,
	}
	if cfg.UseAskQuestionDialog {
		if fn := cursoracp.AskQuestionGlobalPicker(); fn != nil {
			acpCfg.AskQuestionPicker = fn
		} else {
			log.Printf("[rulego] %s: useAskQuestionDialog 已开启但未注册问答弹窗（非桌面环境），将使用 autoAskQuestionOptionIndex", nodeType)
		}
	}

	parent := ctx.GetContext()
	if parent == nil {
		parent = context.Background()
	}
	runCtx, cancel := context.WithTimeout(parent, time.Duration(cfg.TimeoutSec)*time.Second)
	defer cancel()

	execID := ""
	nodeID := ""
	if msg.Metadata != nil {
		execID = strings.TrimSpace(msg.Metadata.GetValue("_execution_id"))
	}
	if ctx.Self() != nil {
		nodeID = ctx.Self().GetNodeId().Id
	}
	var progMu sync.Mutex
	var lastProgFlush time.Time
	const progThrottle = 450 * time.Millisecond

	loopParams := cursoracp.AgentLoopParams{
		Cwd:                cwd,
		InitialPrompt:      prompt,
		MaxPromptRounds:    maxR,
		ContinuationPrompt: cfg.ContinuationPrompt,
		AfterRound:         afterRound,
		DialogTask:         dialogTaskFromMsgMeta(msg),
	}
	if execID != "" && nodeID != "" && globalExecutionLogStore != nil {
		loopParams.OnStreamProgress = func(preview string) {
			preview = limitACPProgressBody(preview)
			if preview == "" {
				return
			}
			progMu.Lock()
			defer progMu.Unlock()
			now := time.Now()
			if !lastProgFlush.IsZero() && now.Sub(lastProgFlush) < progThrottle {
				return
			}
			lastProgFlush = now
			meta := map[string]string{"cursor_acp_progress": "true"}
			_ = globalExecutionLogStore.PatchNodeLogProgress(context.Background(), execID, nodeID, preview, MetadataToJSON(meta))
		}
	}

	ar, err := cursoracp.RunAgentLoop(runCtx, acpCfg, loopParams)
	if err != nil {
		log.Printf("[rulego] %s 失败: %v", nodeType, err)
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
	if strings.TrimSpace(ar.StderrTail) != "" {
		out.Metadata.PutValue("cursor_acp_stderr_tail", strings.TrimSpace(ar.StderrTail))
	}
	final := ar.CombinedText
	if strings.TrimSpace(final) == "" && ar.LastPrompt != nil && len(ar.LastPrompt.Raw) > 0 {
		final = string(ar.LastPrompt.Raw)
	}
	out.SetData(final)
	ctx.TellSuccess(out)
}

func dialogTaskFromMsgMeta(msg types.RuleMsg) cursoracp.DialogTask {
	if msg.Metadata == nil {
		return cursoracp.DialogTask{}
	}
	m := msg.Metadata
	return cursoracp.DialogTask{
		RuleID:      strings.TrimSpace(m.GetValue("_rule_id")),
		RuleName:    strings.TrimSpace(m.GetValue("_rule_name")),
		ExecutionID: strings.TrimSpace(m.GetValue("_execution_id")),
	}
}
