package workspace

import "encoding/json"

// WorkspaceSchemaVersion 是 Workspace JSON 的 schema 版本号。
// 该值会在序列化时写入 schema_version 字段，用于后续兼容升级。
const WorkspaceSchemaVersion = 1

// Workspace 表示一个“工作空间”，其下包含多个 Project。
//
// 时间字段使用 RFC3339 字符串以与现有 store/models 的风格保持一致。
type Workspace struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	RootPath      string    `json:"root_path"`
	Projects      []Project `json:"projects"`
	CreatedAt     string    `json:"created_at"`
	UpdatedAt     string    `json:"updated_at"`
	SchemaVersion int       `json:"schema_version"`
}

// MarshalJSON 确保 schema_version 在未显式设置时也会被序列化为默认版本。
func (w Workspace) MarshalJSON() ([]byte, error) {
	type alias Workspace
	if w.SchemaVersion == 0 {
		w.SchemaVersion = WorkspaceSchemaVersion
	}
	return json.Marshal(alias(w))
}

// Project 表示工作空间下的一个项目。
type Project struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	AbsPath string `json:"abs_path"`
	Slug    string `json:"slug"`
	Enabled bool   `json:"enabled"`
}

// ValidationReport 表示对某个 Workspace 的健康检查结果。
// 该结构用于前端展示与执行前阻断（不做自动降级）。
type ValidationReport struct {
	WorkspaceID string          `json:"workspace_id"`
	RootPath    string          `json:"root_path"`
	OK          bool            `json:"ok"`
	Errors      []string        `json:"errors"`
	Projects    []ProjectStatus `json:"projects"`
}

type ProjectStatus struct {
	ProjectID    string `json:"project_id"`
	Name         string `json:"name"`
	AbsPath      string `json:"abs_path"`
	Slug         string `json:"slug"`
	SymlinkPath  string `json:"symlink_path"`
	ResolvedPath string `json:"resolved_path"`
	OK           bool   `json:"ok"`
	Error        string `json:"error"`
}
