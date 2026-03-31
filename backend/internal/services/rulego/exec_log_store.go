package rulego

import (
	"context"
	"encoding/json"

	"devpilot/backend/internal/store/models"
	"devpilot/backend/internal/store/pebble"
)

// ExecutionLogStore 执行日志存储，供 LogAspect 与 Service 使用
type ExecutionLogStore struct {
	db *pebble.DB
}

func NewExecutionLogStore(db *pebble.DB) *ExecutionLogStore {
	return &ExecutionLogStore{db: db}
}

func (s *ExecutionLogStore) CreateExecutionLog(ctx context.Context, input models.RuleGoExecutionLog) (models.RuleGoExecutionLog, error) {
	return pebble.CreateRuleGoExecutionLog(ctx, s.db, input)
}

func (s *ExecutionLogStore) UpdateExecutionLog(ctx context.Context, id string, outputData, outputMetadata, errorMessage, finishedAt string, success bool) error {
	return pebble.UpdateRuleGoExecutionLog(ctx, s.db, id, outputData, outputMetadata, errorMessage, finishedAt, success)
}

func (s *ExecutionLogStore) GetMaxOrderIndex(ctx context.Context, executionID string) (int, error) {
	return pebble.MaxOrderIndexForExecution(ctx, s.db, executionID)
}

func (s *ExecutionLogStore) InsertNodeLog(ctx context.Context, input models.RuleGoExecutionNodeLog) (models.RuleGoExecutionNodeLog, error) {
	return pebble.InsertRuleGoExecutionNodeLog(ctx, s.db, input)
}

func (s *ExecutionLogStore) UpdateNodeLogByExecutionAndNode(ctx context.Context, executionID, nodeID, outputData, outputMetadata, errorMessage, finishedAt string) error {
	return pebble.UpdateRuleGoExecutionNodeLogByExecutionAndNode(ctx, s.db, executionID, nodeID, outputData, outputMetadata, errorMessage, finishedAt)
}

// PatchNodeLogProgress 写入进行中节点的出参预览（不写入 finished_at），供 Cursor ACP 等长任务轮询展示。
func (s *ExecutionLogStore) PatchNodeLogProgress(ctx context.Context, executionID, nodeID, outputData, outputMetadata string) error {
	return pebble.PatchRuleGoExecutionNodeLogProgress(ctx, s.db, executionID, nodeID, outputData, outputMetadata)
}

func (s *ExecutionLogStore) ListExecutionLogs(ctx context.Context, limit, offset int) ([]models.RuleGoExecutionLog, error) {
	return pebble.ListRuleGoExecutionLogs(ctx, s.db, limit, offset)
}

func (s *ExecutionLogStore) CountExecutionLogs(ctx context.Context) (int, error) {
	return pebble.CountRuleGoExecutionLogs(ctx, s.db)
}

func (s *ExecutionLogStore) GetExecutionLogByID(ctx context.Context, id string) (models.RuleGoExecutionLog, error) {
	return pebble.GetRuleGoExecutionLogByID(ctx, s.db, id)
}

func (s *ExecutionLogStore) GetNodeLogsByExecutionID(ctx context.Context, executionID string) ([]models.RuleGoExecutionNodeLog, error) {
	return pebble.GetRuleGoExecutionNodeLogsByExecutionID(ctx, s.db, executionID)
}

func (s *ExecutionLogStore) DeleteExecutionLog(ctx context.Context, id string) error {
	return pebble.DeleteRuleGoExecutionLog(ctx, s.db, id)
}

// MetadataToJSON 将 map[string]string 序列化为 JSON 字符串，供存储
func MetadataToJSON(m map[string]string) string {
	if m == nil {
		return "{}"
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// 包级全局执行日志存储，供 LogAspect 使用（切面由 rulego 引擎创建，无法注入依赖）
var globalExecutionLogStore *ExecutionLogStore

// SetGlobalExecutionLogStore 在 Service 初始化时设置，便于 LogAspect 写入 DB
func SetGlobalExecutionLogStore(s *ExecutionLogStore) {
	globalExecutionLogStore = s
}
