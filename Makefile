.PHONY: dev build build-appicon clean lint test build-all generate docs deps rulego-rules help

# 打印可用目标（与 README「Make 目标」一致时可对照维护）
help:
	@echo "DevPilot Makefile 目标："
	@echo "  make dev            - 启动 wails dev（桌面开发调试）"
	@echo "  make build          - 生成应用图标后 wails build（当前平台产物）"
	@echo "  make build-appicon  - 从 Logo 生成 build/appicon.png、build/icons、AppIcon.icns"
	@echo "  make build-all      - 多平台 wails build（darwin/amd64+arm64、windows、linux）"
	@echo "  make clean          - 删除 build/bin 与 frontend/dist"
	@echo "  make generate       - wails generate module（更新绑定等）"
	@echo "  make lint           - golangci-lint + 前端 eslint"
	@echo "  make test           - go test -race -cover + 前端 npm test"
	@echo "  make docs           - swag init，生成 docs/swagger"
	@echo "  make deps           - go mod tidy/verify + 前端 npm audit"
	@echo "  make rulego-rules   - 生成 .cursor/rules/rulego-backend-nodes.mdc"

# 开发前先生成图标并清理旧 .app，确保 Dock 显示正确图标
dev:
	wails dev
# dev: build-appicon
# 	@rm -rf build/bin
# 	wails dev

build: build-appicon
	wails build

# 从 Logo 生成各尺寸图标：build/appicon.png（1024）、build/icons/*.png、build/AppIcon.icns（若 iconutil 可用）
build-appicon:
	@./build/generate-icons.sh

build-all:
	wails build -platform darwin/amd64,darwin/arm64,windows/amd64,linux/amd64

clean:
	rm -rf build/bin frontend/dist
	@echo "Tip: 若 Dock 仍显示旧图标，可退出应用后执行: killall Dock"

generate:
	wails generate module

lint:
	golangci-lint run ./...
	cd frontend && npm run lint

test:
	go test ./... -v -race -cover
	cd frontend && npm test -- --passWithNoTests

docs:
	swag init -g main.go -o docs/swagger

deps:
	go mod tidy
	go mod verify
	cd frontend && npm audit

# 根据后端已注册的 RuleGo 节点生成 .cursor/rules/rulego-backend-nodes.mdc（供 Cursor/Claude 使用）
rulego-rules:
	go run ./backend/cmd/list-rulego-nodes
