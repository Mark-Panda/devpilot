# 修复 Wails 绑定问题

## 问题描述

前端界面显示错误:
```
undefined is not an object (evaluating 'runtime.AgentService')
```

## 根本原因

Agent 服务的方法没有正确暴露给 Wails 前端。Wails 只能绑定在主 `App` 结构体中**直接定义**的公开方法,而不能绑定 `backend/internal` 包中的方法。

## 解决方案

### 1. 创建公开的类型和 Wrapper (`backend/agent_wrapper.go`)

因为 Wails 无法访问 `internal` 包,我们创建了:
- 公开的类型别名 (AgentConfig, AgentInfo 等)
- `AgentServiceWrapper` 结构体,包装 `agent.Service` 的所有方法

### 2. 在 Runtime 中集成 Wrapper (`backend/runtime.go`)

```go
type Runtime struct {
    // ...
    agentService  *agent.Service
    agentWrapper  *AgentServiceWrapper  // 新增
    // ...
}
```

### 3. 在 App 中暴露方法 (`app.go`)

在主 `App` 结构体中添加所有 Agent 相关的方法:
```go
func (a *App) CreateAgent(config backend.AgentConfig) (backend.AgentInfo, error) {
    return a.runtime.AgentWrapper().CreateAgent(a.ctx, config)
}
// ... 其他 13 个方法
```

### 4. 更新前端 API 绑定 (`frontend/src/modules/agent/api.ts`)

```typescript
export const agentApi = {
  createAgent: async (config: AgentConfig): Promise<AgentInfo> => {
    return await window.go.main.App.CreateAgent(config)
  },
  // ...
}
```

## 验证

运行 `make dev` 后,Wails 自动生成的绑定文件 (`frontend/wailsjs/go/main/App.js`) 现在包含所有 Agent 方法:

```javascript
export function CreateAgent(arg1) { ... }
export function GetAgent(arg1) { ... }
export function ListAgents() { ... }
// ... 等
```

## 关键学习点

1. **Wails 绑定规则**: 只能绑定主 App 结构体中的公开方法
2. **Internal 包限制**: Go 的 `internal` 包无法在外部访问
3. **Wrapper 模式**: 通过创建公开的 wrapper 类型来桥接 internal 和 public API
4. **自动生成**: Wails 会自动检测 App 的方法并生成 TypeScript 绑定

## 文件变更

- `backend/agent_wrapper.go` (新增)
- `backend/runtime.go` (修改)
- `app.go` (修改)
- `frontend/src/modules/agent/api.ts` (修改)
