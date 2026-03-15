package sqlite

import "database/sql"

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

func Migrate(db *sql.DB) error {
	if _, err := db.Exec(createRouteRewriteTable); err != nil {
		return err
	}
	_, err := db.Exec(createModelConfigTable)
	return err
}
