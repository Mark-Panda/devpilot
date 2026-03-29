package models

type RuleGoRule struct {
	ID                            string `db:"id" json:"id"`
	Name                          string `db:"name" json:"name"`
	Description                   string `db:"description" json:"description"`
	Definition                    string `db:"definition" json:"definition"`
	EditorJSON                    string `db:"editor_json" json:"editor_json"`
	RequestMetadataParamsJSON     string `db:"request_metadata_params_json" json:"request_metadata_params_json"`           // 规则链请求元数据参数表 JSON 数组
	RequestMessageBodyParamsJSON  string `db:"request_message_body_params_json" json:"request_message_body_params_json"`   // 规则链请求消息体参数表 JSON 数组
	ResponseMessageBodyParamsJSON string `db:"response_message_body_params_json" json:"response_message_body_params_json"` // 规则链响应消息体（输出 data）参数表 JSON 数组
	SkillDirName                  string `db:"skill_dir_name" json:"skill_dir_name"`                                       // 关联技能目录名，位于 ~/.devpilot/skills/{SkillDirName}
	CreatedAt                     string `db:"created_at" json:"created_at"`
	UpdatedAt                     string `db:"updated_at" json:"updated_at"`
}
