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

// 编译期检查：确保 LogAspect 实现 BeforeAspect、AfterAspect、CompletedAspect
var (
	_ types.BeforeAspect     = (*LogAspect)(nil)
	_ types.AfterAspect      = (*LogAspect)(nil)
	_ types.CompletedAspect  = (*LogAspect)(nil)
)

const executionIDKey = "_execution_id"

// chainExecIDCachePrefix 用 RuleMsg.Id 在 ChainCache 中关联「本次进入链的根消息」与执行日志 ID。
// 原因：根上下文 TellNext 首节点前会对消息 Copy()，Before 里写入的 _execution_id 只在子副本上，
// 根 ctx.GetOut() 仍是进入链时的原始消息，Completed 无法从 metadata 取到 execution_id。
const chainExecIDCachePrefix = "devpilot:exec:"

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
	// 定时 / HTTP 等 Endpoint 触发的链不会在消息里带 _execution_id（只有 ExecuteRule / 测试会注入），
	// 日志管理依赖父记录 + 节点步骤，因此在首次进入节点时补建一条执行记录并写回 metadata。
	if globalExecutionLogStore != nil && executionIDFromMsg(msg) == "" && chainId != "" {
		ruleName := ""
		if rc := ctx.RuleChain(); rc != nil {
			if chainCtx, ok := rc.(types.ChainCtx); ok {
				if def := chainCtx.Definition(); def != nil {
					ruleName = def.RuleChain.Name
				}
			}
		}
		inputMeta := "{}"
		if msg.Metadata != nil {
			inputMeta = MetadataToJSON(msg.Metadata.GetReadOnlyValues())
		}
		row, err := globalExecutionLogStore.CreateExecutionLog(context.Background(), models.RuleGoExecutionLog{
			RuleID:        chainId,
			RuleName:      ruleName,
			TriggerType:   "endpoint",
			InputData:     msg.GetData(),
			InputMetadata: inputMeta,
		})
		if err == nil && row.ID != "" {
			if msg.Metadata == nil {
				msg.Metadata = types.NewMetadata()
			}
			msg.Metadata.PutValue(executionIDKey, row.ID)
			if ctx.ChainCache() != nil && msg.GetId() != "" {
				_ = ctx.ChainCache().Set(chainExecIDCachePrefix+msg.GetId(), row.ID, "")
			}
		}
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

// Completed 全部分支结束后更新父执行记录（与 ExecuteRule 末尾的 UpdateExecutionLog 对齐）。
// 对已由 ExecuteRule 更新过的记录再次写入相同字段，结果仍一致。
//
// execution_id 解析顺序：参数 msg（手动执行一开始就带 id）→ GetOut()（部分场景）→ ChainCache（端点触发：
// 根消息与首节点副本 metadata 分离，见 chainExecIDCachePrefix 注释）。
func (a *LogAspect) Completed(ctx types.RuleContext, msg types.RuleMsg) types.RuleMsg {
	if globalExecutionLogStore == nil || ctx == nil {
		return msg
	}
	execID := executionIDFromMsg(msg)
	if execID == "" {
		execID = executionIDFromMsg(ctx.GetOut())
	}
	if execID == "" && msg.GetId() != "" && ctx.ChainCache() != nil {
		if v := ctx.ChainCache().Get(chainExecIDCachePrefix + msg.GetId()); v != nil {
			if s, ok := v.(string); ok {
				execID = s
			}
		}
	}
	if execID == "" {
		return msg
	}
	if msg.GetId() != "" && ctx.ChainCache() != nil {
		_ = ctx.ChainCache().Delete(chainExecIDCachePrefix + msg.GetId())
	}
	outMsg := ctx.GetOut()
	if outMsg.Metadata == nil || executionIDFromMsg(outMsg) == "" {
		if executionIDFromMsg(msg) != "" {
			outMsg = msg
		}
	}
	finishAt := time.Now().UTC().Format(time.RFC3339)
	outData := outMsg.GetData()
	outMeta := "{}"
	if outMsg.Metadata != nil {
		outMeta = MetadataToJSON(outMsg.Metadata.GetReadOnlyValues())
	}
	runErr := ctx.GetErr()
	success := runErr == nil
	errStr := ""
	if runErr != nil {
		errStr = runErr.Error()
	}
	_ = globalExecutionLogStore.UpdateExecutionLog(context.Background(), execID, outData, outMeta, errStr, finishAt, success)
	return msg
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
