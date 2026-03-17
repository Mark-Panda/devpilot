package pebble

import (
	"strings"

	"github.com/cockroachdb/pebble"
)

// prefixEnd 返回比 prefix 大的最小 key，用于范围迭代上界（不含 prefix 本身后的任意字符）。
func prefixEnd(prefix string) []byte {
	b := []byte(prefix)
	end := make([]byte, len(b)+1)
	copy(end, b)
	end[len(b)] = 0xff
	return end
}

// listIDsByIndexDesc 按索引 key 逆序（新在前）遍历，解析出 id（key 格式 prefixIndex + sortKey + ":" + id），返回 id 列表。
func listIDsByIndexDesc(db *DB, indexPrefix string) ([]string, error) {
	lower := []byte(indexPrefix)
	upper := prefixEnd(indexPrefix)
	iter, err := db.NewIter(&pebble.IterOptions{LowerBound: lower, UpperBound: upper})
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var ids []string
	// 从最后一条开始，逆序
	for iter.Last(); iter.Valid(); iter.Prev() {
		key := iter.Key()
		// key = indexPrefix + "updated_at:id"
		s := string(key)
		if !strings.HasPrefix(s, indexPrefix) {
			continue
		}
		rest := s[len(indexPrefix):]
		idx := strings.LastIndex(rest, ":")
		if idx < 0 {
			continue
		}
		id := rest[idx+1:]
		ids = append(ids, id)
	}
	return ids, iter.Error()
}

// getByID 根据 entity 前缀和 id 读取 value，caller 负责 JSON Unmarshal。
func getByID(db *DB, entityPrefix, id string) ([]byte, error) {
	v, closer, err := db.Get([]byte(entityPrefix + id))
	if err != nil {
		return nil, err
	}
	b := make([]byte, len(v))
	copy(b, v)
	closer.Close()
	return b, nil
}
