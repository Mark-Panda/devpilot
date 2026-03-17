package model_management

import (
	"context"
	"errors"
	"strings"
	"time"

	"devpilot/backend/internal/store/models"
	"devpilot/backend/internal/store/pebble"
)

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

type CreateModelConfigInput struct {
	BaseURL         string   `json:"base_url"`
	APIKey          string   `json:"api_key"`
	SiteDescription string   `json:"site_description"`
	Models          []string `json:"models"`
}

type UpdateModelConfigInput struct {
	BaseURL         string   `json:"base_url"`
	APIKey          string   `json:"api_key"`
	SiteDescription string   `json:"site_description"`
	Models          []string `json:"models"`
}

func (s *Service) ListModelConfigs() ([]models.ModelConfig, error) {
	return s.store.List(context.Background())
}

func (s *Service) CreateModelConfig(input CreateModelConfigInput) (models.ModelConfig, error) {
	modelsTrimmed := make([]string, 0, len(input.Models))
	for _, m := range input.Models {
		if s := strings.TrimSpace(m); s != "" {
			modelsTrimmed = append(modelsTrimmed, s)
		}
	}
	config := models.ModelConfig{
		BaseURL:         strings.TrimSpace(input.BaseURL),
		APIKey:          strings.TrimSpace(input.APIKey),
		SiteDescription: strings.TrimSpace(input.SiteDescription),
		Models:          modelsTrimmed,
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

	modelsTrimmed := make([]string, 0, len(input.Models))
	for _, m := range input.Models {
		if s := strings.TrimSpace(m); s != "" {
			modelsTrimmed = append(modelsTrimmed, s)
		}
	}
	config := models.ModelConfig{
		ID:              id,
		BaseURL:         strings.TrimSpace(input.BaseURL),
		APIKey:          strings.TrimSpace(input.APIKey),
		SiteDescription: strings.TrimSpace(input.SiteDescription),
		Models:          modelsTrimmed,
		CreatedAt:       existing.CreatedAt,
		UpdatedAt:       time.Now().UTC().Format(time.RFC3339),
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
	if config.APIKey == "" {
		return errors.New("api_key is required")
	}
	if config.SiteDescription == "" {
		return errors.New("site_description is required")
	}
	if len(config.Models) == 0 {
		return errors.New("at least one model is required")
	}
	return nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, pebble.ErrNotFound)
}
