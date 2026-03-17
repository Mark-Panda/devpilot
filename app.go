package main

import (
	"context"

	"devpilot/backend"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx     context.Context
	runtime *backend.Runtime
}

func NewApp(runtime *backend.Runtime) *App {
	return &App{runtime: runtime}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// OpenSkillZipDialog 打开系统文件选择对话框，让用户选择技能包 zip 文件。返回选中文件路径，取消时返回空字符串。
func (a *App) OpenSkillZipDialog() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择技能包 zip 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "ZIP 文件", Pattern: "*.zip"},
			{DisplayName: "所有文件", Pattern: "*"},
		},
	})
}

func (a *App) shutdown(ctx context.Context) {
	if a.runtime != nil {
		_ = a.runtime.Close()
	}
}
