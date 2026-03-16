package rulego

import (
	"log"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
)

// StartTriggerNode 开始节点触发器：作为规则链入口，收到消息后原样透传到下游（Success）。
// 在 DSL 中将此节点作为第一个节点时，外部通过 engine.OnMsg 注入的消息会先进入本节点再继续链式执行。
type StartTriggerNode struct{}

func (n *StartTriggerNode) Type() string {
	return "startTrigger"
}

func (n *StartTriggerNode) New() types.Node {
	return &StartTriggerNode{}
}

func (n *StartTriggerNode) Init(ruleConfig types.Config, configuration types.Configuration) error {
	return nil
}

func (n *StartTriggerNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	ctx.TellSuccess(msg)
}

func (n *StartTriggerNode) Destroy() {}

func init() {
	rulego.Registry.Register(&StartTriggerNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&StartTriggerNode{}).Type())
}
