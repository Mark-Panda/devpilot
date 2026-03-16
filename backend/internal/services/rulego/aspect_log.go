package rulego

import (
	"log"
	"strings"

	"github.com/rulego/rulego/api/types"
)

// 编译期检查：确保 LogAspect 实现 BeforeAspect、AfterAspect
var (
	_ types.BeforeAspect = (*LogAspect)(nil)
	_ types.AfterAspect  = (*LogAspect)(nil)
)

// LogAspect 规则链节点执行日志切面：在节点 OnMsg 前后打日志，便于排查与审计。
// 参考：https://rulego.cc/pages/aop-overview/
type LogAspect struct{}

// Order 值越小越优先执行，与框架内置 Debug 等切面错开即可。
func (a *LogAspect) Order() int {
	return 800
}

// New 为每个规则引擎实例创建独立切面实例，保证状态隔离。
func (a *LogAspect) New() types.Aspect {
	return &LogAspect{}
}

// PointCut 对所有节点生效；若只需对部分节点打日志，可在此根据 ctx.Self() 等条件过滤。
func (a *LogAspect) PointCut(ctx types.RuleContext, msg types.RuleMsg, relationType string) bool {
	return true
}

// Before 节点 OnMsg 执行前：记录链 ID、节点 ID、消息类型、关系类型、消息体摘要。
func (a *LogAspect) Before(ctx types.RuleContext, msg types.RuleMsg, relationType string) types.RuleMsg {
	chainId := ""
	if ctx.RuleChain() != nil {
		chainId = ctx.RuleChain().GetNodeId().Id
	}
	nodeId := ""
	if ctx.Self() != nil {
		nodeId = ctx.Self().GetNodeId().Id
	}
	dataPreview := truncate(msg.GetData(), 200)
	log.Printf("[rulego] chain=%s node=%s relation=%s msgType=%s data=%s",
		chainId, nodeId, relationType, msg.Type, dataPreview)
	return msg
}

// After 节点 OnMsg 执行后：记录链 ID、节点 ID、是否有错误、关系类型。
func (a *LogAspect) After(ctx types.RuleContext, msg types.RuleMsg, err error, relationType string) types.RuleMsg {
	chainId := ""
	if ctx.RuleChain() != nil {
		chainId = ctx.RuleChain().GetNodeId().Id
	}
	nodeId := ""
	if ctx.Self() != nil {
		nodeId = ctx.Self().GetNodeId().Id
	}
	errStr := "nil"
	if err != nil {
		errStr = err.Error()
	}
	log.Printf("[rulego] chain=%s node=%s relation=%s done err=%s",
		chainId, nodeId, relationType, errStr)
	return msg
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
