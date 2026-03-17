.PHONY: dev build clean lint test build-all generate docs deps rulego-rules

dev:
	wails dev

build: build-appicon
	wails build

# 将 Logo 复制为 Wails 应用图标（build/appicon.png），供 wails build 生成各平台图标
build-appicon:
	@mkdir -p build
	@cp frontend/public/devpilot-logo.png build/appicon.png

build-all:
	wails build -platform darwin/amd64,darwin/arm64,windows/amd64,linux/amd64

clean:
	rm -rf build/bin frontend/dist

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
