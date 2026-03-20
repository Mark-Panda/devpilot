package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/rs/zerolog/log"
)

const maxProgressEventsPerStudio = 500

type studiosFileDoc struct {
	Version  int                              `json:"version"`
	Studios  []Studio                         `json:"studios"`
	Progress map[string][]StudioProgressEvent `json:"progress"`
}

// StudioStore 工作室与进度持久化（~/.devpilot/studios.json）
type StudioStore struct {
	mu     sync.Mutex
	path   string
	doc    studiosFileDoc
	loaded bool
}

func NewStudioStore(path string) (*StudioStore, error) {
	if path == "" {
		return nil, fmt.Errorf("studios path empty")
	}
	s := &StudioStore{path: path, doc: studiosFileDoc{Version: 1, Progress: make(map[string][]StudioProgressEvent)}}
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
