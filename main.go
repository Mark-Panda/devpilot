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
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed all:initSkills
var initSkillsFS embed.FS

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}
	dataDir := filepath.Join(home, ".devpilot")
	runtime, err := backend.InitRuntime(dataDir, initSkillsFS)
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
		Mac: &mac.Options{
			// 允许使用窗口左上角绿色按钮进入原生全屏
			DisableZoom: false,
		},
		Bind: []interface{}{
			app,
			runtime.RouteRewriteService(),
			runtime.ModelManagementService(),
			runtime.RuleGoService(),
			runtime.SkillRepoService(),
			runtime.CurlCompareService(),
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
