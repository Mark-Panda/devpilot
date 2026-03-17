.PHONY: dev build clean lint test build-all generate docs deps rulego-rules

# 开发前先生成图标并清理旧 .app，确保 Dock 显示正确图标
dev: build-appicon
	@rm -rf build/bin
	wails dev

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
