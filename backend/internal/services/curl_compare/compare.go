package curl_compare

import (
	"encoding/json"
	"fmt"
	"reflect"
)

// DiffKind 差异类型
type DiffKind string

const (
	DiffMissing  DiffKind = "missing"  // 目标中缺少该 key
	DiffDifferent DiffKind = "different" // 值不一致
	DiffTypeDiff DiffKind = "type_diff" // 类型不同
)

// JSONDiffItem 单条差异
type JSONDiffItem struct {
	Path       string `json:"path"`        // 如 "data.user.name"
	Kind       string `json:"kind"`       // missing / different / type_diff
	SourceVal  string `json:"source_val"`  // 来源侧值（可读摘要）
	TargetVal  string `json:"target_val"`  // 目标侧值（可读摘要，missing 时为空）
	SourceJSON string `json:"source_json"` // 来源侧 JSON 片段（可选，便于复制）
	TargetJSON string `json:"target_json"` // 目标侧 JSON 片段（可选）
}

// CompareJSON 以来源 JSON 为基准，逐 key 对比目标 JSON，返回差异列表。
// 只关心「来源里有的路径」在目标中是否存在且一致；目标多出来的 key 不报差异。
func CompareJSON(sourceBody, targetBody []byte) ([]JSONDiffItem, error) {
	var source, target interface{}
	if err := json.Unmarshal(sourceBody, &source); err != nil {
		return nil, ErrNotJSON
	}
	if err := json.Unmarshal(targetBody, &target); err != nil {
		return nil, ErrNotJSON
	}
	var out []JSONDiffItem
	walkAndCompare("", source, target, &out)
	return out, nil
}

func walkAndCompare(path string, source, target interface{}, out *[]JSONDiffItem) {
	if source == nil && target == nil {
		return
	}
	if source == nil {
		// 来源为 null，目标有值 -> 算 different
		*out = append(*out, JSONDiffItem{
			Path:      path,
			Kind:      "different",
			SourceVal: "null",
			TargetVal: valueSummary(target),
		})
		return
	}
	if target == nil {
		*out = append(*out, JSONDiffItem{
			Path:      path,
			Kind:      "different",
			SourceVal: valueSummary(source),
			TargetVal: "null",
		})
		return
	}

	// 来源为 object，递归对比每个 key
	if srcMap, ok := source.(map[string]interface{}); ok {
		tgtMap, _ := target.(map[string]interface{})
		for k, sv := range srcMap {
			p := k
			if path != "" {
				p = path + "." + k
			}
			tv, exists := tgtMap[k]
			if !exists {
				*out = append(*out, JSONDiffItem{
					Path:       p,
					Kind:       "missing",
					SourceVal:  valueSummary(sv),
					TargetVal:  "",
					SourceJSON: toJSONShort(sv),
				})
				continue
			}
			// 两边都有，继续递归或比较标量
			walkAndCompare(p, sv, tv, out)
		}
		return
	}

	// 来源为 array：按索引对比
	if srcSlice, ok := source.([]interface{}); ok {
		tgtSlice, _ := target.([]interface{})
		for i, sv := range srcSlice {
			p := fmt.Sprintf("%s[%d]", path, i)
			if i >= len(tgtSlice) {
				*out = append(*out, JSONDiffItem{
					Path:       p,
					Kind:       "missing",
					SourceVal:  valueSummary(sv),
					TargetVal:  "",
					SourceJSON: toJSONShort(sv),
				})
				continue
			}
			walkAndCompare(p, sv, tgtSlice[i], out)
		}
		return
	}

	// 标量或其它：直接比较
	if !reflect.DeepEqual(source, target) {
		skind := reflect.TypeOf(source).Kind()
		tkind := reflect.TypeOf(target).Kind()
		kind := "different"
		if skind != tkind {
			kind = "type_diff"
		}
		*out = append(*out, JSONDiffItem{
			Path:       path,
			Kind:       kind,
			SourceVal:  valueSummary(source),
			TargetVal:  valueSummary(target),
			SourceJSON: toJSONShort(source),
			TargetJSON: toJSONShort(target),
		})
	}
}

func valueSummary(v interface{}) string {
	if v == nil {
		return "null"
	}
	switch x := v.(type) {
	case string:
		if len(x) > 80 {
			return x[:77] + "..."
		}
		return x
	case float64:
		return fmt.Sprintf("%v", x)
	case bool:
		return fmt.Sprintf("%t", x)
	case map[string]interface{}:
		return fmt.Sprintf("{object with %d keys}", len(x))
	case []interface{}:
		return fmt.Sprintf("[array length %d]", len(x))
	default:
		return fmt.Sprintf("%v", v)
	}
}

func toJSONShort(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	s := string(b)
	if len(s) > 500 {
		return s[:497] + "..."
	}
	return s
}
