package rulegofile

import (
	"time"

	"devpilot/backend/internal/store/models"
)

// SetRuleUpdatedAt 将文件 mtime 写入模型的 UpdatedAt（RFC3339）。
func SetRuleUpdatedAt(rule *models.RuleGoRule, modTime time.Time) {
	if rule == nil {
		return
	}
	rule.UpdatedAt = modTime.UTC().Format(time.RFC3339)
}
