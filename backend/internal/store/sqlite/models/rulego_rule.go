package models

type RuleGoRule struct {
	ID          string `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	Description string `db:"description" json:"description"`
	Enabled     bool   `db:"enabled" json:"enabled"`
	Definition  string `db:"definition" json:"definition"`
	EditorJSON  string `db:"editor_json" json:"editor_json"`
	CreatedAt   string `db:"created_at" json:"created_at"`
	UpdatedAt   string `db:"updated_at" json:"updated_at"`
}
