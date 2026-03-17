package route_rewrite

import (
	"context"
	"errors"
	"fmt"
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

type CreateRouteRewriteInput struct {
	Route        string `json:"route"`
	Method       string `json:"method"`
	SourceDomain string `json:"source_domain"`
	TargetDomain string `json:"target_domain"`
}

type UpdateRouteRewriteInput struct {
	Route        string `json:"route"`
	Method       string `json:"method"`
	SourceDomain string `json:"source_domain"`
	TargetDomain string `json:"target_domain"`
}

func (s *Service) ListRouteRewriteRules() ([]models.RouteRewriteRule, error) {
	return s.store.List(context.Background())
}

func (s *Service) CreateRouteRewriteRule(input CreateRouteRewriteInput) (models.RouteRewriteRule, error) {
	base := models.RouteRewriteRule{
		Route:        strings.TrimSpace(input.Route),
		Method:       strings.ToUpper(strings.TrimSpace(input.Method)),
		SourceDomain: strings.TrimSpace(input.SourceDomain),
		TargetDomain: strings.TrimSpace(input.TargetDomain),
	}
	if err := validateRule(base); err != nil {
		return models.RouteRewriteRule{}, err
	}

	rule, err := s.store.Create(context.Background(), base)
	if err != nil {
		return models.RouteRewriteRule{}, err
	}
	return rule, nil
}

func (s *Service) UpdateRouteRewriteRule(id string, input UpdateRouteRewriteInput) (models.RouteRewriteRule, error) {
	existing, err := s.store.GetByID(context.Background(), id)
	if err != nil {
		return models.RouteRewriteRule{}, err
	}

	rule := models.RouteRewriteRule{
		ID:           id,
		Route:        strings.TrimSpace(input.Route),
		Method:       strings.ToUpper(strings.TrimSpace(input.Method)),
		SourceDomain: strings.TrimSpace(input.SourceDomain),
		TargetDomain: strings.TrimSpace(input.TargetDomain),
		CreatedAt:    existing.CreatedAt,
		UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	if err := validateRule(rule); err != nil {
		return models.RouteRewriteRule{}, err
	}

	return s.store.Update(context.Background(), id, rule)
}

func (s *Service) DeleteRouteRewriteRule(id string) error {
	return s.store.Delete(context.Background(), id)
}

func validateRule(rule models.RouteRewriteRule) error {
	if rule.Route == "" {
		return errors.New("route is required")
	}
	if rule.Method == "" {
		return errors.New("method is required")
	}
	if rule.SourceDomain == "" {
		return errors.New("source_domain is required")
	}
	if rule.TargetDomain == "" {
		return errors.New("target_domain is required")
	}

	switch rule.Method {
	case "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD":
		return nil
	default:
		return fmt.Errorf("invalid method: %s", rule.Method)
	}
}

func IsNotFound(err error) bool {
	return errors.Is(err, pebble.ErrNotFound)
}
