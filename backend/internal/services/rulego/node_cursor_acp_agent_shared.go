package rulego

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"devpilot/backend/internal/cursoracp"
	"devpilot/backend/internal/workspace"

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
	WorkspaceID                string   `json:"workspaceId"`
	WorkspacePath              string   `json:"workspacePath"`
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
	cfg.WorkspaceID = strings.TrimSpace(cfg.WorkspaceID)
	cfg.WorkspacePath = strings.TrimSpace(cfg.WorkspacePath)
	if cfg.AgentCommand == "" {
		cfg.AgentCommand = "agent"
	}
	if cfg.TimeoutSec <= 0 {
		cfg.TimeoutSec = 3600
	}
	cursorACPVerboseLogDefault(configuration, &cfg.VerboseLog)
	return nil
}

type workspaceRootResolver interface {
	ResolveRoot(workspaceID string) (string, error)
}

var (
	globalWorkspaceRootResolver workspaceRootResolver

	defaultWorkspaceRootResolverOnce sync.Once
	defaultWorkspaceRootResolver     workspaceRootResolver
	defaultWorkspaceRootResolverErr  error
)

// SetGlobalWorkspaceRootResolver 在 Service 初始化时设置，供 cursor/acp_agent* 节点解析 workspaceId。
// 为空时会懒加载 workspace.NewWorkspaceServiceDefault()。
func SetGlobalWorkspaceRootResolver(r workspaceRootResolver) {
	globalWorkspaceRootResolver = r
}

func getWorkspaceRootResolver() (workspaceRootResolver, error) {
	if globalWorkspaceRootResolver != nil {
		return globalWorkspaceRootResolver, nil
	}
	defaultWorkspaceRootResolverOnce.Do(func() {
		defaultWorkspaceRootResolver, defaultWorkspaceRootResolverErr = workspace.NewWorkspaceServiceDefault()
	})
	if defaultWorkspaceRootResolverErr != nil {
		return nil, defaultWorkspaceRootResolverErr
	}
	if defaultWorkspaceRootResolver == nil {
		return nil, fmt.Errorf("workspace resolver 未初始化")
	}
	return defaultWorkspaceRootResolver, nil
}

func resolveWorkspaceRoot(cfg *cursorACPAgentConfig) (workspaceRoot string, enabled bool, err error) {
	if cfg == nil {
		return "", false, fmt.Errorf("cfg 为空")
	}
	if strings.TrimSpace(cfg.WorkspaceID) != "" {
		r, err := getWorkspaceRootResolver()
		if err != nil {
			return "", true, err
		}
		root, err := r.ResolveRoot(cfg.WorkspaceID)
		if err != nil {
			return "", true, err
		}
		root = strings.TrimSpace(root)
		if root == "" {
			return "", true, fmt.Errorf("workspaceRoot 为空")
		}
		return filepath.Clean(root), true, nil
	}
	if strings.TrimSpace(cfg.WorkspacePath) != "" {
		abs, err := filepath.Abs(cfg.WorkspacePath)
		if err != nil {
			return "", true, err
		}
		abs = filepath.Clean(abs)
		fi, err := os.Stat(abs)
		if err != nil {
			return "", true, err
		}
		if !fi.IsDir() {
			return "", true, fmt.Errorf("workspacePath 不是目录: %s", abs)
		}
		return abs, true, nil
	}
	return "", false, nil
}

func removeWorkspaceArgs(args []string) []string {
	if len(args) == 0 {
		return nil
	}
	out := make([]string, 0, len(args))
	for i := 0; i < len(args); i++ {
		a := strings.TrimSpace(args[i])
		if a == "--workspace" {
			// 尽量只移除 workspace 自身参数，避免在缺值时误吞掉下一个 flag。
			// 约定：若下一个 token 不是 flag（不以 "-" 开头），才视为 workspace 的值并跳过。
			if i+1 < len(args) && !strings.HasPrefix(strings.TrimSpace(args[i+1]), "-") {
				i++
			}
			continue
		}
		if strings.HasPrefix(a, "--workspace=") {
			continue
		}
		out = append(out, args[i])
	}
	return out
}

func ensureACPSubcommand(args []string) []string {
	for _, a := range args {
		if strings.TrimSpace(a) == "acp" {
			return args
		}
	}
	// 保守策略：追加到末尾，避免打断 "--flag value" 参数对。
	return append(append([]string(nil), args...), "acp")
}

func injectWorkspaceArg(args []string, workspaceRoot string) []string {
	workspaceRoot = strings.TrimSpace(workspaceRoot)
	if workspaceRoot == "" {
		return args
	}
	pos := -1
	for i, a := range args {
		if strings.TrimSpace(a) == "acp" {
			pos = i
			break
		}
	}
	if pos < 0 {
		// 保底：理论上 ensureACPSubcommand 已处理
		return append(append([]string{"--workspace", workspaceRoot}, args...), "acp")
	}
	// --workspace 是 Cursor CLI 的 global option，应出现在子命令 "acp" 之前。
	out := make([]string, 0, len(args)+2)
	out = append(out, args[:pos]...)
	out = append(out, "--workspace", workspaceRoot)
	out = append(out, args[pos:]...)
	return out
}

func normalizeACPArgsForWorkspace(args []string, workspaceRoot string) []string {
	args = removeWorkspaceArgs(args)
	args = ensureACPSubcommand(args)
	args = injectWorkspaceArg(args, workspaceRoot)
	return args
}

func resolveCursorACPCwd(cfg *cursorACPAgentConfig, msg types.RuleMsg, workspaceEnabled bool, workspaceRoot string, nodeType string) (string, error) {
	if workspaceEnabled {
		workspaceRoot = strings.TrimSpace(workspaceRoot)
		if workspaceRoot == "" {
			return "", fmt.Errorf("%s: workspaceRoot 为空", nodeType)
		}
		return workspaceRoot, nil
	}

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
		return "", fmt.Errorf("%s: 缺少工作目录，请配置 workDir 或在 metadata 中设置 cursor_acp_cwd（或与 gitPrepare 联用 api_route_tracer_service_path）", nodeType)
	}
	return cwd, nil
}

// runCursorACPAgent 执行 ACP 多轮循环；maxRoundsOverride>0 时覆盖配置中的 maxPromptRounds（step 节点传 1）。
func runCursorACPAgent(ctx types.RuleContext, msg types.RuleMsg, cfg *cursorACPAgentConfig, maxRoundsOverride int, nodeType string) {
	workspaceRoot, workspaceEnabled, err := resolveWorkspaceRoot(cfg)
	if err != nil {
		ctx.TellFailure(msg, err)
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

	args := cfg.Args
	if workspaceEnabled {
		args = normalizeACPArgsForWorkspace(args, workspaceRoot)
	}

	acpCfg := cursoracp.Config{
		SessionMode:        normalizeACPSessionMode(cfg.SessionMode),
		AgentCommand:       agentCmd,
		Args:               args,
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

	cwd, err := resolveCursorACPCwd(cfg, msg, workspaceEnabled, workspaceRoot, nodeType)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

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
