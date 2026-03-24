package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
)

const maxProgressEventsPerStudio = 500

type studiosFileDoc struct {
	Version int `json:"version"`
	Studios []Studio `json:"studios"`
	// Progress 工作室进度时间线
	Progress map[string][]StudioProgressEvent `json:"progress"`
	// AgentWorkspaces studio_id -> agent_id -> 文件工具根目录（绝对路径）
	AgentWorkspaces map[string]map[string]string `json:"agent_workspaces,omitempty"`
}

// StudioStore 工作室与进度持久化（~/.devpilot/studios.json）
type StudioStore struct {
	mu     sync.RWMutex
	path   string
	doc    studiosFileDoc
	loaded bool
}

func NewStudioStore(path string) (*StudioStore, error) {
	if path == "" {
		return nil, fmt.Errorf("studios path empty")
	}
	s := &StudioStore{path: path, doc: studiosFileDoc{
		Version:         1,
		Progress:        make(map[string][]StudioProgressEvent),
		AgentWorkspaces: make(map[string]map[string]string),
	}}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *StudioStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.loaded = true
			return nil
		}
		return err
	}
	var doc studiosFileDoc
	if err := json.Unmarshal(data, &doc); err != nil {
		return err
	}
	if doc.Version == 0 {
		doc.Version = 1
	}
	if doc.Progress == nil {
		doc.Progress = make(map[string][]StudioProgressEvent)
	}
	if doc.AgentWorkspaces == nil {
		doc.AgentWorkspaces = make(map[string]map[string]string)
	}
	s.doc = doc
	s.loaded = true
	return nil
}

func (s *StudioStore) saveLocked() error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	s.doc.Version = 1
	data, err := json.MarshalIndent(s.doc, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// ListStudios 返回全部工作室（拷贝）
func (s *StudioStore) ListStudios() []Studio {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Studio, len(s.doc.Studios))
	copy(out, s.doc.Studios)
	return out
}

// StudiosUsingMainAgent 返回绑定到指定主 Agent 的工作室（拷贝，供删除主 Agent 前校验）
func (s *StudioStore) StudiosUsingMainAgent(mainAgentID string) []Studio {
	mainAgentID = strings.TrimSpace(mainAgentID)
	if mainAgentID == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Studio
	for _, st := range s.doc.Studios {
		if st.MainAgentID == mainAgentID {
			out = append(out, st)
		}
	}
	return out
}

func (s *StudioStore) GetStudio(studioID string) (Studio, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, st := range s.doc.Studios {
		if st.ID == studioID {
			return st, nil
		}
	}
	return Studio{}, fmt.Errorf("studio %q not found", studioID)
}

func (s *StudioStore) AddStudio(st Studio) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.doc.Studios {
		if x.ID == st.ID {
			return fmt.Errorf("studio id 重复")
		}
	}
	s.doc.Studios = append(s.doc.Studios, st)
	if err := s.saveLocked(); err != nil {
		s.doc.Studios = s.doc.Studios[:len(s.doc.Studios)-1]
		return err
	}
	return nil
}

func (s *StudioStore) DeleteStudio(studioID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := -1
	for i, x := range s.doc.Studios {
		if x.ID == studioID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return fmt.Errorf("studio %q not found", studioID)
	}
	s.doc.Studios = append(s.doc.Studios[:idx], s.doc.Studios[idx+1:]...)
	delete(s.doc.Progress, studioID)
	delete(s.doc.AgentWorkspaces, studioID)
	return s.saveLocked()
}

// GetAgentWorkspace 返回本工作室下该 Agent 的文件工具根（绝对路径）；未配置返回空串
func (s *StudioStore) GetAgentWorkspace(studioID, agentID string) string {
	studioID = strings.TrimSpace(studioID)
	agentID = strings.TrimSpace(agentID)
	if studioID == "" || agentID == "" {
		return ""
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	bySt, ok := s.doc.AgentWorkspaces[studioID]
	if !ok {
		return ""
	}
	return strings.TrimSpace(bySt[agentID])
}

// ListAgentWorkspaces 返回工作室内全部已配置的成员工作区（拷贝）
func (s *StudioStore) ListAgentWorkspaces(studioID string) map[string]string {
	studioID = strings.TrimSpace(studioID)
	if studioID == "" {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	bySt, ok := s.doc.AgentWorkspaces[studioID]
	if !ok || len(bySt) == 0 {
		return nil
	}
	out := make(map[string]string, len(bySt))
	for k, v := range bySt {
		out[k] = v
	}
	return out
}

// SetAgentWorkspace 设置或清除（path 空）某成员在本工作室内的文件工具根
func (s *StudioStore) SetAgentWorkspace(studioID, agentID, path string) error {
	studioID = strings.TrimSpace(studioID)
	agentID = strings.TrimSpace(agentID)
	if studioID == "" || agentID == "" {
		return fmt.Errorf("studio_id 与 agent_id 不能为空")
	}
	path = strings.TrimSpace(path)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc.AgentWorkspaces == nil {
		s.doc.AgentWorkspaces = make(map[string]map[string]string)
	}
	room := s.doc.AgentWorkspaces[studioID]
	if path == "" {
		if room != nil {
			delete(room, agentID)
			if len(room) == 0 {
				delete(s.doc.AgentWorkspaces, studioID)
			}
		}
		return s.saveLocked()
	}
	if room == nil {
		room = make(map[string]string)
		s.doc.AgentWorkspaces[studioID] = room
	}
	room[agentID] = path
	return s.saveLocked()
}

// AppendProgress 追加一条进度并裁剪长度
func (s *StudioStore) AppendProgress(ev StudioProgressEvent) error {
	if ev.StudioID == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	prev := s.doc.Progress[ev.StudioID]
	list := append(append([]StudioProgressEvent(nil), prev...), ev)
	if len(list) > maxProgressEventsPerStudio {
		list = list[len(list)-maxProgressEventsPerStudio:]
	}
	s.doc.Progress[ev.StudioID] = list
	if err := s.saveLocked(); err != nil {
		s.doc.Progress[ev.StudioID] = prev
		log.Warn().Err(err).Str("studio_id", ev.StudioID).Msg("persist studio progress failed")
		return err
	}
	return nil
}

// GetProgress 返回某工作室进度（时间正序，拷贝）
func (s *StudioStore) GetProgress(studioID string) []StudioProgressEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := s.doc.Progress[studioID]
	out := make([]StudioProgressEvent, len(list))
	copy(out, list)
	return out
}
