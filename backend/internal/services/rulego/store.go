package rulego

import (
	"context"

	"devpilot/backend/internal/store/models"
	"devpilot/backend/internal/store/rulegofile"
)

// RuleStore 规则链持久化抽象（当前实现为 ~/.devpilot/rulego/*.json，文件内仅为 DSL JSON）。
type RuleStore interface {
	Create(ctx context.Context, input models.RuleGoRule) (models.RuleGoRule, error)
	List(ctx context.Context) ([]models.RuleGoRule, error)
	Update(ctx context.Context, id string, input models.RuleGoRule) (models.RuleGoRule, error)
	Delete(ctx context.Context, id string) error
	GetByID(ctx context.Context, id string) (models.RuleGoRule, error)
}

// NewFileRuleStore 在 dir 下以每条规则一个 json 文件的方式存储（通常为 rulegofile.DefaultDir()）。
func NewFileRuleStore(dir string) (RuleStore, error) {
	return rulegofile.New(dir)
}
