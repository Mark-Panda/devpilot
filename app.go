package main

import (
	"context"

	"devpilot/backend"
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

func (a *App) shutdown(ctx context.Context) {
	if a.runtime != nil {
		_ = a.runtime.Close()
	}
}
