package rulego

import (
	"log"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
)

// cursorACPAgentStepNode 单次 session/prompt（maxPromptRounds=1），用于规则链多节点串联、在中间插入人工或其它节点。
// 与 cursor/acp_agent 共用配置结构；忽略 maxPromptRounds、continuationPrompt、useRegisteredAfterRoundHook；支持 useAskQuestionDialog。
type cursorACPAgentStepNode struct {
	cfg cursorACPAgentConfig
}

func (n *cursorACPAgentStepNode) Type() string { return "cursor/acp_agent_step" }

func (n *cursorACPAgentStepNode) New() types.Node { return &cursorACPAgentStepNode{} }

func (n *cursorACPAgentStepNode) Init(_ types.Config, configuration types.Configuration) error {
	return initCursorACPAgentConfig(configuration, &n.cfg)
}

func (n *cursorACPAgentStepNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	runCursorACPAgent(ctx, msg, &n.cfg, 1, n.Type())
}

func (n *cursorACPAgentStepNode) Destroy() { n.cfg = cursorACPAgentConfig{} }

func init() {
	rulego.Registry.Register(&cursorACPAgentStepNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&cursorACPAgentStepNode{}).Type())
}
