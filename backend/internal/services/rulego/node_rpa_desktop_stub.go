//go:build !darwin

package rulego

import (
	"fmt"
	"log"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
)

func init() {
	for _, typ := range []string{
		"x/rpaScreenCapture",
		"x/rpaMacWindow",
		"x/rpaDesktopClick",
	} {
		n := &rpaDesktopStubNode{typ: typ}
		if err := rulego.Registry.Register(n); err != nil {
			log.Printf("[rulego] RPA 桌面占位节点注册失败 type=%s: %v", typ, err)
		} else {
			log.Printf("[rulego] 自定义节点已注册: type=%s (非 macOS 占位)", typ)
		}
	}
}

type rpaDesktopStubNode struct {
	typ string
}

func (n *rpaDesktopStubNode) Type() string { return n.typ }

func (n *rpaDesktopStubNode) New() types.Node { return &rpaDesktopStubNode{typ: n.typ} }

func (n *rpaDesktopStubNode) Init(types.Config, types.Configuration) error { return nil }

func (n *rpaDesktopStubNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	ctx.TellFailure(msg, fmt.Errorf("%s: 仅 macOS 可用；Web 自动化请使用 x/rpaBrowser* 节点", n.typ))
}

func (n *rpaDesktopStubNode) Destroy() {}
