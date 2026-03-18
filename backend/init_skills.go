package backend

import (
	"io/fs"
	"log"

	"devpilot/backend/internal/llm"
)

// EnsureSkillsFromInitFS 在启动时调用：将嵌入的 initSkills 同步到 ~/.devpilot/skills/（含 skill-creator 等）。
// embedRoot 为嵌入根路径，如 "initSkills"；空则用默认值。
func EnsureSkillsFromInitFS(initSkillsFS fs.FS, embedRoot string) {
	if err := llm.EnsureInitSkillsFromFS(initSkillsFS, embedRoot); err != nil {
		log.Printf("[backend] 初始化 initSkills 失败: %v", err)
	}
}
