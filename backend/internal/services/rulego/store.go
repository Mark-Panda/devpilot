package rulego

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

func (s *Store) Create(ctx context.Context, input models.RuleGoRule) (models.RuleGoRule, error) {
	return sqlite.CreateRuleGoRule(ctx, s.db, input)
}

func (s *Store) List(ctx context.Context) ([]models.RuleGoRule, error) {
	return sqlite.ListRuleGoRules(ctx, s.db)
}

func (s *Store) Update(ctx context.Context, id string, input models.RuleGoRule) (models.RuleGoRule, error) {
	return sqlite.UpdateRuleGoRule(ctx, s.db, id, input)
}

func (s *Store) Delete(ctx context.Context, id string) error {
	return sqlite.DeleteRuleGoRule(ctx, s.db, id)
}

func (s *Store) GetByID(ctx context.Context, id string) (models.RuleGoRule, error) {
	return sqlite.GetRuleGoRuleByID(ctx, s.db, id)
}
