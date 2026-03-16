package rulego

import (
	"context"
	"database/sql"
	"encoding/json"

	"devpilot/backend/internal/store/sqlite"
	"devpilot/backend/internal/store/sqlite/models"
)

// ExecutionLogStore 执行日志存储，供 LogAspect 与 Service 使用
type ExecutionLogStore struct {
	db *sql.DB
}

func NewExecutionLogStore(db *sql.DB) *ExecutionLogStore {
	return &ExecutionLogStore{db: db}
}

func (s *ExecutionLogStore) CreateExecutionLog(ctx context.Context, input models.RuleGoExecutionLog) (models.RuleGoExecutionLog, error) {
	return sqlite.CreateRuleGoExecutionLog(ctx, s.db, input)
}

func (s *ExecutionLogStore) UpdateExecutionLog(ctx context.Context, id string, outputData, outputMetadata, errorMessage, finishedAt string, success bool) error {
	return sqlite.UpdateRuleGoExecutionLog(ctx, s.db, id, outputData, outputMetadata, errorMessage, finishedAt, success)
}

func (s *ExecutionLogStore) GetMaxOrderIndex(ctx context.Context, executionID string) (int, error) {
	return sqlite.MaxOrderIndexForExecution(ctx, s.db, executionID)
}

func (s *ExecutionLogStore) InsertNodeLog(ctx context.Context, input models.RuleGoExecutionNodeLog) (models.RuleGoExecutionNodeLog, error) {
	return sqlite.InsertRuleGoExecutionNodeLog(ctx, s.db, input)
}

func (s *ExecutionLogStore) UpdateNodeLogByExecutionAndNode(ctx context.Context, executionID, nodeID, outputData, outputMetadata, errorMessage, finishedAt string) error {
	return sqlite.UpdateRuleGoExecutionNodeLogByExecutionAndNode(ctx, s.db, executionID, nodeID, outputData, outputMetadata, errorMessage, finishedAt)
}

func (s *ExecutionLogStore) ListExecutionLogs(ctx context.Context, limit, offset int) ([]models.RuleGoExecutionLog, error) {
	return sqlite.ListRuleGoExecutionLogs(ctx, s.db, limit, offset)
}

func (s *ExecutionLogStore) CountExecutionLogs(ctx context.Context) (int, error) {
	return sqlite.CountRuleGoExecutionLogs(ctx, s.db)
}

func (s *ExecutionLogStore) GetExecutionLogByID(ctx context.Context, id string) (models.RuleGoExecutionLog, error) {
	return sqlite.GetRuleGoExecutionLogByID(ctx, s.db, id)
}

func (s *ExecutionLogStore) GetNodeLogsByExecutionID(ctx context.Context, executionID string) ([]models.RuleGoExecutionNodeLog, error) {
	return sqlite.GetRuleGoExecutionNodeLogsByExecutionID(ctx, s.db, executionID)
}

func (s *ExecutionLogStore) DeleteExecutionLog(ctx context.Context, id string) error {
	return sqlite.DeleteRuleGoExecutionLog(ctx, s.db, id)
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
