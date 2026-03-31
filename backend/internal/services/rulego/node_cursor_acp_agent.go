package rulego

import (
	"log"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
)

// cursorACPAgentNode 在同一 ACP 会话内多轮 session/prompt，并对权限 / 规划 / elicitation / cursor/* 自动批复。
// useRegisteredAfterRoundHook 时由桌面弹窗续聊；弹窗内可「主动结束」(user_end) 或「完成标记结束」(end_marker)。
type cursorACPAgentNode struct {
	cfg cursorACPAgentConfig
}

func (n *cursorACPAgentNode) Type() string { return "cursor/acp_agent" }

func (n *cursorACPAgentNode) New() types.Node { return &cursorACPAgentNode{} }

func (n *cursorACPAgentNode) Init(_ types.Config, configuration types.Configuration) error {
	return initCursorACPAgentConfig(configuration, &n.cfg)
}

func (n *cursorACPAgentNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	runCursorACPAgent(ctx, msg, &n.cfg, 0, n.Type())
}

func (n *cursorACPAgentNode) Destroy() { n.cfg = cursorACPAgentConfig{} }

func init() {
	rulego.Registry.Register(&cursorACPAgentNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&cursorACPAgentNode{}).Type())
}
