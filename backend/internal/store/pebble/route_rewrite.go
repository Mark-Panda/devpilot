package pebble

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/cockroachdb/pebble"
	"github.com/google/uuid"

	"devpilot/backend/internal/store/models"
)

const (
	rrPrefixEntity = "rr:e:"
	rrPrefixIndex  = "rr:i:"
)

func CreateRouteRewriteRule(ctx context.Context, db *DB, input models.RouteRewriteRule) (models.RouteRewriteRule, error) {
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)

	rule := models.RouteRewriteRule{
		ID:           id,
		Route:        input.Route,
		Method:       input.Method,
		SourceDomain: input.SourceDomain,
		TargetDomain: input.TargetDomain,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := putRouteRewriteRule(db, rule); err != nil {
		return models.RouteRewriteRule{}, err
	}
	return rule, nil
}

func ListRouteRewriteRules(ctx context.Context, db *DB) ([]models.RouteRewriteRule, error) {
	ids, err := listIDsByIndexDesc(db, rrPrefixIndex)
	if err != nil {
		return nil, fmt.Errorf("list index: %w", err)
	}
	var result []models.RouteRewriteRule
	for _, id := range ids {
		v, err := getByID(db, rrPrefixEntity, id)
		if err != nil {
			if err == pebble.ErrNotFound {
				continue
			}
			return nil, err
		}
		var rule models.RouteRewriteRule
		if err := json.Unmarshal(v, &rule); err != nil {
			return nil, fmt.Errorf("decode %s: %w", id, err)
		}
		result = append(result, rule)
	}
	return result, nil
}

func UpdateRouteRewriteRule(ctx context.Context, db *DB, id string, patch models.RouteRewriteRule) (models.RouteRewriteRule, error) {
	existing, err := GetRouteRewriteRuleByID(ctx, db, id)
	if err != nil {
		return models.RouteRewriteRule{}, err
	}

	// 删除旧索引
	if err := db.Delete([]byte(rrIndexKey(existing.UpdatedAt, id)), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return models.RouteRewriteRule{}, fmt.Errorf("delete old index: %w", err)
	}

	existing.Route = patch.Route
	existing.Method = patch.Method
	existing.SourceDomain = patch.SourceDomain
	existing.TargetDomain = patch.TargetDomain
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	patch.UpdatedAt = existing.UpdatedAt

	if err := putRouteRewriteRule(db, existing); err != nil {
		return models.RouteRewriteRule{}, err
	}
	return existing, nil
}

func DeleteRouteRewriteRule(ctx context.Context, db *DB, id string) error {
	existing, err := GetRouteRewriteRuleByID(ctx, db, id)
	if err != nil {
		return err
	}
	if err := db.Delete([]byte(rrPrefixEntity+id), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return fmt.Errorf("delete entity: %w", err)
	}
	if err := db.Delete([]byte(rrIndexKey(existing.UpdatedAt, id)), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return fmt.Errorf("delete index: %w", err)
	}
	return nil
}

func GetRouteRewriteRuleByID(ctx context.Context, db *DB, id string) (models.RouteRewriteRule, error) {
	v, closer, err := db.Get([]byte(rrPrefixEntity + id))
	if err != nil {
		if err == pebble.ErrNotFound {
			return models.RouteRewriteRule{}, ErrNotFound
		}
		return models.RouteRewriteRule{}, fmt.Errorf("get: %w", err)
	}
	defer closer.Close()

	var rule models.RouteRewriteRule
	if err := json.Unmarshal(v, &rule); err != nil {
		return models.RouteRewriteRule{}, fmt.Errorf("decode: %w", err)
	}
	return rule, nil
}

func putRouteRewriteRule(db *DB, rule models.RouteRewriteRule) error {
	data, err := json.Marshal(rule)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	if err := db.Set([]byte(rrPrefixEntity+rule.ID), data, pebble.Sync); err != nil {
		return fmt.Errorf("set entity: %w", err)
	}
	if err := db.Set([]byte(rrIndexKey(rule.UpdatedAt, rule.ID)), []byte{}, pebble.Sync); err != nil {
		return fmt.Errorf("set index: %w", err)
	}
	return nil
}

func rrIndexKey(updatedAt, id string) string {
	return rrPrefixIndex + updatedAt + ":" + id
}
