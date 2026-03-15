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

func Migrate(db *sql.DB) error {
	_, err := db.Exec(createRouteRewriteTable)
	return err
}
