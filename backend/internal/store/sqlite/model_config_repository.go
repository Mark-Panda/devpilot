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

const modelConfigColumns = "id, base_url, model, api_key, created_at, updated_at"

func CreateModelConfig(ctx context.Context, db *sql.DB, input models.ModelConfig) (models.ModelConfig, error) {
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

	query := `INSERT INTO model_configs (id, base_url, model, api_key, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?)`

	_, err := db.ExecContext(ctx, query, config.ID, config.BaseURL, config.Model, config.APIKey, config.CreatedAt, config.UpdatedAt)
	if err != nil {
		return models.ModelConfig{}, fmt.Errorf("insert model_configs: %w", err)
	}

	return config, nil
}

func ListModelConfigs(ctx context.Context, db *sql.DB) ([]models.ModelConfig, error) {
	query := fmt.Sprintf("SELECT %s FROM model_configs ORDER BY updated_at DESC", modelConfigColumns)
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list model_configs: %w", err)
	}
	defer rows.Close()

	var result []models.ModelConfig
	for rows.Next() {
		var config models.ModelConfig
		if err := rows.Scan(&config.ID, &config.BaseURL, &config.Model, &config.APIKey, &config.CreatedAt, &config.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan model_configs: %w", err)
		}
		result = append(result, config)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows model_configs: %w", err)
	}

	return result, nil
}

func UpdateModelConfig(ctx context.Context, db *sql.DB, id string, patch models.ModelConfig) (models.ModelConfig, error) {
	query := `UPDATE model_configs
SET base_url = ?, model = ?, api_key = ?, updated_at = ?
WHERE id = ?`

	res, err := db.ExecContext(ctx, query, patch.BaseURL, patch.Model, patch.APIKey, patch.UpdatedAt, id)
	if err != nil {
		return models.ModelConfig{}, fmt.Errorf("update model_configs: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return models.ModelConfig{}, fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return models.ModelConfig{}, ErrNotFound
	}

	return GetModelConfigByID(ctx, db, id)
}

func DeleteModelConfig(ctx context.Context, db *sql.DB, id string) error {
	res, err := db.ExecContext(ctx, `DELETE FROM model_configs WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete model_configs: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func GetModelConfigByID(ctx context.Context, db *sql.DB, id string) (models.ModelConfig, error) {
	query := fmt.Sprintf("SELECT %s FROM model_configs WHERE id = ?", modelConfigColumns)
	row := db.QueryRowContext(ctx, query, id)

	var config models.ModelConfig
	if err := row.Scan(&config.ID, &config.BaseURL, &config.Model, &config.APIKey, &config.CreatedAt, &config.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.ModelConfig{}, ErrNotFound
		}
		return models.ModelConfig{}, fmt.Errorf("scan model_configs: %w", err)
	}
	return config, nil
}
