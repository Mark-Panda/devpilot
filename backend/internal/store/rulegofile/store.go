package rulegofile

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"devpilot/backend/internal/store/models"
)

// DefaultDir 返回 ~/.devpilot/rulego（规则链仅在此目录以 *.json 持久化，文件内容为纯 DSL JSON）。
func DefaultDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".devpilot", "rulego"), nil
}

// Store 将每条规则存为 {id}.json，文件正文仅为 definition（RuleGo DSL），无外层 envelope。
type Store struct {
	dir string
}

// New 创建文件存储；dir 一般为 DefaultDir()。
func New(dir string) (*Store, error) {
	if strings.TrimSpace(dir) == "" {
		return nil, fmt.Errorf("rulego file store: dir is empty")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("rulego file store mkdir: %w", err)
	}
	return &Store{dir: dir}, nil
}

func (s *Store) pathFor(id string) string {
	return filepath.Join(s.dir, strings.TrimSpace(id)+".json")
}

// Create 写入新规则文件；要求 input.ID 已由上层生成且非空，input.Definition 已规范化。
func (s *Store) Create(_ context.Context, input models.RuleGoRule) (models.RuleGoRule, error) {
	id := strings.TrimSpace(input.ID)
	if id == "" {
		return models.RuleGoRule{}, fmt.Errorf("rule id is required")
	}
	def := strings.TrimSpace(input.Definition)
	if def == "" {
		return models.RuleGoRule{}, fmt.Errorf("definition is required")
	}
	path := s.pathFor(id)
	if _, err := os.Stat(path); err == nil {
		return models.RuleGoRule{}, fmt.Errorf("规则已存在: %s", id)
	} else if !os.IsNotExist(err) {
		return models.RuleGoRule{}, err
	}
	if err := os.WriteFile(path, []byte(def), 0o644); err != nil {
		return models.RuleGoRule{}, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return models.RuleGoRule{}, err
	}
	out := input
	out.ID = id
	out.Definition = def
	SetRuleUpdatedAt(&out, st.ModTime())
	return out, nil
}

func (s *Store) GetByID(_ context.Context, id string) (models.RuleGoRule, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return models.RuleGoRule{}, fmt.Errorf("%w: empty id", os.ErrNotExist)
	}
	path := s.pathFor(id)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return models.RuleGoRule{}, fmt.Errorf("%w", os.ErrNotExist)
		}
		return models.RuleGoRule{}, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return models.RuleGoRule{}, err
	}
	rule := models.RuleGoRule{
		ID:         id,
		Definition: string(data),
	}
	SetRuleUpdatedAt(&rule, st.ModTime())
	return rule, nil
}

func (s *Store) List(_ context.Context) ([]models.RuleGoRule, error) {
	pattern := filepath.Join(s.dir, "*.json")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}
	type item struct {
		rule models.RuleGoRule
		mt   time.Time
	}
	var items []item
	for _, path := range matches {
		base := filepath.Base(path)
		id := strings.TrimSuffix(base, ".json")
		if id == "" || id == "." {
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		st, err := os.Stat(path)
		if err != nil {
			continue
		}
		rule := models.RuleGoRule{ID: id, Definition: string(data)}
		SetRuleUpdatedAt(&rule, st.ModTime())
		items = append(items, item{rule: rule, mt: st.ModTime()})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].mt.After(items[j].mt)
	})
	out := make([]models.RuleGoRule, 0, len(items))
	for _, it := range items {
		out = append(out, it.rule)
	}
	return out, nil
}

func (s *Store) Update(_ context.Context, id string, patch models.RuleGoRule) (models.RuleGoRule, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return models.RuleGoRule{}, fmt.Errorf("%w: empty id", os.ErrNotExist)
	}
	def := strings.TrimSpace(patch.Definition)
	if def == "" {
		return models.RuleGoRule{}, fmt.Errorf("definition is required")
	}
	path := s.pathFor(id)
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return models.RuleGoRule{}, fmt.Errorf("%w", os.ErrNotExist)
		}
		return models.RuleGoRule{}, err
	}
	if err := os.WriteFile(path, []byte(def), 0o644); err != nil {
		return models.RuleGoRule{}, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return models.RuleGoRule{}, err
	}
	out := patch
	out.ID = id
	out.Definition = def
	SetRuleUpdatedAt(&out, st.ModTime())
	return out, nil
}

func (s *Store) Delete(_ context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("%w: empty id", os.ErrNotExist)
	}
	path := s.pathFor(id)
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%w", os.ErrNotExist)
		}
		return err
	}
	return nil
}

// NewRuleID 生成新规则 UUID（供 service 在落盘前赋值）。
func NewRuleID() string {
	return uuid.NewString()
}
