package model_management

import (
	"context"
	"database/sql"

	"devpilot/backend/internal/store/sqlite"
	"devpilot/backend/internal/store/sqlite/models"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Create(ctx context.Context, input models.ModelConfig) (models.ModelConfig, error) {
	return sqlite.CreateModelConfig(ctx, s.db, input)
}

func (s *Store) List(ctx context.Context) ([]models.ModelConfig, error) {
	return sqlite.ListModelConfigs(ctx, s.db)
}

func (s *Store) Update(ctx context.Context, id string, input models.ModelConfig) (models.ModelConfig, error) {
	return sqlite.UpdateModelConfig(ctx, s.db, id, input)
}

func (s *Store) Delete(ctx context.Context, id string) error {
	return sqlite.DeleteModelConfig(ctx, s.db, id)
}

func (s *Store) GetByID(ctx context.Context, id string) (models.ModelConfig, error) {
	return sqlite.GetModelConfigByID(ctx, s.db, id)
}
