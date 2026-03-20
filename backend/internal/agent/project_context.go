package agent

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
)

// projectContextImpl 项目上下文实现
type projectContextImpl struct {
	mu sync.RWMutex

	projectPath string
	projectInfo ProjectInfo
	fileCache   map[string]string // 文件内容缓存
	config      map[string]interface{} // 项目配置
}

// NewProjectContext 创建项目上下文
func NewProjectContext(projectPath string) (ProjectContext, error) {
	if projectPath == "" {
		return nil, fmt.Errorf("project path is empty")
	}

	// 检查路径是否存在
	if _, err := os.Stat(projectPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("project path does not exist: %s", projectPath)
	}

	ctx := &projectContextImpl{
		projectPath: projectPath,
		fileCache:   make(map[string]string),
		config:      make(map[string]interface{}),
	}

	// 初始化项目信息
	if err := ctx.loadProjectInfo(); err != nil {
		return nil, fmt.Errorf("load project info: %w", err)
	}

	log.Info().Str("path", projectPath).Msg("project context created")
	return ctx, nil
}

// GetProjectInfo 获取项目信息
func (p *projectContextImpl) GetProjectInfo(ctx context.Context) (ProjectInfo, error) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.projectInfo, nil
}

// SearchCode 搜索代码
func (p *projectContextImpl) SearchCode(ctx context.Context, query string, limit int) ([]CodeMatch, error) {
	if limit <= 0 {
		limit = 50
	}

	query = strings.ToLower(query)
	matches := make([]CodeMatch, 0)

	// 遍历项目文件进行简单搜索
	err := filepath.WalkDir(p.projectPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		// 跳过目录和隐藏文件
		if d.IsDir() {
			name := d.Name()
			if name == ".git" || name == "node_modules" || name == "vendor" || name == "build" {
				return filepath.SkipDir
			}
			return nil
		}

		// 只搜索文本文件
		if !isTextFile(path) {
			return nil
		}

		// 读取文件内容
		content, err := p.GetFileContent(ctx, path)
		if err != nil {
			return nil
		}

		// 搜索匹配行
		lines := strings.Split(content, "\n")
		for i, line := range lines {
			if strings.Contains(strings.ToLower(line), query) {
				relPath, _ := filepath.Rel(p.projectPath, path)
				matches = append(matches, CodeMatch{
					FilePath: relPath,
					Line:     i + 1,
					Content:  strings.TrimSpace(line),
					Score:    1.0,
				})

				if len(matches) >= limit {
					return filepath.SkipAll
				}
			}
		}

		return nil
	})

	if err != nil && err != filepath.SkipAll {
		return nil, fmt.Errorf("search code: %w", err)
	}

	return matches, nil
}

// GetFileContent 获取文件内容
func (p *projectContextImpl) GetFileContent(ctx context.Context, path string) (string, error) {
	// 转为绝对路径
	absPath := path
	if !filepath.IsAbs(path) {
		absPath = filepath.Join(p.projectPath, path)
	}

	// 检查缓存
	p.mu.RLock()
	if content, exists := p.fileCache[absPath]; exists {
		p.mu.RUnlock()
		return content, nil
	}
	p.mu.RUnlock()

	// 读取文件
	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", fmt.Errorf("read file: %w", err)
	}

	content := string(data)

	// 更新缓存
	p.mu.Lock()
	p.fileCache[absPath] = content
	p.mu.Unlock()

	return content, nil
}

// UpdateFile 更新文件内容
func (p *projectContextImpl) UpdateFile(ctx context.Context, path string, content string) error {
	// 转为绝对路径
	absPath := path
	if !filepath.IsAbs(path) {
		absPath = filepath.Join(p.projectPath, path)
	}

	// 写入文件
	if err := os.WriteFile(absPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	// 更新缓存
	p.mu.Lock()
	p.fileCache[absPath] = content
	p.mu.Unlock()

	log.Info().Str("path", path).Msg("file updated")
	return nil
}

// ListFiles 列出项目文件
func (p *projectContextImpl) ListFiles(ctx context.Context, pattern string) ([]string, error) {
	files := make([]string, 0)

	err := filepath.WalkDir(p.projectPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		// 跳过目录
		if d.IsDir() {
			name := d.Name()
			if name == ".git" || name == "node_modules" || name == "vendor" || name == "build" {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, _ := filepath.Rel(p.projectPath, path)

		// 应用模式匹配
		if pattern == "" || matchPattern(relPath, pattern) {
			files = append(files, relPath)
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("list files: %w", err)
	}

	return files, nil
}

// GetConfig 获取配置
func (p *projectContextImpl) GetConfig(ctx context.Context, key string) (interface{}, error) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	value, exists := p.config[key]
	if !exists {
		return nil, fmt.Errorf("config key %s not found", key)
	}

	return value, nil
}

// SetConfig 设置配置
func (p *projectContextImpl) SetConfig(ctx context.Context, key string, value interface{}) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.config[key] = value
	log.Debug().Str("key", key).Interface("value", value).Msg("config updated")
	return nil
}

// loadProjectInfo 加载项目信息
func (p *projectContextImpl) loadProjectInfo() error {
	info := ProjectInfo{
		Name:     filepath.Base(p.projectPath),
		Path:     p.projectPath,
		Language: detectLanguage(p.projectPath),
	}

	// 统计文件和行数
	totalLines := 0
	err := filepath.WalkDir(p.projectPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			name := d.Name()
			if name == ".git" || name == "node_modules" || name == "vendor" {
				return filepath.SkipDir
			}
			return nil
		}

		if isTextFile(path) {
			if content, err := os.ReadFile(path); err == nil {
				totalLines += strings.Count(string(content), "\n")
			}
		}

		return nil
	})

	if err != nil {
		return err
	}

	info.TotalLines = totalLines
	p.projectInfo = info

	return nil
}

// isTextFile 判断是否为文本文件
func isTextFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	textExts := []string{
		".go", ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cpp", ".h",
		".rs", ".rb", ".php", ".md", ".txt", ".json", ".yaml", ".yml", ".toml",
		".xml", ".html", ".css", ".scss", ".sql", ".sh", ".bash", ".zsh",
	}
	for _, e := range textExts {
		if ext == e {
			return true
		}
	}
	return false
}

// detectLanguage 检测项目语言
func detectLanguage(projectPath string) string {
	// 检查特征文件
	checks := map[string]string{
		"go.mod":         "Go",
		"package.json":   "JavaScript/TypeScript",
		"requirements.txt": "Python",
		"Cargo.toml":     "Rust",
		"pom.xml":        "Java",
		"Gemfile":        "Ruby",
	}

	for file, lang := range checks {
		if _, err := os.Stat(filepath.Join(projectPath, file)); err == nil {
			return lang
		}
	}

	return "Unknown"
}

// matchPattern 简单的模式匹配
func matchPattern(path, pattern string) bool {
	if pattern == "*" || pattern == "**" {
		return true
	}
	// 简单的后缀匹配
	if strings.HasPrefix(pattern, "*.") {
		return strings.HasSuffix(path, pattern[1:])
	}
	// 包含匹配
	return strings.Contains(path, pattern)
}
