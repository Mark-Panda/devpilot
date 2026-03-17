package rulego

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

func (s *Store) Create(ctx context.Context, input models.RuleGoRule) (models.RuleGoRule, error) {
	return pebble.CreateRuleGoRule(ctx, s.db, input)
}

func (s *Store) List(ctx context.Context) ([]models.RuleGoRule, error) {
	return pebble.ListRuleGoRules(ctx, s.db)
}

func (s *Store) Update(ctx context.Context, id string, input models.RuleGoRule) (models.RuleGoRule, error) {
	return pebble.UpdateRuleGoRule(ctx, s.db, id, input)
}

func (s *Store) Delete(ctx context.Context, id string) error {
	return pebble.DeleteRuleGoRule(ctx, s.db, id)
}

func (s *Store) GetByID(ctx context.Context, id string) (models.RuleGoRule, error) {
	return pebble.GetRuleGoRuleByID(ctx, s.db, id)
}
