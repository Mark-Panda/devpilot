# DevPilot Desktop

## 概览

Wails + Go 后端 + React 前端。项目架构参考根目录的 devpilot-architecture.md。

## 常用命令

- 开发：`make dev`
- 构建：`make build`
- 测试：`make test`
- Lint：`make lint`

## 目录结构

- `/frontend`：React 18 + Vite UI
- `/backend`：Go 服务、Gin Server、存储层
- `/docs`：架构与 API 文档

## 开发规范

- 遵循架构文档中约定的模块划分与文件命名。
- Go 结构体添加 `json` tag；前端接口字段使用 snake_case。
- IPC 走 Wails，HTTP 走内置 Gin Server。
- 避免未被需求驱动的抽象与“顺手重构”。
