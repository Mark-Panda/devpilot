# DevPilot Desktop

基于 **Wails** 的桌面应用：**Go** 后端 + **React 18（Vite）** 前端。业务数据默认落在用户目录下的 `~/.devpilot`。

## 环境要求

- **Go**：与根目录 `go.mod` 一致，当前为 **Go 1.26**（`toolchain go1.26.1`）。在仓库根目录执行 `go build` / `go test` 时，Go 会按 `toolchain` 行自动选用匹配版本；若 IDE 仍报标准库缺失，请将解释器指向 **Go 1.26.1+** 或与 `go.mod` 中 `toolchain` 一致。
- Node.js（用于前端依赖与构建；以项目 `frontend/package.json` 为准）

## Make 目标

在项目根目录执行；不确定时可用 **`make help`** 查看与 Makefile 同步的简要说明。

| 命令 | 说明 |
|------|------|
| `make help` | 打印所有 `make` 目标及一行说明 |
| `make dev` | 启动 `wails dev`，桌面端开发调试（热重载等由 Wails 负责） |
| `make build` | 先执行 `build-appicon`，再 `wails build`，产出当前平台安装包/可执行文件 |
| `make build-appicon` | 从 Logo 生成 `build/appicon.png`、`build/icons/*.png`、`build/AppIcon.icns`（需 `iconutil` 时生成 icns） |
| `make build-all` | `wails build` 多平台：`darwin/amd64`、`darwin/arm64`、`windows/amd64`、`linux/amd64` |
| `make clean` | 删除 `build/bin` 与 `frontend/dist`（Dock 仍显示旧图标时可按终端提示 `killall Dock`） |
| `make generate` | `wails generate module`，在修改绑定等后重新生成前端/Go 胶水代码 |
| `make lint` | Go：`golangci-lint run ./...`；前端：`cd frontend && npm run lint` |
| `make test` | Go：`go test ./... -v -race -cover`；前端：`npm test -- --passWithNoTests` |
| `make docs` | `swag init -g main.go -o docs/swagger`，生成/更新 Swagger 文档（需已安装 `swag`） |
| `make deps` | `go mod tidy`、`go mod verify`；前端 `npm audit` |
| `make rulego-rules` | `go run ./backend/cmd/list-rulego-nodes`，生成 `.cursor/rules/rulego-backend-nodes.mdc` |

## 仓库结构

| 目录 | 说明 |
|------|------|
| `frontend/` | React UI、规则链 Blockly 编辑器等 |
| `backend/` | Go 服务、Wails 绑定、RuleGo 引擎与自定义节点 |
| `docs/` | 架构、使用说明与菜单索引 |
| `initSkills/` | 内置技能资源（启动时可同步到本地技能目录） |

更完整的模块划分见 [docs/architecture.md](docs/architecture.md) 与 **CLAUDE.md**（贡献者约定）。

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/app-navigation-menu.md](docs/app-navigation-menu.md) | 侧栏各菜单功能与使用说明 |
| [docs/rulego-service-operation.md](docs/rulego-service-operation.md) | RuleGo 服务：存储、执行、日志、模型覆盖等 |
| [docs/rulego-nodes-reference.md](docs/rulego-nodes-reference.md) | 已注册节点类型与 DevPilot 自定义节点要点 |
| [examples/rulego/README.md](examples/rulego/README.md) | 规则链 DSL 样例与说明 |

## 开发提示

- **IPC**：前端与 Go 通过 Wails 绑定通信；通过 `main.Bind` 暴露的服务方法请勿将 `context.Context` 作为第一个参数（见 CLAUDE.md）。
- **RuleGo**：可视化块与后端 `node.type` 需一致；约定见 `.cursor/rules/rulego-blocks.mdc`。
