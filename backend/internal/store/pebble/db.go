package pebble

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/cockroachdb/pebble"
)

// DB 封装 Pebble 数据库，供各 repository 使用。
type DB struct {
	*pebble.DB
}

// Open 在指定目录下打开 Pebble 数据库（目录即数据根，如 ~/.devpilot）。
func Open(dir string) (*DB, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}

	dbPath := filepath.Join(dir, "pebble")
	if err := os.MkdirAll(dbPath, 0o755); err != nil {
		return nil, fmt.Errorf("create pebble dir: %w", err)
	}

	pdb, err := pebble.Open(dbPath, &pebble.Options{})
	if err != nil {
		return nil, fmt.Errorf("open pebble: %w", err)
	}

	return &DB{DB: pdb}, nil
}

// Close 关闭数据库。
func (d *DB) Close() error {
	if d == nil || d.DB == nil {
		return nil
	}
	return d.DB.Close()
}
