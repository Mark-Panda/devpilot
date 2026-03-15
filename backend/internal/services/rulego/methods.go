package rulego

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

type CreateRuleGoRuleInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	Definition  string `json:"definition"`
	EditorJSON  string `json:"editor_json"`
}

type UpdateRuleGoRuleInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	Definition  string `json:"definition"`
	EditorJSON  string `json:"editor_json"`
}

func (s *Service) ListRuleGoRules() ([]models.RuleGoRule, error) {
	return s.store.List(context.Background())
}

func (s *Service) CreateRuleGoRule(input CreateRuleGoRuleInput) (models.RuleGoRule, error) {
	rule := models.RuleGoRule{
		Name:        strings.TrimSpace(input.Name),
		Description: strings.TrimSpace(input.Description),
		Enabled:     input.Enabled,
		Definition:  strings.TrimSpace(input.Definition),
		EditorJSON:  strings.TrimSpace(input.EditorJSON),
	}
	if err := validateRule(rule); err != nil {
		return models.RuleGoRule{}, err
	}

	result, err := s.store.Create(context.Background(), rule)
	if err != nil {
		return models.RuleGoRule{}, err
	}
	return result, nil
}

func (s *Service) UpdateRuleGoRule(id string, input UpdateRuleGoRuleInput) (models.RuleGoRule, error) {
	existing, err := s.store.GetByID(context.Background(), id)
	if err != nil {
		return models.RuleGoRule{}, err
	}

	rule := models.RuleGoRule{
		ID:          id,
		Name:        strings.TrimSpace(input.Name),
		Description: strings.TrimSpace(input.Description),
		Enabled:     input.Enabled,
		Definition:  strings.TrimSpace(input.Definition),
		EditorJSON:  strings.TrimSpace(input.EditorJSON),
		CreatedAt:   existing.CreatedAt,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if err := validateRule(rule); err != nil {
		return models.RuleGoRule{}, err
	}

	return s.store.Update(context.Background(), id, rule)
}

func (s *Service) DeleteRuleGoRule(id string) error {
	return s.store.Delete(context.Background(), id)
}

func validateRule(rule models.RuleGoRule) error {
	if rule.Name == "" {
		return errors.New("name is required")
	}
	if rule.Definition == "" {
		return errors.New("definition is required")
	}
	return nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, sqlite.ErrNotFound)
}
