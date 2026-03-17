package model_management

import (
	"context"

	"devpilot/backend/internal/store/models"
	"devpilot/backend/internal/store/pebble"
)

type Store struct {
	db *pebble.DB
}

func NewStore(db *pebble.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Create(ctx context.Context, input models.ModelConfig) (models.ModelConfig, error) {
	return pebble.CreateModelConfig(ctx, s.db, input)
}

func (s *Store) List(ctx context.Context) ([]models.ModelConfig, error) {
	return pebble.ListModelConfigs(ctx, s.db)
}

func (s *Store) Update(ctx context.Context, id string, input models.ModelConfig) (models.ModelConfig, error) {
	return pebble.UpdateModelConfig(ctx, s.db, id, input)
}

func (s *Store) Delete(ctx context.Context, id string) error {
	return pebble.DeleteModelConfig(ctx, s.db, id)
}

func (s *Store) GetByID(ctx context.Context, id string) (models.ModelConfig, error) {
	return pebble.GetModelConfigByID(ctx, s.db, id)
}
