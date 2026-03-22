/*
 * Copyright 2025 The RuleGo Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// 自 rulego-components external/file/file_node.go 迁入，注册 x/fileRead、x/fileWrite、x/fileDelete、x/fileList。
package rulego

import (
	"encoding/base64"
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
	rulegofs "github.com/rulego/rulego/utils/fs"
	"github.com/rulego/rulego/utils/maps"
	"github.com/rulego/rulego/utils/str"
)

const (
	KeyFilePathWhitelist = "filePathWhitelist"
	KeyDeletedCount      = "deletedCount"
	ValueOne             = "1"
	KeyWorkDir           = "workDir"

	DataTypeText   = "text"
	DataTypeBase64 = "base64"
)

var (
	ErrPathNotAllowed = errors.New("path not allowed error")
	ErrPathEmpty      = errors.New("path is empty")
)

const (
	defaultPath     = "/tmp/data.txt"
	defaultGlobPath = "/tmp/*.txt"
	globChars       = "*?[]"
)

func init() {
	for _, n := range []types.Node{
		&FileReadNode{},
		&FileWriteNode{},
		&FileDeleteNode{},
		&FileListNode{},
	} {
		if err := rulego.Registry.Register(n); err != nil {
			log.Printf("[rulego] 文件节点注册失败 type=%s: %v", n.Type(), err)
		} else {
			log.Printf("[rulego] 自定义节点已注册: type=%s", n.Type())
		}
	}
}

func checkPath(ctx types.RuleContext, path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	var workDir string
	if ctx.GetContext() != nil {
		if v := ctx.GetContext().Value(KeyWorkDir); v != nil {
			workDir = str.ToString(v)
		}
	}
	if workDir != "" {
		absWorkDir, err := filepath.Abs(workDir)
		if err != nil {
			return err
		}
		cleanWorkDir := filepath.Clean(absWorkDir)
		cleanPath := filepath.Clean(absPath)
		if cleanPath != cleanWorkDir && !strings.HasPrefix(cleanPath, cleanWorkDir+string(filepath.Separator)) {
			return ErrPathNotAllowed
		}
	}

	properties := ctx.Config().Properties
	if properties == nil {
		return nil
	}
	whitelistStr := properties.GetValue(KeyFilePathWhitelist)
	if whitelistStr == "" {
		return nil
	}

	whitelists := strings.Split(whitelistStr, ",")
	for _, whitelist := range whitelists {
		whitelist = strings.TrimSpace(whitelist)
		if whitelist == "" {
			continue
		}

		if strings.ContainsAny(whitelist, globChars) {
			absWhitelistPattern, err := filepath.Abs(whitelist)
			if err != nil {
				absWhitelistPattern = whitelist
			}

			currentPath := absPath
			for {
				matched, err := filepath.Match(absWhitelistPattern, currentPath)
				if err == nil && matched {
					return nil
				}

				parent := filepath.Dir(currentPath)
				if parent == currentPath || parent == "." || (len(parent) > 0 && parent[len(parent)-1] == filepath.Separator) {
					break
				}
				if len(parent) <= 1 && os.IsPathSeparator(parent[0]) {
					break
				}
				currentPath = parent
			}
		} else {
			absWhitelist, err := filepath.Abs(whitelist)
			if err != nil {
				continue
			}
			if strings.HasPrefix(absPath, absWhitelist) {
				return nil
			}
		}
	}
	return ErrPathNotAllowed
}

func getAbsPath(ctx types.RuleContext, path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	var workDir string
	if ctx.GetContext() != nil {
		if v := ctx.GetContext().Value(KeyWorkDir); v != nil {
			workDir = str.ToString(v)
		}
	}
	if workDir != "" {
		return filepath.Join(workDir, path)
	}
	return path
}

func resolvePath(ctx types.RuleContext, msg types.RuleMsg, pathTemplate el.Template) (string, map[string]interface{}, error) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	path := pathTemplate.ExecuteAsString(env)
	if path == "" {
		return "", env, ErrPathEmpty
	}
	return getAbsPath(ctx, path), env, nil
}

type FileReadNodeConfiguration struct {
	Path      string `json:"path"`
	DataType  string `json:"dataType"`
	Recursive bool   `json:"recursive"`
}

type FileReadNode struct {
	Config       FileReadNodeConfiguration
	pathTemplate el.Template
}

func (x *FileReadNode) Type() string {
	return "x/fileRead"
}

func (x *FileReadNode) New() types.Node {
	return &FileReadNode{Config: FileReadNodeConfiguration{
		Path:      defaultPath,
		DataType:  DataTypeText,
		Recursive: false,
	}}
}

func (x *FileReadNode) Init(ruleConfig types.Config, configuration types.Configuration) error {
	err := maps.Map2Struct(configuration, &x.Config)
	if err != nil {
		return err
	}
	x.pathTemplate, err = el.NewTemplate(x.Config.Path)
	return err
}

func (x *FileReadNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	path, _, err := resolvePath(ctx, msg, x.pathTemplate)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	dir := filepath.Dir(path)
	if err := checkPath(ctx, dir); err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	if strings.ContainsAny(path, globChars) {
		var paths []string
		var err error
		if x.Config.Recursive {
			paths, err = rulegofs.GetFilePaths(path)
		} else {
			paths, err = filepath.Glob(path)
		}
		if err != nil {
			ctx.TellFailure(msg, err)
			return
		}

		var b strings.Builder
		count := 0
		for _, p := range paths {
			data, err := os.ReadFile(p)
			if err != nil {
				continue
			}

			if count > 0 {
				b.WriteString("\n")
			}
			if x.Config.DataType == DataTypeBase64 {
				b.WriteString(base64.StdEncoding.EncodeToString(data))
			} else {
				b.Write(data)
			}
			count++
		}

		msg.SetData(b.String())
		ctx.TellSuccess(msg)

	} else {
		if err := checkPath(ctx, path); err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		data, err := os.ReadFile(path)
		if err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		if x.Config.DataType == DataTypeBase64 {
			msg.SetData(base64.StdEncoding.EncodeToString(data))
		} else {
			msg.SetBytes(data)
		}
		ctx.TellSuccess(msg)
	}
}

func (x *FileReadNode) Destroy() {}

type FileWriteNodeConfiguration struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Append  bool   `json:"append"`
}

type FileWriteNode struct {
	Config            FileWriteNodeConfiguration
	pathTemplate      el.Template
	contentTemplate   el.Template
}

func (x *FileWriteNode) Type() string {
	return "x/fileWrite"
}

func (x *FileWriteNode) New() types.Node {
	return &FileWriteNode{Config: FileWriteNodeConfiguration{
		Path:    defaultPath,
		Content: "${data}",
		Append:  false,
	}}
}

func (x *FileWriteNode) Init(ruleConfig types.Config, configuration types.Configuration) error {
	err := maps.Map2Struct(configuration, &x.Config)
	if err != nil {
		return err
	}
	if strings.TrimSpace(x.Config.Path) == "" {
		return errors.New("path is empty")
	}
	x.pathTemplate, err = el.NewTemplate(x.Config.Path)
	if err != nil {
		return err
	}
	if strings.TrimSpace(x.Config.Content) != "" {
		x.contentTemplate, err = el.NewTemplate(x.Config.Content)
	}

	return err
}

func (x *FileWriteNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	path, env, err := resolvePath(ctx, msg, x.pathTemplate)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	if err := checkPath(ctx, path); err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	var content interface{}
	if x.contentTemplate == nil {
		content = msg.GetData()
	} else {
		content, err = x.contentTemplate.Execute(env)
		if err != nil {
			ctx.TellFailure(msg, err)
			return
		}
	}

	var data []byte
	if strContent, ok := content.(string); ok {
		data = []byte(strContent)
	} else if byteContent, ok := content.([]byte); ok {
		data = byteContent
	} else {
		data = []byte(str.ToString(content))
	}

	if x.Config.Append {
		f, ferr := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if ferr != nil {
			err = ferr
		} else {
			_, err = f.Write(data)
			_ = f.Close()
		}
	} else {
		err = rulegofs.SaveFile(path, data)
	}
	if err != nil {
		ctx.TellFailure(msg, err)
	} else {
		ctx.TellSuccess(msg)
	}
}

func (x *FileWriteNode) Destroy() {}

type FileDeleteNodeConfiguration struct {
	Path string `json:"path"`
}

type FileDeleteNode struct {
	Config       FileDeleteNodeConfiguration
	pathTemplate el.Template
}

func (x *FileDeleteNode) Type() string {
	return "x/fileDelete"
}

func (x *FileDeleteNode) New() types.Node {
	return &FileDeleteNode{Config: FileDeleteNodeConfiguration{
		Path: defaultPath,
	}}
}

func (x *FileDeleteNode) Init(ruleConfig types.Config, configuration types.Configuration) error {
	err := maps.Map2Struct(configuration, &x.Config)
	if err != nil {
		return err
	}
	x.pathTemplate, err = el.NewTemplate(x.Config.Path)
	return err
}

func (x *FileDeleteNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	path, _, err := resolvePath(ctx, msg, x.pathTemplate)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	dir := filepath.Dir(path)
	if err := checkPath(ctx, dir); err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	if strings.ContainsAny(path, globChars) {
		paths, err := rulegofs.GetFilePaths(path)
		if err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		var deletedCount int
		var lastErr error
		for _, p := range paths {
			if err := os.Remove(p); err != nil {
				lastErr = err
			} else {
				deletedCount++
			}
		}
		if lastErr != nil && deletedCount == 0 {
			ctx.TellFailure(msg, lastErr)
		} else {
			msg.Metadata.PutValue(KeyDeletedCount, str.ToString(deletedCount))
			ctx.TellSuccess(msg)
		}
	} else {
		if err := checkPath(ctx, path); err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		if err := os.Remove(path); err != nil {
			ctx.TellFailure(msg, err)
		} else {
			msg.Metadata.PutValue(KeyDeletedCount, ValueOne)
			ctx.TellSuccess(msg)
		}
	}
}

func (x *FileDeleteNode) Destroy() {}

type FileListNodeConfiguration struct {
	Path      string `json:"path"`
	Recursive bool   `json:"recursive"`
}

type FileListNode struct {
	Config       FileListNodeConfiguration
	pathTemplate el.Template
}

func (x *FileListNode) Type() string {
	return "x/fileList"
}

func (x *FileListNode) New() types.Node {
	return &FileListNode{Config: FileListNodeConfiguration{
		Path:      defaultGlobPath,
		Recursive: false,
	}}
}

func (x *FileListNode) Init(ruleConfig types.Config, configuration types.Configuration) error {
	err := maps.Map2Struct(configuration, &x.Config)
	if err != nil {
		return err
	}
	x.pathTemplate, err = el.NewTemplate(x.Config.Path)
	return err
}

func (x *FileListNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	path, _, err := resolvePath(ctx, msg, x.pathTemplate)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	dir := filepath.Dir(path)
	if err := checkPath(ctx, dir); err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	var paths []string
	if x.Config.Recursive {
		paths, err = rulegofs.GetFilePaths(path)
	} else {
		paths, err = filepath.Glob(path)
	}

	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	var result []interface{}
	for _, p := range paths {
		result = append(result, p)
	}

	msg.SetData(str.ToString(result))
	ctx.TellSuccess(msg)
}

func (x *FileListNode) Destroy() {}
