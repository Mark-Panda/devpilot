package models

// RuleGoRule API 与 ~/.devpilot/rulego/{id}.json 文件对应：持久化字段仅为 Definition；
// ID 与文件名一致；UpdatedAt 来自文件修改时间。
// EngineLoaded 非落盘字段，仅 List/Get/Create/Update 返回时由服务层根据运行池填充。
type RuleGoRule struct {
	ID           string `json:"id"`
	Definition   string `json:"definition"`
	UpdatedAt    string `json:"updated_at"`
	EngineLoaded bool   `json:"engine_loaded"` // 不用 omitempty，否则 false 无法传到前端
}
