package sqlite

import (
	"database/sql"
	"strings"
)

const createRouteRewriteTable = `
CREATE TABLE IF NOT EXISTS route_rewrite_rules (
  id TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

const createModelConfigTable = `
CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

const createRuleGoRuleTable = `
CREATE TABLE IF NOT EXISTS rulego_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  definition TEXT NOT NULL,
  editor_json TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

func Migrate(db *sql.DB) error {
	if _, err := db.Exec(createRouteRewriteTable); err != nil {
		return err
	}
	if _, err := db.Exec(createModelConfigTable); err != nil {
		return err
	}
	if _, err := db.Exec(createRuleGoRuleTable); err != nil {
		return err
	}
	_, err := db.Exec(`ALTER TABLE rulego_rules ADD COLUMN editor_json TEXT NOT NULL DEFAULT ''`)
	if err != nil && !isDuplicateColumnError(err) {
		return err
	}
	return nil
}

func isDuplicateColumnError(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	return strings.Contains(message, "duplicate column name") ||
		strings.Contains(message, "duplicate column") ||
		strings.Contains(message, "already exists")
}
