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
	rgPrefixEntity = "rg:e:"
	rgPrefixIndex  = "rg:i:"
)

func CreateRuleGoRule(ctx context.Context, db *DB, input models.RuleGoRule) (models.RuleGoRule, error) {
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)

	rule := models.RuleGoRule{
		ID:         id,
		Definition: input.Definition,
		UpdatedAt:  now,
	}

	if err := putRuleGoRule(db, rule); err != nil {
		return models.RuleGoRule{}, err
	}
	return rule, nil
}

func ListRuleGoRules(ctx context.Context, db *DB) ([]models.RuleGoRule, error) {
	ids, err := listIDsByIndexDesc(db, rgPrefixIndex)
	if err != nil {
		return nil, fmt.Errorf("list index: %w", err)
	}
	var result []models.RuleGoRule
	for _, id := range ids {
		v, err := getByID(db, rgPrefixEntity, id)
		if err != nil {
			if err == pebble.ErrNotFound {
				continue
			}
			return nil, err
		}
		var rule models.RuleGoRule
		if err := json.Unmarshal(v, &rule); err != nil {
			return nil, fmt.Errorf("decode %s: %w", id, err)
		}
		result = append(result, rule)
	}
	return result, nil
}

func UpdateRuleGoRule(ctx context.Context, db *DB, id string, patch models.RuleGoRule) (models.RuleGoRule, error) {
	existing, err := GetRuleGoRuleByID(ctx, db, id)
	if err != nil {
		return models.RuleGoRule{}, err
	}

	if err := db.Delete([]byte(rgIndexKey(existing.UpdatedAt, id)), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return models.RuleGoRule{}, fmt.Errorf("delete old index: %w", err)
	}

	existing.Definition = patch.Definition
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	if err := putRuleGoRule(db, existing); err != nil {
		return models.RuleGoRule{}, err
	}
	return existing, nil
}

func DeleteRuleGoRule(ctx context.Context, db *DB, id string) error {
	existing, err := GetRuleGoRuleByID(ctx, db, id)
	if err != nil {
		return err
	}
	if err := db.Delete([]byte(rgPrefixEntity+id), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return fmt.Errorf("delete entity: %w", err)
	}
	if err := db.Delete([]byte(rgIndexKey(existing.UpdatedAt, id)), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return fmt.Errorf("delete index: %w", err)
	}
	return nil
}

func GetRuleGoRuleByID(ctx context.Context, db *DB, id string) (models.RuleGoRule, error) {
	v, closer, err := db.Get([]byte(rgPrefixEntity + id))
	if err != nil {
		if err == pebble.ErrNotFound {
			return models.RuleGoRule{}, ErrNotFound
		}
		return models.RuleGoRule{}, fmt.Errorf("get: %w", err)
	}
	defer closer.Close()

	var rule models.RuleGoRule
	if err := json.Unmarshal(v, &rule); err != nil {
		return models.RuleGoRule{}, fmt.Errorf("decode: %w", err)
	}
	return rule, nil
}

func putRuleGoRule(db *DB, rule models.RuleGoRule) error {
	data, err := json.Marshal(rule)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	if err := db.Set([]byte(rgPrefixEntity+rule.ID), data, pebble.Sync); err != nil {
		return fmt.Errorf("set entity: %w", err)
	}
	if err := db.Set([]byte(rgIndexKey(rule.UpdatedAt, rule.ID)), []byte{}, pebble.Sync); err != nil {
		return fmt.Errorf("set index: %w", err)
	}
	return nil
}

func rgIndexKey(updatedAt, id string) string {
	return rgPrefixIndex + updatedAt + ":" + id
}
