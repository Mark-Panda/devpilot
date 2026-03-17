package models

import "encoding/json"

type ModelConfig struct {
	ID              string   `db:"id" json:"id"`
	BaseURL         string   `db:"base_url" json:"base_url"`
	APIKey          string   `db:"api_key" json:"api_key"`
	SiteDescription string   `db:"site_description" json:"site_description"`
	Models          []string `db:"models" json:"models"`
	CreatedAt       string   `db:"created_at" json:"created_at"`
	UpdatedAt       string   `db:"updated_at" json:"updated_at"`
}

// UnmarshalJSON 兼容旧数据：若存在 model 且 models 为空，则设为 [model]。
func (c *ModelConfig) UnmarshalJSON(data []byte) error {
	type raw ModelConfig
	var r struct {
		raw
		Model string `json:"model"`
	}
	if err := json.Unmarshal(data, &r); err != nil {
		return err
	}
	*c = ModelConfig(r.raw)
	if len(c.Models) == 0 && r.Model != "" {
		c.Models = []string{r.Model}
	}
	return nil
}
