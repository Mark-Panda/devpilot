package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"unicode"

	"github.com/rs/zerolog/log"
)

const (
	studioTodoMaxItemsPerAgent = 40
	studioTodoFileVersion      = 1
)

type studioTodosDocument struct {
	Version int                             `json:"version"`
	Studios map[string]*studioTodosPerRoom `json:"studios"`
}

type studioTodosPerRoom struct {
	Agents map[string][]StudioTodoItem `json:"agents"`
}

// StudioTodoStore 持久化 ~/.devpilot/studio-todos.json
type StudioTodoStore struct {
	path string
	mu   sync.Mutex
}

func newStudioTodoStore(path string) *StudioTodoStore {
	return &StudioTodoStore{path: path}
}

func (s *StudioTodoStore) loadUnlocked() (*studioTodosDocument, error) {
	doc := &studioTodosDocument{
		Version: studioTodoFileVersion,
		Studios: make(map[string]*studioTodosPerRoom),
	}
	if s.path == "" {
		return doc, nil
	}
	b, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return doc, nil
		}
		return nil, err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return doc, nil
	}
	if err := json.Unmarshal(b, doc); err != nil {
		return nil, fmt.Errorf("parse studio-todos: %w", err)
	}
	if doc.Studios == nil {
		doc.Studios = make(map[string]*studioTodosPerRoom)
	}
	return doc, nil
}

func (s *StudioTodoStore) saveUnlocked(doc *studioTodosDocument) error {
	if s.path == "" {
		return fmt.Errorf("studio-todos path empty")
	}
	if doc.Studios == nil {
		doc.Studios = make(map[string]*studioTodosPerRoom)
	}
	doc.Version = studioTodoFileVersion
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func validateTodoItemID(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("todo id 不能为空")
	}
	if len(id) > 64 {
		return fmt.Errorf("todo id 过长")
	}
	for _, r := range id {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' {
			continue
		}
		return fmt.Errorf("todo id 仅允许字母、数字、下划线与连字符")
	}
	return nil
}

func normalizeTodoItems(items []StudioTodoItem) ([]StudioTodoItem, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("至少一条 TODO")
	}
	if len(items) > studioTodoMaxItemsPerAgent {
		return nil, fmt.Errorf("TODO 条数超过上限 %d", studioTodoMaxItemsPerAgent)
	}
	seen := make(map[string]struct{}, len(items))
	out := make([]StudioTodoItem, 0, len(items))
	for i, it := range items {
		if err := validateTodoItemID(it.ID); err != nil {
			return nil, fmt.Errorf("items[%d].id: %w", i, err)
		}
		title := strings.TrimSpace(it.Title)
		if title == "" {
			return nil, fmt.Errorf("items[%d].title 不能为空", i)
		}
		if len(title) > 512 {
			return nil, fmt.Errorf("items[%d].title 过长", i)
		}
		id := strings.TrimSpace(it.ID)
		if _, dup := seen[id]; dup {
			return nil, fmt.Errorf("重复的 todo id: %s", id)
		}
		seen[id] = struct{}{}
		out = append(out, StudioTodoItem{ID: id, Title: title, Done: it.Done})
	}
	return out, nil
}

// Get 返回工作室某 Agent 的 TODO 副本
func (s *StudioTodoStore) Get(studioID, agentID string) []StudioTodoItem {
	studioID, agentID = strings.TrimSpace(studioID), strings.TrimSpace(agentID)
	if studioID == "" || agentID == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := s.loadUnlocked()
	if err != nil {
		log.Warn().Err(err).Msg("studio todos load failed")
		return nil
	}
	room := doc.Studios[studioID]
	if room == nil || room.Agents == nil {
		return nil
	}
	items := room.Agents[agentID]
	out := make([]StudioTodoItem, len(items))
	copy(out, items)
	return out
}

// Replace 覆盖某 Agent 在工作室内的 TODO 列表
func (s *StudioTodoStore) Replace(studioID, agentID string, items []StudioTodoItem) error {
	studioID, agentID = strings.TrimSpace(studioID), strings.TrimSpace(agentID)
	if studioID == "" || agentID == "" {
		return fmt.Errorf("studio_id 或 agent_id 无效")
	}
	norm, err := normalizeTodoItems(items)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := s.loadUnlocked()
	if err != nil {
		return err
	}
	if doc.Studios[studioID] == nil {
		doc.Studios[studioID] = &studioTodosPerRoom{Agents: make(map[string][]StudioTodoItem)}
	}
	if doc.Studios[studioID].Agents == nil {
		doc.Studios[studioID].Agents = make(map[string][]StudioTodoItem)
	}
	doc.Studios[studioID].Agents[agentID] = norm
	if err := s.saveUnlocked(doc); err != nil {
		return err
	}
	return nil
}

// Complete 将指定 id 标为已完成
func (s *StudioTodoStore) Complete(studioID, agentID, todoID string) error {
	studioID, agentID = strings.TrimSpace(studioID), strings.TrimSpace(agentID)
	todoID = strings.TrimSpace(todoID)
	if err := validateTodoItemID(todoID); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := s.loadUnlocked()
	if err != nil {
		return err
	}
	room := doc.Studios[studioID]
	if room == nil || room.Agents == nil {
		return fmt.Errorf("未找到 TODO 列表，请先 replace 创建")
	}
	list := room.Agents[agentID]
	found := false
	for i := range list {
		if list[i].ID == todoID {
			list[i].Done = true
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("未找到 id=%s 的 TODO", todoID)
	}
	room.Agents[agentID] = list
	return s.saveUnlocked(doc)
}
