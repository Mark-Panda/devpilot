package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/rs/zerolog/log"
	"github.com/tmc/langchaingo/llms"
)

const (
	WorkspaceReadFileToolName = "devpilot_read_file"
	WorkspaceWriteFileToolName = "devpilot_write_file"
	WorkspaceSearchReplaceToolName = "devpilot_search_replace"
	WorkspaceListDirToolName       = "devpilot_list_workspace_dir"

	maxWorkspaceFileToolBytes = 1 << 20 // 单文件全文读写上限
	maxWorkspaceReadLineSpan  = 4000    // 单次按行读取最多返回行数
	maxWorkspaceListEntries   = 500
	defaultWorkspaceListCap   = 200
	maxWorkspaceScanTokenSize = 1024 * 1024 // 单行最大长度（流式按行读）
)

var workspaceReadFileParams = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"path": map[string]any{
			"type":        "string",
			"description": "相对项目根的路径，或已位于项目根内的绝对路径",
		},
		"start_line": map[string]any{
			"type":        "number",
			"description": "可选，从第几行开始（从 1 起算，含该行）",
		},
		"end_line": map[string]any{
			"type":        "number",
			"description": "可选，读到第几行结束（从 1 起算，含该行）；省略则读到文件末尾",
		},
	},
	"required": []string{"path"},
}

var workspaceWriteFileParams = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"path": map[string]any{
			"type":        "string",
			"description": "相对项目根的路径；缺失的父目录会自动创建",
		},
		"content": map[string]any{
			"type":        "string",
			"description": "完整文件内容（UTF-8）",
		},
	},
	"required": []string{"path", "content"},
}

var workspaceSearchReplaceParams = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"path": map[string]any{
			"type":        "string",
			"description": "相对项目根的路径",
		},
		"old_string": map[string]any{
			"type":        "string",
			"description": "要被替换的原文；默认须在全文中唯一出现一次",
		},
		"new_string": map[string]any{
			"type":        "string",
			"description": "替换后的文本",
		},
		"replace_all": map[string]any{
			"type":        "boolean",
			"description": "为 true 时替换所有 old_string 出现处；为 false（默认）时 old_string 必须恰好出现一次",
		},
	},
	"required": []string{"path", "old_string", "new_string"},
}

var workspaceListDirParams = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"path": map[string]any{
			"type":        "string",
			"description": "相对项目根的目录路径，空字符串表示项目根",
		},
		"max_entries": map[string]any{
			"type":        "number",
			"description": "最多列出的条目数，默认 200，上限 500",
		},
	},
	"required": []string{},
}

// workspaceProjectFileTools 在已打开项目时注册；readOnly 为 true 时不注册写入类工具。
func workspaceProjectFileTools(readOnly bool) []llms.Tool {
	out := []llms.Tool{
		{
			Type: "function",
			Function: &llms.FunctionDefinition{
				Name:        WorkspaceReadFileToolName,
				Description: "读取文本文件；path 相对本 Agent 工作区根（专属 workspace_root 或应用默认项目根）。全文超过约 1MiB 时需指定 start_line/end_line 流式读取。",
				Parameters:  workspaceReadFileParams,
			},
		},
		{
			Type: "function",
			Function: &llms.FunctionDefinition{
				Name:        WorkspaceListDirToolName,
				Description: "列出本 Agent 工作区根下某一目录的直接子项（不递归）。",
				Parameters:  workspaceListDirParams,
			},
		},
	}
	if readOnly {
		return out
	}
	out = append(out,
		llms.Tool{
			Type: "function",
			Function: &llms.FunctionDefinition{
				Name:        WorkspaceWriteFileToolName,
				Description: "在工作区根内创建或覆盖文件（UTF-8）；自动创建缺失父目录。",
				Parameters:  workspaceWriteFileParams,
			},
		},
		llms.Tool{
			Type: "function",
			Function: &llms.FunctionDefinition{
				Name: WorkspaceSearchReplaceToolName,
				Description: "在工作区根内文本文件中替换字符串。默认 old_string 须唯一匹配；" +
					"replace_all=true 时可替换多处。",
				Parameters: workspaceSearchReplaceParams,
			},
		},
	)
	return out
}

func workspaceResolvePath(root, userPath string) (abs, rel string, err error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return "", "", fmt.Errorf("项目根路径为空")
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", "", fmt.Errorf("解析项目根: %w", err)
	}
	if r2, err := filepath.EvalSymlinks(rootAbs); err == nil {
		rootAbs = r2
	}
	userPath = strings.TrimSpace(userPath)
	if userPath == "" {
		return "", "", fmt.Errorf("文件路径为空")
	}
	var full string
	if filepath.IsAbs(userPath) {
		full = filepath.Clean(userPath)
	} else {
		relPart := filepath.Clean(userPath)
		if relPart == ".." || strings.HasPrefix(relPart, ".."+string(filepath.Separator)) {
			return "", "", fmt.Errorf("非法相对路径")
		}
		full = filepath.Join(rootAbs, relPart)
	}
	full = filepath.Clean(full)
	rel, err = filepath.Rel(rootAbs, full)
	if err != nil {
		return "", "", fmt.Errorf("路径不在项目内")
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", "", fmt.Errorf("路径超出项目根目录")
	}
	return full, rel, nil
}

// 若路径已存在且为符号链接，解析后再次校验仍在项目根内。
func workspaceFinalizeExistingPath(rootAbs, full, rel string) (string, string, error) {
	fi, err := os.Lstat(full)
	if err != nil {
		if os.IsNotExist(err) {
			return full, rel, nil
		}
		return "", "", err
	}
	if fi.Mode()&os.ModeSymlink == 0 {
		return full, rel, nil
	}
	resolved, err := filepath.EvalSymlinks(full)
	if err != nil {
		return "", "", fmt.Errorf("解析符号链接: %w", err)
	}
	rel2, err := filepath.Rel(rootAbs, resolved)
	if err != nil || rel2 == ".." || strings.HasPrefix(rel2, ".."+string(filepath.Separator)) {
		return "", "", fmt.Errorf("符号链接指向项目根之外")
	}
	return resolved, rel2, nil
}

func workspaceRootAbs(projectRoot string) (string, error) {
	rootAbs, err := filepath.Abs(strings.TrimSpace(projectRoot))
	if err != nil {
		return "", err
	}
	if r2, err := filepath.EvalSymlinks(rootAbs); err == nil {
		rootAbs = r2
	}
	return rootAbs, nil
}

func workspaceLooksBinary(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	sample := b
	if len(sample) > 8000 {
		sample = sample[:8000]
	}
	return bytes.IndexByte(sample, 0) >= 0
}

func workspaceClipUTF8(s string, maxBytes int) string {
	if maxBytes <= 0 || len(s) <= maxBytes {
		return s
	}
	s = s[:maxBytes]
	for len(s) > 0 && !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s + "\n\n… (truncated)"
}

func sliceLines(content string, startLine, endLine int) (string, error) {
	lines := strings.Split(content, "\n")
	n := len(lines)
	if startLine < 1 {
		startLine = 1
	}
	if startLine > n {
		return "", fmt.Errorf("start_line=%d 超过文件行数 %d", startLine, n)
	}
	if endLine < 1 || endLine > n {
		endLine = n
	}
	if endLine < startLine {
		return "", fmt.Errorf("end_line 不能小于 start_line")
	}
	if endLine-startLine+1 > maxWorkspaceReadLineSpan {
		return "", fmt.Errorf("行范围过大（最多 %d 行），请缩小 start_line～end_line", maxWorkspaceReadLineSpan)
	}
	out := strings.Join(lines[startLine-1:endLine], "\n")
	header := fmt.Sprintf("(lines %d-%d of %d)\n", startLine, endLine, n)
	return header + out, nil
}

// 流式读取 [startLine, endLine]（1-based，含端点），不将整个文件载入内存。
func readWorkspaceFileLineRange(abs string, startLine, endLine int) (string, error) {
	if startLine < 1 {
		startLine = 1
	}
	if endLine > 0 && endLine < startLine {
		return "", fmt.Errorf("end_line 不能小于 start_line")
	}
	if endLine > 0 && endLine-startLine+1 > maxWorkspaceReadLineSpan {
		return "", fmt.Errorf("行范围过大（最多 %d 行）", maxWorkspaceReadLineSpan)
	}
	f, err := os.Open(abs)
	if err != nil {
		return "", err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), maxWorkspaceScanTokenSize)

	lineNo := 0
	var picked []string
	nulSeen := false
	for sc.Scan() {
		lineNo++
		b := sc.Bytes()
		if bytes.IndexByte(b, 0) >= 0 {
			nulSeen = true
		}
		if lineNo < startLine {
			continue
		}
		if endLine > 0 && lineNo > endLine {
			break
		}
		picked = append(picked, string(b))
		if endLine <= 0 && len(picked) >= maxWorkspaceReadLineSpan {
			return "", fmt.Errorf("未指定 end_line 时一次最多读取 %d 行，请指定 end_line", maxWorkspaceReadLineSpan)
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}
	if nulSeen {
		return "", fmt.Errorf("疑似二进制内容（含 NUL 字节）")
	}
	if lineNo < startLine {
		return "", fmt.Errorf("start_line=%d 超过文件行数 %d", startLine, lineNo)
	}
	if endLine > 0 && endLine > lineNo {
		endLine = lineNo
	}
	totalLines := lineNo
	if endLine <= 0 {
		endLine = lineNo
	}
	header := fmt.Sprintf("(lines %d-%d of %d)\n", startLine, endLine, totalLines)
	return header + strings.Join(picked, "\n"), nil
}

func workspaceSkipDirEntry(name string) bool {
	if name == ".git" || name == "node_modules" || name == "vendor" || name == "build" || name == "dist" || name == ".idea" {
		return true
	}
	return false
}

func (a *agentImpl) workspaceAssertWriteAllowed() error {
	if a.config.WorkspaceFileReadOnly {
		return fmt.Errorf("当前 Agent 已开启「项目文件仅只读」，无法写入或 search_replace")
	}
	return nil
}

func (a *agentImpl) executeWorkspaceReadFile(ctx context.Context, arguments string) (string, error) {
	_ = ctx
	root := a.effectiveFileWorkspaceRoot(ctx)
	if root == "" {
		return "", fmt.Errorf("未配置可用的工作区：可在 Agent 管理设置专属目录、聊天页设置应用默认，或在工作室内为该 Agent 单独设置工作区")
	}
	rootAbs, err := workspaceRootAbs(root)
	if err != nil {
		return "", err
	}
	var payload struct {
		Path      string `json:"path"`
		StartLine int    `json:"start_line"`
		EndLine   int    `json:"end_line"`
	}
	raw := strings.TrimSpace(arguments)
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		var loose map[string]any
		if err2 := json.Unmarshal([]byte(raw), &loose); err2 != nil {
			return "", fmt.Errorf("参数须为 JSON，包含 path: %w", err)
		}
		if p, ok := loose["path"].(string); ok {
			payload.Path = p
		}
		payload.StartLine = intFromJSON(loose["start_line"])
		payload.EndLine = intFromJSON(loose["end_line"])
	}
	abs, rel, err := workspaceResolvePath(root, payload.Path)
	if err != nil {
		return "", err
	}
	abs, rel, err = workspaceFinalizeExistingPath(rootAbs, abs, rel)
	if err != nil {
		return "", err
	}

	hasRange := payload.StartLine > 0 || payload.EndLine > 0
	fi, statErr := os.Stat(abs)
	if statErr != nil {
		return "", fmt.Errorf("读取失败: %w", statErr)
	}
	if fi.IsDir() {
		return "", fmt.Errorf("路径是目录而非文件: %s", rel)
	}

	if !hasRange && fi.Size() > maxWorkspaceFileToolBytes {
		return "", fmt.Errorf("文件约 %d 字节，超过全文上限 %d，请使用 start_line 与 end_line 分段读取", fi.Size(), maxWorkspaceFileToolBytes)
	}

	if hasRange {
		start := payload.StartLine
		if start <= 0 {
			start = 1
		}
		end := payload.EndLine
		if fi.Size() > maxWorkspaceFileToolBytes {
			text, err := readWorkspaceFileLineRange(abs, start, end)
			if err != nil {
				return "", err
			}
			text = workspaceClipUTF8(text, maxWorkspaceFileToolBytes)
			log.Debug().Str("agent_id", a.config.ID).Str("tool", WorkspaceReadFileToolName).Str("path", rel).Msg("workspace file read (stream)")
			return text, nil
		}
	}

	data, err := os.ReadFile(abs)
	if err != nil {
		return "", fmt.Errorf("读取失败: %w", err)
	}
	if len(data) > maxWorkspaceFileToolBytes {
		return "", fmt.Errorf("文件超过 %d 字节，请指定 start_line/end_line 分段读取", maxWorkspaceFileToolBytes)
	}
	if workspaceLooksBinary(data) {
		return "", fmt.Errorf("疑似二进制文件，拒绝读取: %s", rel)
	}
	text := string(data)
	if hasRange {
		start := payload.StartLine
		end := payload.EndLine
		if start <= 0 {
			start = 1
		}
		if end <= 0 {
			end = len(strings.Split(text, "\n"))
		}
		text, err = sliceLines(text, start, end)
		if err != nil {
			return "", err
		}
	}
	text = workspaceClipUTF8(text, maxWorkspaceFileToolBytes)
	log.Debug().Str("agent_id", a.config.ID).Str("tool", WorkspaceReadFileToolName).Str("path", rel).Msg("workspace file read")
	return text, nil
}

func intFromJSON(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	default:
		return 0
	}
}

func (a *agentImpl) executeWorkspaceListDir(ctx context.Context, arguments string) (string, error) {
	_ = ctx
	root := a.effectiveFileWorkspaceRoot(ctx)
	if root == "" {
		return "", fmt.Errorf("未配置可用的工作区：可在 Agent 管理设置专属目录、聊天页设置应用默认，或在工作室内为该 Agent 单独设置工作区")
	}
	rootAbs, err := workspaceRootAbs(root)
	if err != nil {
		return "", err
	}
	var payload struct {
		Path        string `json:"path"`
		MaxEntries  int    `json:"max_entries"`
	}
	if raw := strings.TrimSpace(arguments); raw != "" {
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			var loose map[string]any
			if err2 := json.Unmarshal([]byte(raw), &loose); err2 != nil {
				return "", fmt.Errorf("参数须为 JSON 对象: %w", err)
			}
			if p, ok := loose["path"].(string); ok {
				payload.Path = p
			}
			payload.MaxEntries = intFromJSON(loose["max_entries"])
		}
	}
	capN := payload.MaxEntries
	if capN <= 0 {
		capN = defaultWorkspaceListCap
	}
	if capN > maxWorkspaceListEntries {
		capN = maxWorkspaceListEntries
	}

	var abs, rel string
	if strings.TrimSpace(payload.Path) == "" {
		abs = rootAbs
		rel = "."
	} else {
		abs, rel, err = workspaceResolvePath(root, payload.Path)
		if err != nil {
			return "", err
		}
		abs, rel, err = workspaceFinalizeExistingPath(rootAbs, abs, rel)
		if err != nil {
			return "", err
		}
	}
	fi, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("路径无效: %w", err)
	}
	if !fi.IsDir() {
		return "", fmt.Errorf("不是目录: %s", rel)
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return "", err
	}
	type row struct {
		name string
		dir  bool
	}
	var rows []row
	truncated := false
	for _, e := range entries {
		name := e.Name()
		if workspaceSkipDirEntry(name) {
			continue
		}
		isDir := e.IsDir()
		rows = append(rows, row{name: name, dir: isDir})
		if len(rows) >= capN {
			truncated = true
			break
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].dir != rows[j].dir {
			return rows[i].dir
		}
		return rows[i].name < rows[j].name
	})
	var b strings.Builder
	fmt.Fprintf(&b, "目录: %s（最多 %d 项，不递归）\n", rel, capN)
	for _, r := range rows {
		if r.dir {
			fmt.Fprintf(&b, "%s/\n", r.name)
		} else {
			fmt.Fprintf(&b, "%s\n", r.name)
		}
	}
	if truncated {
		b.WriteString("… 已达 max_entries 上限，未全部列出\n")
	}
	log.Debug().Str("agent_id", a.config.ID).Str("tool", WorkspaceListDirToolName).Str("path", rel).Msg("workspace list dir")
	return b.String(), nil
}

func (a *agentImpl) executeWorkspaceWriteFile(ctx context.Context, arguments string) (string, error) {
	if err := a.workspaceAssertWriteAllowed(); err != nil {
		return "", err
	}
	root := a.effectiveFileWorkspaceRoot(ctx)
	if root == "" {
		return "", fmt.Errorf("未配置可用的工作区")
	}
	var payload struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(arguments)), &payload); err != nil {
		return "", fmt.Errorf("参数须为 JSON，包含 path 与 content: %w", err)
	}
	if len(payload.Content) > maxWorkspaceFileToolBytes {
		return "", fmt.Errorf("content 超过 %d 字节", maxWorkspaceFileToolBytes)
	}
	abs, rel, err := workspaceResolvePath(root, payload.Path)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
		return "", fmt.Errorf("创建父目录: %w", err)
	}
	if err := os.WriteFile(abs, []byte(payload.Content), 0644); err != nil {
		return "", err
	}
	_ = ctx
	log.Info().Str("agent_id", a.config.ID).Str("tool", WorkspaceWriteFileToolName).Str("path", rel).Msg("workspace file written")
	return fmt.Sprintf("已写入 %s（%d 字节）", rel, len(payload.Content)), nil
}

func (a *agentImpl) executeWorkspaceSearchReplace(ctx context.Context, arguments string) (string, error) {
	if err := a.workspaceAssertWriteAllowed(); err != nil {
		return "", err
	}
	root := a.effectiveFileWorkspaceRoot(ctx)
	if root == "" {
		return "", fmt.Errorf("未配置可用的工作区")
	}
	rootAbs, err := workspaceRootAbs(root)
	if err != nil {
		return "", err
	}
	var payload struct {
		Path       string `json:"path"`
		Old        string `json:"old_string"`
		New        string `json:"new_string"`
		ReplaceAll bool   `json:"replace_all"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(arguments)), &payload); err != nil {
		return "", fmt.Errorf("参数须为 JSON: %w", err)
	}
	if payload.Old == "" {
		return "", fmt.Errorf("old_string 不能为空")
	}
	abs, rel, err := workspaceResolvePath(root, payload.Path)
	if err != nil {
		return "", err
	}
	abs, rel, err = workspaceFinalizeExistingPath(rootAbs, abs, rel)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return "", fmt.Errorf("读取失败: %w", err)
	}
	if len(data) > maxWorkspaceFileToolBytes {
		return "", fmt.Errorf("文件超过 %d 字节，请分段处理", maxWorkspaceFileToolBytes)
	}
	if workspaceLooksBinary(data) {
		return "", fmt.Errorf("疑似二进制文件: %s", rel)
	}
	s := string(data)
	n := strings.Count(s, payload.Old)
	if !payload.ReplaceAll {
		if n == 0 {
			return "", fmt.Errorf("未找到匹配的 old_string")
		}
		if n > 1 {
			return "", fmt.Errorf("old_string 出现 %d 次，请缩小上下文或改用 replace_all", n)
		}
		s = strings.Replace(s, payload.Old, payload.New, 1)
	} else {
		if n == 0 {
			return "", fmt.Errorf("未找到匹配的 old_string")
		}
		s = strings.ReplaceAll(s, payload.Old, payload.New)
	}
	if err := os.WriteFile(abs, []byte(s), 0644); err != nil {
		return "", err
	}
	_ = ctx
	log.Info().Str("agent_id", a.config.ID).Str("tool", WorkspaceSearchReplaceToolName).Str("path", rel).Int("replacements", n).Msg("workspace search_replace")
	return fmt.Sprintf("已更新 %s（%d 处替换）", rel, n), nil
}
