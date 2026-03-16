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

const createRuleGoExecutionLogTable = `
CREATE TABLE IF NOT EXISTS rulego_execution_logs (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL DEFAULT '',
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  input_data TEXT NOT NULL DEFAULT '',
  input_metadata TEXT NOT NULL DEFAULT '{}',
  output_data TEXT NOT NULL DEFAULT '',
  output_metadata TEXT NOT NULL DEFAULT '{}',
  success INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT ''
);
`

const createRuleGoExecutionNodeLogTable = `
CREATE TABLE IF NOT EXISTS rulego_execution_node_logs (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  node_id TEXT NOT NULL,
  node_name TEXT NOT NULL DEFAULT '',
  relation_type TEXT NOT NULL DEFAULT '',
  input_data TEXT NOT NULL DEFAULT '',
  input_metadata TEXT NOT NULL DEFAULT '{}',
  output_data TEXT NOT NULL DEFAULT '',
  output_metadata TEXT NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (execution_id) REFERENCES rulego_execution_logs(id)
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
	if _, err := db.Exec(createRuleGoExecutionLogTable); err != nil {
		return err
	}
	if _, err := db.Exec(createRuleGoExecutionNodeLogTable); err != nil {
		return err
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_rulego_exec_node_exec ON rulego_execution_node_logs(execution_id)`); err != nil {
		return err
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_rulego_exec_logs_started ON rulego_execution_logs(started_at DESC)`); err != nil {
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
