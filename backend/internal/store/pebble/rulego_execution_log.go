package pebble

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/cockroachdb/pebble"
	"github.com/google/uuid"

	"devpilot/backend/internal/store/models"
)

const (
	elPrefixEntity = "el:e:"
	elPrefixIndex  = "el:i:"
	enPrefix       = "en:e:"
)

func CreateRuleGoExecutionLog(ctx context.Context, db *DB, input models.RuleGoExecutionLog) (models.RuleGoExecutionLog, error) {
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)
	if input.StartedAt == "" {
		input.StartedAt = now
	}
	input.ID = id
	input.StartedAt = now

	if err := putExecutionLog(db, input); err != nil {
		return models.RuleGoExecutionLog{}, err
	}
	return input, nil
}

func UpdateRuleGoExecutionLog(ctx context.Context, db *DB, id string, outputData, outputMetadata, errorMessage, finishedAt string, success bool) error {
	log, err := GetRuleGoExecutionLogByID(ctx, db, id)
	if err != nil {
		return err
	}
	log.OutputData = outputData
	log.OutputMetadata = outputMetadata
	log.ErrorMessage = errorMessage
	log.FinishedAt = finishedAt
	log.Success = success
	return putExecutionLog(db, log)
}

func ListRuleGoExecutionLogs(ctx context.Context, db *DB, limit, offset int) ([]models.RuleGoExecutionLog, error) {
	ids, err := listIDsByIndexDesc(db, elPrefixIndex)
	if err != nil {
		return nil, fmt.Errorf("list index: %w", err)
	}
	// offset/limit
	if offset > len(ids) {
		return nil, nil
	}
	ids = ids[offset:]
	if limit > 0 && len(ids) > limit {
		ids = ids[:limit]
	}
	var result []models.RuleGoExecutionLog
	for _, id := range ids {
		v, err := getByID(db, elPrefixEntity, id)
		if err != nil {
			if err == pebble.ErrNotFound {
				continue
			}
			return nil, err
		}
		var log models.RuleGoExecutionLog
		if err := json.Unmarshal(v, &log); err != nil {
			return nil, fmt.Errorf("decode %s: %w", id, err)
		}
		result = append(result, log)
	}
	return result, nil
}

func CountRuleGoExecutionLogs(ctx context.Context, db *DB) (int, error) {
	ids, err := listIDsByIndexDesc(db, elPrefixIndex)
	return len(ids), err
}

func GetRuleGoExecutionLogByID(ctx context.Context, db *DB, id string) (models.RuleGoExecutionLog, error) {
	v, closer, err := db.Get([]byte(elPrefixEntity + id))
	if err != nil {
		if err == pebble.ErrNotFound {
			return models.RuleGoExecutionLog{}, ErrNotFound
		}
		return models.RuleGoExecutionLog{}, fmt.Errorf("get: %w", err)
	}
	defer closer.Close()

	var log models.RuleGoExecutionLog
	if err := json.Unmarshal(v, &log); err != nil {
		return models.RuleGoExecutionLog{}, fmt.Errorf("decode: %w", err)
	}
	return log, nil
}

func DeleteRuleGoExecutionLog(ctx context.Context, db *DB, id string) error {
	// 先删该执行下的所有节点日志
	prefix := enPrefix + id + ":"
	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: []byte(prefix),
		UpperBound: prefixEnd(prefix),
	})
	if err != nil {
		return fmt.Errorf("iter node logs: %w", err)
	}
	defer iter.Close()

	for iter.First(); iter.Valid(); iter.Next() {
		if err := db.Delete(iter.Key(), pebble.Sync); err != nil && err != pebble.ErrNotFound {
			return err
		}
	}
	if err := iter.Error(); err != nil {
		return err
	}

	// 再删执行记录与索引
	log, err := GetRuleGoExecutionLogByID(ctx, db, id)
	if err != nil {
		return err
	}
	if err := db.Delete([]byte(elPrefixEntity+id), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return err
	}
	if err := db.Delete([]byte(elIndexKey(log.StartedAt, id)), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return err
	}
	return nil
}

func putExecutionLog(db *DB, log models.RuleGoExecutionLog) error {
	data, err := json.Marshal(log)
	if err != nil {
		return err
	}
	if err := db.Set([]byte(elPrefixEntity+log.ID), data, pebble.Sync); err != nil {
		return err
	}
	if err := db.Set([]byte(elIndexKey(log.StartedAt, log.ID)), []byte{}, pebble.Sync); err != nil {
		return err
	}
	return nil
}

func elIndexKey(startedAt, id string) string {
	return elPrefixIndex + startedAt + ":" + id
}

// 节点日志 key: en:e:{executionID}:{order_index_10d}:{id}
func enKey(executionID string, orderIndex int, id string) string {
	return enPrefix + executionID + ":" + fmt.Sprintf("%010d", orderIndex) + ":" + id
}

func InsertRuleGoExecutionNodeLog(ctx context.Context, db *DB, input models.RuleGoExecutionNodeLog) (models.RuleGoExecutionNodeLog, error) {
	input.ID = uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)
	if input.StartedAt == "" {
		input.StartedAt = now
	}

	maxOrder, err := MaxOrderIndexForExecution(ctx, db, input.ExecutionID)
	if err != nil {
		return models.RuleGoExecutionNodeLog{}, err
	}
	input.OrderIndex = maxOrder + 1

	key := enKey(input.ExecutionID, input.OrderIndex, input.ID)
	data, err := json.Marshal(input)
	if err != nil {
		return models.RuleGoExecutionNodeLog{}, err
	}
	if err := db.Set([]byte(key), data, pebble.Sync); err != nil {
		return models.RuleGoExecutionNodeLog{}, err
	}
	return input, nil
}

// findLatestUnfinishedNodeLog 查找指定执行中、该 nodeId 下尚未标记结束（FinishedAt 为空）的最新一条节点日志。
func findLatestUnfinishedNodeLog(db *DB, executionID, nodeID string) (key []byte, node models.RuleGoExecutionNodeLog, ok bool, iterErr error) {
	prefix := enPrefix + executionID + ":"
	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: []byte(prefix),
		UpperBound: prefixEnd(prefix),
	})
	if err != nil {
		return nil, models.RuleGoExecutionNodeLog{}, false, err
	}
	defer iter.Close()

	for iter.First(); iter.Valid(); iter.Next() {
		v, err := iter.ValueAndErr()
		if err != nil {
			return nil, models.RuleGoExecutionNodeLog{}, false, err
		}
		var n models.RuleGoExecutionNodeLog
		if err := json.Unmarshal(v, &n); err != nil {
			continue
		}
		if n.NodeID != nodeID {
			continue
		}
		if strings.TrimSpace(n.FinishedAt) != "" {
			continue
		}
		if !ok || n.OrderIndex > node.OrderIndex {
			ok = true
			key = append([]byte(nil), iter.Key()...)
			node = n
		}
	}
	if err := iter.Error(); err != nil {
		return nil, models.RuleGoExecutionNodeLog{}, false, err
	}
	return key, node, ok, nil
}

func UpdateRuleGoExecutionNodeLogByExecutionAndNode(ctx context.Context, db *DB, executionID, nodeID, outputData, outputMetadata, errorMessage, finishedAt string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	if finishedAt == "" {
		finishedAt = now
	}

	key, node, found, err := findLatestUnfinishedNodeLog(db, executionID, nodeID)
	if err != nil {
		return err
	}
	if found {
		node.OutputData = outputData
		node.OutputMetadata = outputMetadata
		node.ErrorMessage = errorMessage
		node.FinishedAt = finishedAt
		data, err := json.Marshal(node)
		if err != nil {
			return err
		}
		return db.Set(key, data, pebble.Sync)
	}

	// 兼容旧数据：无「未完成」行时退回「出参仍为空」的第一条匹配
	prefix := enPrefix + executionID + ":"
	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: []byte(prefix),
		UpperBound: prefixEnd(prefix),
	})
	if err != nil {
		return err
	}
	defer iter.Close()

	for iter.First(); iter.Valid(); iter.Next() {
		v, err := iter.ValueAndErr()
		if err != nil {
			return err
		}
		var n models.RuleGoExecutionNodeLog
		if err := json.Unmarshal(v, &n); err != nil {
			continue
		}
		if n.NodeID != nodeID {
			continue
		}
		if n.OutputData != "" {
			continue
		}
		n.OutputData = outputData
		n.OutputMetadata = outputMetadata
		n.ErrorMessage = errorMessage
		n.FinishedAt = finishedAt
		data, err := json.Marshal(n)
		if err != nil {
			return err
		}
		return db.Set(iter.Key(), data, pebble.Sync)
	}
	return iter.Error()
}

// PatchRuleGoExecutionNodeLogProgress 更新进行中节点的出参预览（FinishedAt 保持为空），供前端轮询。
func PatchRuleGoExecutionNodeLogProgress(ctx context.Context, db *DB, executionID, nodeID, outputData, outputMetadata string) error {
	_ = ctx
	key, node, found, err := findLatestUnfinishedNodeLog(db, executionID, nodeID)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	node.OutputData = outputData
	node.OutputMetadata = outputMetadata
	data, err := json.Marshal(node)
	if err != nil {
		return err
	}
	return db.Set(key, data, pebble.Sync)
}

func GetRuleGoExecutionNodeLogsByExecutionID(ctx context.Context, db *DB, executionID string) ([]models.RuleGoExecutionNodeLog, error) {
	prefix := enPrefix + executionID + ":"
	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: []byte(prefix),
		UpperBound: prefixEnd(prefix),
	})
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var list []models.RuleGoExecutionNodeLog
	for iter.First(); iter.Valid(); iter.Next() {
		v, err := iter.ValueAndErr()
		if err != nil {
			return nil, err
		}
		var node models.RuleGoExecutionNodeLog
		if err := json.Unmarshal(v, &node); err != nil {
			return nil, err
		}
		list = append(list, node)
	}
	if err := iter.Error(); err != nil {
		return nil, err
	}
	// key 中 order_index 已保证顺序，无需再排序（按 key 遍历即按 order 升序）
	return list, nil
}

func MaxOrderIndexForExecution(ctx context.Context, db *DB, executionID string) (int, error) {
	prefix := enPrefix + executionID + ":"
	iter, err := db.NewIter(&pebble.IterOptions{
		LowerBound: []byte(prefix),
		UpperBound: prefixEnd(prefix),
	})
	if err != nil {
		return 0, err
	}
	defer iter.Close()

	max := -1
	for iter.First(); iter.Valid(); iter.Next() {
		key := string(iter.Key())
		// en:e:execID:0000000001:id
		parts := strings.Split(key, ":")
		if len(parts) < 4 {
			continue
		}
		orderStr := parts[3]
		order, err := strconv.Atoi(orderStr)
		if err != nil {
			continue
		}
		if order > max {
			max = order
		}
	}
	if max < 0 {
		return 0, iter.Error()
	}
	return max, iter.Error()
}
