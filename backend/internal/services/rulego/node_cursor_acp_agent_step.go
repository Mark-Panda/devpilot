package rulego

import (
	"fmt"
	"log"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/utils/el"
)

// cursorACPAgentStepNode 单次 session/prompt（maxPromptRounds=1），用于规则链多节点串联、在中间插入人工或其它节点。
// 与 cursor/acp_agent 共用配置结构；忽略 maxPromptRounds、continuationPrompt、useRegisteredAfterRoundHook；支持 useAskQuestionDialog。
type cursorACPAgentStepNode struct {
	cfg           cursorACPAgentConfig
	promptTmpl    el.Template
	promptTmplSet bool
	workDirTmpl   el.Template
}

func (n *cursorACPAgentStepNode) Type() string { return "cursor/acp_agent_step" }

func (n *cursorACPAgentStepNode) New() types.Node { return &cursorACPAgentStepNode{} }

func (n *cursorACPAgentStepNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := initCursorACPAgentConfig(configuration, &n.cfg); err != nil {
		return err
	}
	pt, ptSet, err := initCursorPromptTemplate(n.cfg.PromptTemplate, n.Type())
	if err != nil {
		return err
	}
	n.promptTmpl = pt
	n.promptTmplSet = ptSet
	t, err := el.NewTemplate(n.cfg.WorkDir)
	if err != nil {
		return fmt.Errorf("cursor/acp_agent_step: workDir 模板: %w", err)
	}
	n.workDirTmpl = t
	return nil
}

func (n *cursorACPAgentStepNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	runCursorACPAgent(ctx, msg, &n.cfg, n.workDirTmpl, n.promptTmpl, n.promptTmplSet, 1, n.Type())
}

func (n *cursorACPAgentStepNode) Destroy() {
	n.cfg = cursorACPAgentConfig{}
	n.promptTmpl = nil
	n.promptTmplSet = false
	n.workDirTmpl = nil
}

func init() {
	rulego.Registry.Register(&cursorACPAgentStepNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&cursorACPAgentStepNode{}).Type())
}
