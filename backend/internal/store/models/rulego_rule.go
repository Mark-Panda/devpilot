package models

// RuleGoRule API 与 ~/.devpilot/rulego/{id}.json 文件对应：持久化字段仅为 Definition；
// ID 与文件名一致；UpdatedAt 来自文件修改时间。
type RuleGoRule struct {
	ID         string `json:"id"`
	Definition string `json:"definition"`
	UpdatedAt  string `json:"updated_at"`
}
