// 列出 RuleGo 引擎已注册节点并写入 .cursor/rules/rulego-backend-nodes.mdc，供 Cursor/Claude 使用。
// 运行：go run ./backend/cmd/list-rulego-nodes（需在项目根目录执行，或通过 make rulego-rules）
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"devpilot/backend/internal/services/rulego"
)

func main() {
	// import rulego 包时其 init() 已注册自定义节点，此处直接取列表
	types := rulego.GetRegisteredNodeTypes()

	// 约定：从项目根目录查找 .cursor/rules
	outputDir := ".cursor/rules"
	if len(os.Args) > 1 {
		outputDir = os.Args[1]
	}
	absDir, err := filepath.Abs(outputDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "path: %v\n", err)
		os.Exit(1)
	}
	if err := os.MkdirAll(absDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "mkdir: %v\n", err)
		os.Exit(1)
	}
	outPath := filepath.Join(absDir, "rulego-backend-nodes.mdc")

	body := `---
description: RuleGo 后端已注册节点类型（与引擎一致，供 Cursor/Claude 参考）
globs: backend/internal/services/rulego/**/*,frontend/src/modules/rulego/**/*
alwaysApply: false
---

# RuleGo 后端已注册节点

以下 ` + "`node.type`" + ` 已在后端 RuleGo 引擎中注册，规则链 DSL 中可使用。前端块 ` + "`nodeType`" + ` 需与其中一项一致。

`
	for _, t := range types {
		body += "- " + t + "\n"
	}
	body += "\n自定义节点实现见 `backend/internal/services/rulego/node_*.go`，通过 `rulego.Registry.Register` 在 init 中注册。\n"

	if err := os.WriteFile(outPath, []byte(body), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "write: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("[rulego] 已写入 %d 个节点类型到 %s\n", len(types), outPath)
}
