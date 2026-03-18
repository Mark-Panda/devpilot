package llm

import (
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const initSkillsEmbedRoot = "initSkills"

// EnsureInitSkillsFromFS 从嵌入的 initSkills 目录同步所有技能到 ~/.devpilot/skills/。
// 仅当目标技能目录下尚不存在 SKILL.md 时才复制，避免覆盖用户已自定义内容。
// embedRoot 为嵌入根路径，如 "initSkills"；若为空则使用 initSkillsEmbedRoot。
func EnsureInitSkillsFromFS(embedFS fs.FS, embedRoot string) error {
	if embedFS == nil {
		return nil
	}
	if embedRoot == "" {
		embedRoot = initSkillsEmbedRoot
	}
	entries, err := fs.ReadDir(embedFS, embedRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		log.Printf("[llm] 读取嵌入 initSkills 失败 embedRoot=%s err=%v", embedRoot, err)
		return err
	}
	destBase := DefaultSkillDir()
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		skillDirName := e.Name()
		if strings.TrimSpace(skillDirName) == "" || strings.Contains(skillDirName, "..") {
			continue
		}
		// 仅当目标目录下没有 SKILL.md 时才复制，避免覆盖用户已自定义内容
		destDir := filepath.Join(destBase, skillDirName)
		destSkillPath := filepath.Join(destDir, skillFileName)
		if _, err := os.Stat(destSkillPath); err == nil {
			log.Printf("[llm] 初始化技能已存在，跳过 skill=%s path=%s", skillDirName, destSkillPath)
			continue
		}
		srcRoot := path.Join(embedRoot, skillDirName)
		if _, err := fs.Stat(embedFS, path.Join(srcRoot, skillFileName)); err != nil {
			// 该子目录下没有 SKILL.md，不视为技能目录
			continue
		}
		if err := copyFSDirToDisk(embedFS, srcRoot, destDir); err != nil {
			log.Printf("[llm] 复制初始化技能失败 skill=%s err=%v", skillDirName, err)
			continue
		}
		log.Printf("[llm] 已初始化技能 skill=%s -> %s", skillDirName, destDir)
	}
	return nil
}

// copyFSDirToDisk 将 embedFS 下 srcRoot 目录（含子目录）递归复制到 destDir。
func copyFSDirToDisk(embedFS fs.FS, srcRoot, destDir string) error {
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}
	prefix := srcRoot + "/"
	return fs.WalkDir(embedFS, srcRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		var rel string
		if p == srcRoot {
			rel = "."
		} else if strings.HasPrefix(p, prefix) {
			rel = p[len(prefix):]
		} else {
			rel = p
		}
		destPath := filepath.Join(destDir, rel)
		if d.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}
		data, err := fs.ReadFile(embedFS, p)
		if err != nil {
			return err
		}
		return os.WriteFile(destPath, data, 0644)
	})
}
