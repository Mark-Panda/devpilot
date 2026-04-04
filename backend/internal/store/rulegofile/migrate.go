package rulegofile

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"devpilot/backend/internal/store/pebble"
)

// MigrateFromPebbleIfNeeded 将仍在 Pebble 中的规则链写入 ~/.devpilot/rulego/{id}.json（仅 DSL 正文），并删除 Pebble 中对应记录。
// 幂等：已存在同名 json 时跳过写入但仍删除 Pebble，避免双份数据源。
func MigrateFromPebbleIfNeeded(ctx context.Context, db *pebble.DB, dir string) (int, error) {
	if db == nil {
		return 0, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return 0, err
	}
	rules, err := pebble.ListRuleGoRules(ctx, db)
	if err != nil {
		return 0, err
	}
	written := 0
	for _, r := range rules {
		id := strings.TrimSpace(r.ID)
		if id == "" {
			continue
		}
		path := filepath.Join(dir, id+".json")
		def := strings.TrimSpace(r.Definition)
		if def == "" {
			continue
		}
		if _, err := os.Stat(path); os.IsNotExist(err) {
			def = AlignDefinitionRuleChainID(def, id)
			if err := os.WriteFile(path, []byte(def), 0o644); err != nil {
				return written, err
			}
			written++
		}
		if err := pebble.DeleteRuleGoRule(ctx, db, id); err != nil {
			return written, err
		}
	}
	return written, nil
}
