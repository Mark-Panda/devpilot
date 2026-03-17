package route_rewrite

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

func (s *Store) Create(ctx context.Context, input models.RouteRewriteRule) (models.RouteRewriteRule, error) {
	return pebble.CreateRouteRewriteRule(ctx, s.db, input)
}

func (s *Store) List(ctx context.Context) ([]models.RouteRewriteRule, error) {
	return pebble.ListRouteRewriteRules(ctx, s.db)
}

func (s *Store) Update(ctx context.Context, id string, input models.RouteRewriteRule) (models.RouteRewriteRule, error) {
	return pebble.UpdateRouteRewriteRule(ctx, s.db, id, input)
}

func (s *Store) Delete(ctx context.Context, id string) error {
	return pebble.DeleteRouteRewriteRule(ctx, s.db, id)
}

func (s *Store) GetByID(ctx context.Context, id string) (models.RouteRewriteRule, error) {
	return pebble.GetRouteRewriteRuleByID(ctx, s.db, id)
}
