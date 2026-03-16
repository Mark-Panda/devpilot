package models

// RuleGoExecutionLog 规则链单次执行记录
type RuleGoExecutionLog struct {
	ID             string `db:"id" json:"id"`
	RuleID         string `db:"rule_id" json:"rule_id"`
	RuleName       string `db:"rule_name" json:"rule_name"`
	TriggerType    string `db:"trigger_type" json:"trigger_type"` // manual / api / test
	InputData      string `db:"input_data" json:"input_data"`
	InputMetadata  string `db:"input_metadata" json:"input_metadata"`   // JSON
	OutputData     string `db:"output_data" json:"output_data"`
	OutputMetadata string `db:"output_metadata" json:"output_metadata"` // JSON
	Success        bool   `db:"success" json:"success"`
	ErrorMessage   string `db:"error_message" json:"error_message"`
	StartedAt      string `db:"started_at" json:"started_at"`
	FinishedAt     string `db:"finished_at" json:"finished_at"`
}

// RuleGoExecutionNodeLog 单次执行中单个节点的入参/出参记录
type RuleGoExecutionNodeLog struct {
	ID             string `db:"id" json:"id"`
	ExecutionID    string `db:"execution_id" json:"execution_id"`
	OrderIndex     int    `db:"order_index" json:"order_index"`
	NodeID         string `db:"node_id" json:"node_id"`
	NodeName       string `db:"node_name" json:"node_name"`
	RelationType   string `db:"relation_type" json:"relation_type"`
	InputData      string `db:"input_data" json:"input_data"`
	InputMetadata  string `db:"input_metadata" json:"input_metadata"`
	OutputData     string `db:"output_data" json:"output_data"`
	OutputMetadata string `db:"output_metadata" json:"output_metadata"`
	ErrorMessage   string `db:"error_message" json:"error_message"`
	StartedAt      string `db:"started_at" json:"started_at"`
	FinishedAt     string `db:"finished_at" json:"finished_at"`
}
