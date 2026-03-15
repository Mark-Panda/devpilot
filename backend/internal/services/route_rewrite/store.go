package route_rewrite

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

func (s *Store) Create(ctx context.Context, input models.RouteRewriteRule) (models.RouteRewriteRule, error) {
	return sqlite.CreateRouteRewriteRule(ctx, s.db, input)
}

func (s *Store) List(ctx context.Context) ([]models.RouteRewriteRule, error) {
	return sqlite.ListRouteRewriteRules(ctx, s.db)
}

func (s *Store) Update(ctx context.Context, id string, input models.RouteRewriteRule) (models.RouteRewriteRule, error) {
	return sqlite.UpdateRouteRewriteRule(ctx, s.db, id, input)
}

func (s *Store) Delete(ctx context.Context, id string) error {
	return sqlite.DeleteRouteRewriteRule(ctx, s.db, id)
}

func (s *Store) GetByID(ctx context.Context, id string) (models.RouteRewriteRule, error) {
	return sqlite.GetRouteRewriteRuleByID(ctx, s.db, id)
}
