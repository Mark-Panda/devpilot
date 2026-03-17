package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"devpilot/backend"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}
	dataDir := filepath.Join(home, ".devpilot")
	runtime, err := backend.InitRuntime(dataDir)
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
			runtime.RuleGoService(),
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
