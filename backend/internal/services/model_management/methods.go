package model_management

import (
	"context"
	"errors"
	"strings"
	"time"

	"devpilot/backend/internal/store/sqlite"
	"devpilot/backend/internal/store/sqlite/models"
)

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

type CreateModelConfigInput struct {
	BaseURL string `json:"base_url"`
	Model   string `json:"model"`
	APIKey  string `json:"api_key"`
}

type UpdateModelConfigInput struct {
	BaseURL string `json:"base_url"`
	Model   string `json:"model"`
	APIKey  string `json:"api_key"`
}

func (s *Service) ListModelConfigs() ([]models.ModelConfig, error) {
	return s.store.List(context.Background())
}

func (s *Service) CreateModelConfig(input CreateModelConfigInput) (models.ModelConfig, error) {
	config := models.ModelConfig{
		BaseURL: strings.TrimSpace(input.BaseURL),
		Model:   strings.TrimSpace(input.Model),
		APIKey:  strings.TrimSpace(input.APIKey),
	}
	if err := validateConfig(config); err != nil {
		return models.ModelConfig{}, err
	}

	result, err := s.store.Create(context.Background(), config)
	if err != nil {
		return models.ModelConfig{}, err
	}
	return result, nil
}

func (s *Service) UpdateModelConfig(id string, input UpdateModelConfigInput) (models.ModelConfig, error) {
	existing, err := s.store.GetByID(context.Background(), id)
	if err != nil {
		return models.ModelConfig{}, err
	}

	config := models.ModelConfig{
		ID:        id,
		BaseURL:   strings.TrimSpace(input.BaseURL),
		Model:     strings.TrimSpace(input.Model),
		APIKey:    strings.TrimSpace(input.APIKey),
		CreatedAt: existing.CreatedAt,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := validateConfig(config); err != nil {
		return models.ModelConfig{}, err
	}

	return s.store.Update(context.Background(), id, config)
}

func (s *Service) DeleteModelConfig(id string) error {
	return s.store.Delete(context.Background(), id)
}

func validateConfig(config models.ModelConfig) error {
	if config.BaseURL == "" {
		return errors.New("base_url is required")
	}
	if config.Model == "" {
		return errors.New("model is required")
	}
	if config.APIKey == "" {
		return errors.New("api_key is required")
	}
	return nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, sqlite.ErrNotFound)
}
