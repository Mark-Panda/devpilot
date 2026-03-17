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
	mcPrefixEntity = "mc:e:"
	mcPrefixIndex  = "mc:i:"
)

func CreateModelConfig(ctx context.Context, db *DB, input models.ModelConfig) (models.ModelConfig, error) {
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)

	config := models.ModelConfig{
		ID:        id,
		BaseURL:   input.BaseURL,
		Model:     input.Model,
		APIKey:    input.APIKey,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := putModelConfig(db, config); err != nil {
		return models.ModelConfig{}, err
	}
	return config, nil
}

func ListModelConfigs(ctx context.Context, db *DB) ([]models.ModelConfig, error) {
	ids, err := listIDsByIndexDesc(db, mcPrefixIndex)
	if err != nil {
		return nil, fmt.Errorf("list index: %w", err)
	}
	var result []models.ModelConfig
	for _, id := range ids {
		v, err := getByID(db, mcPrefixEntity, id)
		if err != nil {
			if err == pebble.ErrNotFound {
				continue
			}
			return nil, err
		}
		var config models.ModelConfig
		if err := json.Unmarshal(v, &config); err != nil {
			return nil, fmt.Errorf("decode %s: %w", id, err)
		}
		result = append(result, config)
	}
	return result, nil
}

func UpdateModelConfig(ctx context.Context, db *DB, id string, patch models.ModelConfig) (models.ModelConfig, error) {
	existing, err := GetModelConfigByID(ctx, db, id)
	if err != nil {
		return models.ModelConfig{}, err
	}

	if err := db.Delete([]byte(mcIndexKey(existing.UpdatedAt, id)), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return models.ModelConfig{}, fmt.Errorf("delete old index: %w", err)
	}

	existing.BaseURL = patch.BaseURL
	existing.Model = patch.Model
	existing.APIKey = patch.APIKey
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	if err := putModelConfig(db, existing); err != nil {
		return models.ModelConfig{}, err
	}
	return existing, nil
}

func DeleteModelConfig(ctx context.Context, db *DB, id string) error {
	existing, err := GetModelConfigByID(ctx, db, id)
	if err != nil {
		return err
	}
	if err := db.Delete([]byte(mcPrefixEntity+id), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return fmt.Errorf("delete entity: %w", err)
	}
	if err := db.Delete([]byte(mcIndexKey(existing.UpdatedAt, id)), pebble.Sync); err != nil && err != pebble.ErrNotFound {
		return fmt.Errorf("delete index: %w", err)
	}
	return nil
}

func GetModelConfigByID(ctx context.Context, db *DB, id string) (models.ModelConfig, error) {
	v, closer, err := db.Get([]byte(mcPrefixEntity + id))
	if err != nil {
		if err == pebble.ErrNotFound {
			return models.ModelConfig{}, ErrNotFound
		}
		return models.ModelConfig{}, fmt.Errorf("get: %w", err)
	}
	defer closer.Close()

	var config models.ModelConfig
	if err := json.Unmarshal(v, &config); err != nil {
		return models.ModelConfig{}, fmt.Errorf("decode: %w", err)
	}
	return config, nil
}

func putModelConfig(db *DB, config models.ModelConfig) error {
	data, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	if err := db.Set([]byte(mcPrefixEntity+config.ID), data, pebble.Sync); err != nil {
		return fmt.Errorf("set entity: %w", err)
	}
	if err := db.Set([]byte(mcIndexKey(config.UpdatedAt, config.ID)), []byte{}, pebble.Sync); err != nil {
		return fmt.Errorf("set index: %w", err)
	}
	return nil
}

func mcIndexKey(updatedAt, id string) string {
	return mcPrefixIndex + updatedAt + ":" + id
}
