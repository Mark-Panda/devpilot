package rulego

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/rulego/rulego/api/types"

	"devpilot/backend/internal/store/models"
)

// 编译期检查：确保 LogAspect 实现 BeforeAspect、AfterAspect
var (
	_ types.BeforeAspect = (*LogAspect)(nil)
	_ types.AfterAspect  = (*LogAspect)(nil)
)

const executionIDKey = "_execution_id"

// LogAspect 规则链节点执行日志切面：在节点 OnMsg 前后打日志，并可选写入数据库。
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

func executionIDFromMsg(msg types.RuleMsg) string {
	if msg.Metadata == nil {
		return ""
	}
	vals := msg.Metadata.GetReadOnlyValues()
	if vals == nil {
		return ""
	}
	return vals[executionIDKey]
}

// nodeNameFromCtx 从当前节点 DSL 配置中解析 name 字段（规则链中配置的节点名称）
func nodeNameFromCtx(ctx types.RuleContext) string {
	if ctx.Self() == nil {
		return ""
	}
	dsl := ctx.Self().DSL()
	if len(dsl) == 0 {
		return ""
	}
	var node struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(dsl, &node); err != nil {
		return ""
	}
	return strings.TrimSpace(node.Name)
}

// Before 节点 OnMsg 执行前：打日志，若有 execution_id 则写入 DB 节点入参。
func (a *LogAspect) Before(ctx types.RuleContext, msg types.RuleMsg, relationType string) types.RuleMsg {
	chainId := ""
	if ctx.RuleChain() != nil {
		chainId = ctx.RuleChain().GetNodeId().Id
	}
	nodeId := ""
	nodeName := nodeNameFromCtx(ctx)
	if ctx.Self() != nil {
		nodeId = ctx.Self().GetNodeId().Id
	}
	dataPreview := truncate(msg.GetData(), 200)
	log.Printf("[rulego] chain=%s node=%s relation=%s msgType=%s data=%s",
		chainId, nodeId, relationType, msg.Type, dataPreview)

	if globalExecutionLogStore != nil {
		execID := executionIDFromMsg(msg)
		if execID != "" {
			orderIndex, _ := globalExecutionLogStore.GetMaxOrderIndex(context.Background(), execID)
			inputMeta := "{}"
			if msg.Metadata != nil {
				inputMeta = MetadataToJSON(msg.Metadata.GetReadOnlyValues())
			}
			_, _ = globalExecutionLogStore.InsertNodeLog(context.Background(), models.RuleGoExecutionNodeLog{
				ExecutionID:   execID,
				OrderIndex:   orderIndex + 1,
				NodeID:       nodeId,
				NodeName:     nodeName,
				RelationType: relationType,
				InputData:    msg.GetData(),
				InputMetadata: inputMeta,
				StartedAt:   time.Now().UTC().Format(time.RFC3339),
			})
		}
	}
	return msg
}

// After 节点 OnMsg 执行后：打日志，若有 execution_id 则更新 DB 中该节点出参。
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

	if globalExecutionLogStore != nil {
		execID := executionIDFromMsg(msg)
		if execID != "" {
			outputMeta := "{}"
			if msg.Metadata != nil {
				outputMeta = MetadataToJSON(msg.Metadata.GetReadOnlyValues())
			}
			errMsg := ""
			if err != nil {
				errMsg = err.Error()
			}
			_ = globalExecutionLogStore.UpdateNodeLogByExecutionAndNode(context.Background(), execID, nodeId, msg.GetData(), outputMeta, errMsg, time.Now().UTC().Format(time.RFC3339))
		}
	}
	return msg
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
