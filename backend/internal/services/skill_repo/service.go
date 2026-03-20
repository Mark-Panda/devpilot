package skill_repo

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"errors"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"devpilot/backend/internal/llm"
)

// builtinInitSkillDirNames 为 initSkills 下内置技能目录名，与 initSkills/ 子目录一一对应，不可在技能仓库中删除。
var builtinInitSkillDirNames = []string{"skill-creator"}

// ruleChainSkillPrefix 规则链生成技能的目录名前缀（rule-{id}），此类技能不可在技能仓库中删除。
const ruleChainSkillPrefix = "rule-"

func isBuiltinOrRuleSkill(dirName string) bool {
	if strings.HasPrefix(dirName, ruleChainSkillPrefix) {
		return true
	}
	for _, b := range builtinInitSkillDirNames {
		if dirName == b {
			return true
		}
	}
	return false
}

// Service 提供技能仓库能力：列举 ~/.devpilot/skills/ 下技能包、解压上传的 zip。
type Service struct {
	skillDir     string
	initSkillsFS fs.FS // 非 nil 时，列举前会先同步 initSkills，用于恢复用户手动删除的内置技能
}

// NewService 使用默认技能目录 ~/.devpilot/skills/ 创建服务。initSkillsFS 可为 nil；非 nil 时每次列举前会尝试同步 initSkills。
func NewService(initSkillsFS fs.FS) *Service {
	return &Service{skillDir: llm.DefaultSkillDir(), initSkillsFS: initSkillsFS}
}

// SkillPackageItem 表示技能仓库中的一项技能包（一个子目录下的 SKILL.md）。
type SkillPackageItem struct {
	DirName     string `json:"dir_name"`     // 子目录名
	Name        string `json:"name"`         // SKILL.md frontmatter name
	Description string `json:"description"` // SKILL.md frontmatter description
	Deletable   bool   `json:"deletable"`   // 是否允许在技能仓库中删除（内置 initSkills 与 rule-* 不可删除）
}

// SkillPackageDetail 表示单个技能包目录的详情（路径 + 文件列表）。
type SkillPackageDetail struct {
	DirPath string   `json:"dir_path"` // 绝对路径
	Files   []string `json:"files"`    // 相对路径列表，如 ["SKILL.md", "sub/file.txt"]
}

// ListSkillPackages 列举 skillDir 下所有包含 SKILL.md 的子目录，返回名称与描述。
// 若 initSkillsFS 非 nil，会先执行 initSkills 同步，从而在用户手动删除内置技能后能检测并恢复。
func (s *Service) ListSkillPackages() ([]SkillPackageItem, error) {
	if s.initSkillsFS != nil {
		_ = llm.EnsureInitSkillsFromFS(s.initSkillsFS, "initSkills")
	}
	dir := s.skillDir
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []SkillPackageItem
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		subDir := filepath.Join(dir, e.Name())
		skill, err := llm.LoadSkillFromDir(subDir)
		if err != nil {
			log.Printf("[skill_repo] 跳过技能目录 %q: %v", e.Name(), err)
			continue
		}
		if skill == nil {
			continue
		}
		dirName := e.Name()
		out = append(out, SkillPackageItem{
			DirName:     dirName,
			Name:        skill.Name,
			Description: skill.Description,
			Deletable:   !isBuiltinOrRuleSkill(dirName),
		})
	}
	return out, nil
}

// GetSkillPackageDetail 返回指定技能包子目录的绝对路径及其中所有文件的相对路径列表。
func (s *Service) GetSkillPackageDetail(dirName string) (*SkillPackageDetail, error) {
	dirName = strings.TrimSpace(filepath.Clean(dirName))
	if dirName == "" || dirName == "." || strings.Contains(dirName, "..") {
		return nil, errors.New("invalid dir name")
	}
	absDir := filepath.Join(s.skillDir, dirName)
	info, err := os.Stat(absDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errors.New("skill package not found")
		}
		return nil, err
	}
	if !info.IsDir() {
		return nil, errors.New("not a directory")
	}
	var files []string
	err = filepath.Walk(absDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(absDir, path)
		if rel == "." {
			return nil
		}
		if info.IsDir() {
			files = append(files, rel+string(filepath.Separator))
		} else {
			files = append(files, rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &SkillPackageDetail{DirPath: absDir, Files: files}, nil
}

// GetSkillPackageFileContent 返回技能包内指定文件的文本内容。仅支持 UTF-8 文本文件，二进制文件返回错误。
func (s *Service) GetSkillPackageFileContent(dirName, relativePath string) (string, error) {
	dirName = strings.TrimSpace(filepath.Clean(dirName))
	if dirName == "" || dirName == "." || strings.Contains(dirName, "..") {
		return "", errors.New("invalid dir name")
	}
	relativePath = filepath.Clean(relativePath)
	if relativePath == "" || relativePath == "." || strings.HasPrefix(relativePath, "..") || filepath.IsAbs(relativePath) {
		return "", errors.New("invalid file path")
	}
	absDir := filepath.Join(s.skillDir, dirName)
	absPath := filepath.Join(absDir, relativePath)
	// 确保解析后仍在 absDir 下
	absPath, err := filepath.Abs(absPath)
	if err != nil {
		return "", err
	}
	absDir, _ = filepath.Abs(absDir)
	if absPath != absDir && !strings.HasPrefix(absPath, absDir+string(filepath.Separator)) {
		return "", errors.New("file path escapes package directory")
	}
	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", errors.New("file not found")
		}
		return "", err
	}
	if info.IsDir() {
		return "", errors.New("cannot read directory as file")
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}
	if !utf8.Valid(data) {
		return "", errors.New("非文本文件，无法预览")
	}
	return string(data), nil
}

// ExtractSkillZip 将 zipPath 指向的 zip 解压到技能目录下。
// zip 内应包含至少一个目录且含 SKILL.md，或根目录下直接含 SKILL.md；解压后保证技能目录下出现对应子目录。
func (s *Service) ExtractSkillZip(zipPath string) error {
	zipPath = strings.TrimSpace(zipPath)
	if zipPath == "" {
		return errors.New("zip path is required")
	}
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	destDir := s.skillDir
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	// 解压所有文件到 destDir，保留 zip 内相对路径（若 zip 根为单目录则自然得到 skills/<name>/...）
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		name := filepath.Clean(f.Name)
		if name == "." || strings.HasPrefix(name, "..") || filepath.IsAbs(name) {
			continue
		}
		dst := filepath.Join(destDir, name)
		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		w, err := os.Create(dst)
		if err != nil {
			_ = rc.Close()
			return err
		}
		_, err = io.Copy(w, rc)
		_ = rc.Close()
		_ = w.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

// ExtractSkillZipFromData 将 base64 编码的 zip 数据解压到技能目录下（用于拖放上传等无法传路径的场景）。
func (s *Service) ExtractSkillZipFromData(dataBase64 string) error {
	dataBase64 = strings.TrimSpace(dataBase64)
	if dataBase64 == "" {
		return errors.New("zip data is required")
	}
	data, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp("", "devpilot-skill-*.zip")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := io.Copy(tmp, bytes.NewReader(data)); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return s.ExtractSkillZip(tmpPath)
}

// IsSkillPackageDeletable 判断该技能包是否允许在技能仓库中删除。
// initSkills 下内置技能与规则链生成的技能（rule-*）不可删除。
func IsSkillPackageDeletable(dirName string) bool {
	dirName = strings.TrimSpace(filepath.Clean(dirName))
	if dirName == "" || dirName == "." || strings.Contains(dirName, "..") {
		return false
	}
	return !isBuiltinOrRuleSkill(dirName)
}

// DeleteSkillPackage 删除指定技能包子目录。initSkills 内置技能与规则链生成的技能（rule-*）禁止删除，返回错误。
func (s *Service) DeleteSkillPackage(dirName string) error {
	dirName = strings.TrimSpace(filepath.Clean(dirName))
	if dirName == "" || dirName == "." || strings.Contains(dirName, "..") {
		return errors.New("invalid dir name")
	}
	if !IsSkillPackageDeletable(dirName) {
		return errors.New("该技能为内置或由规则链生成，不可在技能仓库中删除")
	}
	absDir := filepath.Join(s.skillDir, dirName)
	info, err := os.Stat(absDir)
	if err != nil {
		if os.IsNotExist(err) {
			return errors.New("skill package not found")
		}
		return err
	}
	if !info.IsDir() {
		return errors.New("not a directory")
	}
	return os.RemoveAll(absDir)
}
