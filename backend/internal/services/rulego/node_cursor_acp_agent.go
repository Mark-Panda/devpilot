package rulego

import (
	"fmt"
	"log"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/utils/el"
)

// cursorACPAgentNode 在同一 ACP 会话内多轮 session/prompt，并对权限 / 规划 / elicitation / cursor/* 自动批复。
// useRegisteredAfterRoundHook 时由桌面弹窗续聊；弹窗内可「主动结束」(user_end) 或「完成标记结束」(end_marker)。
type cursorACPAgentNode struct {
	cfg           cursorACPAgentConfig
	promptTmpl    el.Template
	promptTmplSet bool
	workDirTmpl   el.Template
}

func (n *cursorACPAgentNode) Type() string { return "cursor/acp_agent" }

func (n *cursorACPAgentNode) New() types.Node { return &cursorACPAgentNode{} }

func (n *cursorACPAgentNode) Init(_ types.Config, configuration types.Configuration) error {
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
		return fmt.Errorf("cursor/acp_agent: workDir 模板: %w", err)
	}
	n.workDirTmpl = t
	return nil
}

func (n *cursorACPAgentNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	runCursorACPAgent(ctx, msg, &n.cfg, n.workDirTmpl, n.promptTmpl, n.promptTmplSet, 0, n.Type())
}

func (n *cursorACPAgentNode) Destroy() {
	n.cfg = cursorACPAgentConfig{}
	n.promptTmpl = nil
	n.promptTmplSet = false
	n.workDirTmpl = nil
}

func init() {
	rulego.Registry.Register(&cursorACPAgentNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&cursorACPAgentNode{}).Type())
}
