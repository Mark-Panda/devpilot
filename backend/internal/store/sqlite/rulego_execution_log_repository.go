package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"devpilot/backend/internal/store/sqlite/models"
)

const executionLogColumns = "id, rule_id, rule_name, trigger_type, input_data, input_metadata, output_data, output_metadata, success, error_message, started_at, finished_at"
const executionNodeLogColumns = "id, execution_id, order_index, node_id, node_name, relation_type, input_data, input_metadata, output_data, output_metadata, error_message, started_at, finished_at"

func CreateRuleGoExecutionLog(ctx context.Context, db *sql.DB, input models.RuleGoExecutionLog) (models.RuleGoExecutionLog, error) {
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)
	if input.StartedAt == "" {
		input.StartedAt = now
	}
	input.ID = id
	input.StartedAt = now

	q := `INSERT INTO rulego_execution_logs (id, rule_id, rule_name, trigger_type, input_data, input_metadata, output_data, output_metadata, success, error_message, started_at, finished_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := db.ExecContext(ctx, q,
		input.ID, input.RuleID, input.RuleName, input.TriggerType,
		input.InputData, input.InputMetadata, input.OutputData, input.OutputMetadata,
		boolToInt(input.Success), input.ErrorMessage, input.StartedAt, input.FinishedAt)
	if err != nil {
		return models.RuleGoExecutionLog{}, fmt.Errorf("insert rulego_execution_logs: %w", err)
	}
	return input, nil
}

func UpdateRuleGoExecutionLog(ctx context.Context, db *sql.DB, id string, outputData, outputMetadata, errorMessage, finishedAt string, success bool) error {
	_, err := db.ExecContext(ctx, `UPDATE rulego_execution_logs SET output_data=?, output_metadata=?, success=?, error_message=?, finished_at=? WHERE id=?`,
		outputData, outputMetadata, boolToInt(success), errorMessage, finishedAt, id)
	if err != nil {
		return fmt.Errorf("update rulego_execution_logs: %w", err)
	}
	return nil
}

func ListRuleGoExecutionLogs(ctx context.Context, db *sql.DB, limit, offset int) ([]models.RuleGoExecutionLog, error) {
	q := fmt.Sprintf("SELECT %s FROM rulego_execution_logs ORDER BY started_at DESC LIMIT ? OFFSET ?", executionLogColumns)
	rows, err := db.QueryContext(ctx, q, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list rulego_execution_logs: %w", err)
	}
	defer rows.Close()

	var list []models.RuleGoExecutionLog
	for rows.Next() {
		var r models.RuleGoExecutionLog
		var success int
		if err := rows.Scan(&r.ID, &r.RuleID, &r.RuleName, &r.TriggerType, &r.InputData, &r.InputMetadata, &r.OutputData, &r.OutputMetadata, &success, &r.ErrorMessage, &r.StartedAt, &r.FinishedAt); err != nil {
			return nil, fmt.Errorf("scan rulego_execution_logs: %w", err)
		}
		r.Success = success != 0
		list = append(list, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows rulego_execution_logs: %w", err)
	}
	return list, nil
}

func CountRuleGoExecutionLogs(ctx context.Context, db *sql.DB) (int, error) {
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM rulego_execution_logs`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count rulego_execution_logs: %w", err)
	}
	return n, nil
}

func GetRuleGoExecutionLogByID(ctx context.Context, db *sql.DB, id string) (models.RuleGoExecutionLog, error) {
	q := fmt.Sprintf("SELECT %s FROM rulego_execution_logs WHERE id = ?", executionLogColumns)
	row := db.QueryRowContext(ctx, q, id)
	var r models.RuleGoExecutionLog
	var success int
	if err := row.Scan(&r.ID, &r.RuleID, &r.RuleName, &r.TriggerType, &r.InputData, &r.InputMetadata, &r.OutputData, &r.OutputMetadata, &success, &r.ErrorMessage, &r.StartedAt, &r.FinishedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.RuleGoExecutionLog{}, ErrNotFound
		}
		return models.RuleGoExecutionLog{}, fmt.Errorf("scan rulego_execution_logs: %w", err)
	}
	r.Success = success != 0
	return r, nil
}

// DeleteRuleGoExecutionLog 删除一条执行记录及其所有节点日志（先删子表再删主表）
func DeleteRuleGoExecutionLog(ctx context.Context, db *sql.DB, id string) error {
	if _, err := db.ExecContext(ctx, `DELETE FROM rulego_execution_node_logs WHERE execution_id = ?`, id); err != nil {
		return fmt.Errorf("delete rulego_execution_node_logs: %w", err)
	}
	res, err := db.ExecContext(ctx, `DELETE FROM rulego_execution_logs WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete rulego_execution_logs: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func InsertRuleGoExecutionNodeLog(ctx context.Context, db *sql.DB, input models.RuleGoExecutionNodeLog) (models.RuleGoExecutionNodeLog, error) {
	input.ID = uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)
	if input.StartedAt == "" {
		input.StartedAt = now
	}

	q := `INSERT INTO rulego_execution_node_logs (id, execution_id, order_index, node_id, node_name, relation_type, input_data, input_metadata, output_data, output_metadata, error_message, started_at, finished_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := db.ExecContext(ctx, q,
		input.ID, input.ExecutionID, input.OrderIndex, input.NodeID, input.NodeName, input.RelationType,
		input.InputData, input.InputMetadata, input.OutputData, input.OutputMetadata, input.ErrorMessage, input.StartedAt, input.FinishedAt)
	if err != nil {
		return models.RuleGoExecutionNodeLog{}, fmt.Errorf("insert rulego_execution_node_logs: %w", err)
	}
	return input, nil
}

// UpdateRuleGoExecutionNodeLogByExecutionAndNode 更新该执行下该节点最近一条未完成的节点日志（Before 插入的那条）
func UpdateRuleGoExecutionNodeLogByExecutionAndNode(ctx context.Context, db *sql.DB, executionID, nodeID, outputData, outputMetadata, errorMessage, finishedAt string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	if finishedAt == "" {
		finishedAt = now
	}
	res, err := db.QueryContext(ctx, `SELECT id FROM rulego_execution_node_logs WHERE execution_id=? AND node_id=? AND (output_data='' OR output_data IS NULL) ORDER BY order_index DESC LIMIT 1`,
		executionID, nodeID)
	if err != nil {
		return fmt.Errorf("find rulego_execution_node_logs: %w", err)
	}
	defer res.Close()
	if !res.Next() {
		return nil
	}
	var rowID string
	if err := res.Scan(&rowID); err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `UPDATE rulego_execution_node_logs SET output_data=?, output_metadata=?, error_message=?, finished_at=? WHERE id=?`,
		outputData, outputMetadata, errorMessage, finishedAt, rowID)
	if err != nil {
		return fmt.Errorf("update rulego_execution_node_logs by id: %w", err)
	}
	return nil
}

func GetRuleGoExecutionNodeLogsByExecutionID(ctx context.Context, db *sql.DB, executionID string) ([]models.RuleGoExecutionNodeLog, error) {
	q := fmt.Sprintf("SELECT %s FROM rulego_execution_node_logs WHERE execution_id = ? ORDER BY order_index ASC", executionNodeLogColumns)
	rows, err := db.QueryContext(ctx, q, executionID)
	if err != nil {
		return nil, fmt.Errorf("list rulego_execution_node_logs: %w", err)
	}
	defer rows.Close()

	var list []models.RuleGoExecutionNodeLog
	for rows.Next() {
		var r models.RuleGoExecutionNodeLog
		if err := rows.Scan(&r.ID, &r.ExecutionID, &r.OrderIndex, &r.NodeID, &r.NodeName, &r.RelationType, &r.InputData, &r.InputMetadata, &r.OutputData, &r.OutputMetadata, &r.ErrorMessage, &r.StartedAt, &r.FinishedAt); err != nil {
			return nil, fmt.Errorf("scan rulego_execution_node_logs: %w", err)
		}
		list = append(list, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows rulego_execution_node_logs: %w", err)
	}
	return list, nil
}

// MaxOrderIndexForExecution 返回某次执行当前最大 order_index，用于插入新节点步时 +1
func MaxOrderIndexForExecution(ctx context.Context, db *sql.DB, executionID string) (int, error) {
	var max sql.NullInt64
	if err := db.QueryRowContext(ctx, `SELECT MAX(order_index) FROM rulego_execution_node_logs WHERE execution_id = ?`, executionID).Scan(&max); err != nil {
		return 0, err
	}
	if max.Valid {
		return int(max.Int64), nil
	}
	return 0, nil
}
