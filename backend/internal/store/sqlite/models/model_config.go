package models

type ModelConfig struct {
	ID        string `db:"id" json:"id"`
	BaseURL   string `db:"base_url" json:"base_url"`
	Model     string `db:"model" json:"model"`
	APIKey    string `db:"api_key" json:"api_key"`
	CreatedAt string `db:"created_at" json:"created_at"`
	UpdatedAt string `db:"updated_at" json:"updated_at"`
}
