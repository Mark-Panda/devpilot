package cursoracp

// DialogTask 标识当前 ACP 会话所属的规则链执行，用于桌面弹窗区分并发任务。
type DialogTask struct {
	RuleID      string `json:"rule_id"`
	RuleName    string `json:"rule_name"`
	ExecutionID string `json:"execution_id"`
}
