package main

import (
	"embed"
	"log"
	"path/filepath"

	"devpilot/backend"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	runtime, err := backend.InitRuntime(filepath.Join("build", "devpilot.db"))
	if err != nil {
		log.Fatal(err)
	}

	app := NewApp(runtime)
	err = wails.Run(&options.App{
		Title:  "DevPilot",
		Width:  1200,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
			runtime.RouteRewriteService(),
			runtime.ModelManagementService(),
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
