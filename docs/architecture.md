# DevPilot Desktop — 架构设计文档

> **技术栈**: Wails v2.11.0 + React 18 + Go 1.23 + Gin 1.10 + TypeScript  
> **产品定位**: 桌面级后端开发辅助工具（API 调试、代码生成、数据库管理、终端集成、Mock 服务）  
> **版本**: v1.0.0  
> **日期**: 2026-03-13  
> **作者**: 阿飞 🏗️

---

## 1. 架构总览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DevPilot Desktop                                │
│                                                                          │
│  ┌─────────────────────────── Frontend ────────────────────────────────┐ │
│  │  React 18 + TypeScript + Zustand + React Router v6                  │ │
│  │  ┌──────────┬──────────┬──────────┬──────────┬──────────────┐      │ │
│  │  │ API      │ CodeGen  │ Database │ Terminal │ Mock Server  │      │ │
│  │  │ Tester   │ Studio   │ Manager  │ Console  │ Manager      │      │ │
│  │  └──────────┴──────────┴──────────┴──────────┴──────────────┘      │ │
│  │  UI Layer: TailwindCSS + Radix UI + Monaco Editor                    │ │
│  └──────────────────────┬──────────────────────────────┬──────────────┘ │
│                          │ Wails Bindings (IPC)        │ HTTP (fetch)   │
│                          │ 桌面级方法调用 + 事件流       │ Mock API 调用  │
│  ┌──────────────────────▼──────────────────────────────▼──────────────┐ │
│  │                       Wails Runtime                                 │ │
│  │  ┌──────────┬────────────┬──────────────────────┬──────────────┐   │ │
│  │  │  Events  │  Methods   │  System Access       │  Gin Server  │   │ │
│  │  │  System  │  Bridge    │  (FS, Dialog, Menu)  │  (embedded)  │   │ │
│  │  └──────────┴────────────┴──────────────────────┴──────────────┘   │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                  │                                      │
│  ┌──────────────────────────────▼─────────────────────────────────────┐ │
│  │                        Go Backend                                   │ │
│  │  ┌──────────┬────────────┬──────────┬─────────────┬────────────┐  │ │
│  │  │  Core    │  Services  │  Store    │  Gin HTTP  │ Integrations│  │ │
│  │  │  Engine  │  Layer     │  Layer    │  Layer      │ Layer      │  │ │
│  │  └──────────┴────────────┴──────────┴─────────────┴────────────┘  │ │
│  │  ┌────────────────────────────────────────────────────────────┐    │ │
│  │  │              Plugin System (Extensible)                      │    │ │
│  │  └────────────────────────────────────────────────────────────┘    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

                          ┌──────────────────┐
                          │  外部客户端访问   │
                          │  (Postman/curl/  │
                          │   其他开发工具)   │
                          └────────┬─────────┘
                                   │ http://127.0.0.1:port
                                   ▼
                          ┌──────────────────┐
                          │   Gin Router     │
                          │   (嵌入式 HTTP)   │
                          └──────────────────┘
```

### 1.2 技术选型决策表

| 领域 | 选型 | 版本 | 选型理由 |
|------|------|------|----------|
| 桌面框架 | Wails | v2.11.0 | 稳定版，Go 原生，包体小（~5MB），Webview2/WKWebView |
| Web 框架 | Gin | 1.10.x | 高性能 HTTP 框架，嵌入式 Mock 服务 / 本地 API 代理 / 插件扩展 |
| 前端框架 | React | 18.x | 生态丰富，团队熟悉度高 |
| 状态管理 | Zustand | 5.x | 轻量、TypeScript 友好、无 boilerplate |
| 样式方案 | TailwindCSS | 3.x | 原子化 CSS，开发效率高，配合 Radix UI |
| 代码编辑器 | Monaco Editor | 0.50.x | VS Code 同款引擎，语言服务完整 |
| 数据库驱动 | sqlc + database/sql | - | 类型安全 SQL，编译期检查 |
| 配置管理 | Viper | 1.x | 多格式支持，环境变量绑定 |
| 日志 | zerolog | 1.x | 结构化日志，零分配 |
| HTTP 客户端 | Resty (go-resty/resty/v2) | v2.16.x | 简洁 API、自动重试、请求/响应拦截器、中间件链 |
| CLI 终端 | pty (creack) | - | 伪终端，支持交互式命令 |
| 中间件 | Gin Middleware + 自定义 | - | CORS、日志、限流、认证 |

### 1.3 Gin 在架构中的角色

```
┌─────────────────────────────────────────────────────────┐
│                    Gin HTTP Server (嵌入式)                │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  角色 1: Mock Server                             │    │
│  │  前端定义 API 响应规则 → Gin 动态返回 Mock 数据    │    │
│  │  支持路径匹配、延迟模拟、状态码自定义              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  角色 2: 本地 API 代理                           │    │
│  │  解决跨域、CORS 预检、请求转发问题                 │    │
│  │  支持请求/响应拦截、Header 注入                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  角色 3: RESTful 管理 API                        │    │
│  │  外部工具（Postman/curl/脚本）通过 HTTP 管理      │    │
│  │  代码片段 CRUD、环境变量、Mock 规则导入导出       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  角色 4: 插件扩展点                              │    │
│  │  插件通过 Gin 路由组注册自定义 API 端点           │    │
│  │  插件间通信、Webhook 回调                        │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 项目结构

```
devpilot/
├── main.go                          # Wails 入口
├── app.go                           # 应用主结构体 + 生命周期
├── wails.json                       # Wails 配置
│
├── frontend/                        # ── 前端 ──
│   ├── src/
│   │   ├── main.tsx                 # React 入口
│   │   ├── App.tsx                  # 根组件 + Router
│   │   │
│   │   ├── wails/                   # Wails 绑定层（自动生成 + 手动扩展）
│   │   │   ├── index.ts             # Go → JS 绑定导出
│   │   │   └── events.ts            # 事件订阅封装
│   │   │
│   │   ├── modules/                 # 业务模块（按功能域划分）
│   │   │   ├── api-tester/          # API 调试模块
│   │   │   │   ├── pages/           # 页面组件
│   │   │   │   ├── components/      # 模块内组件
│   │   │   │   ├── hooks/           # 模块内 hooks
│   │   │   │   ├── store.ts         # Zustand store
│   │   │   │   ├── types.ts         # 模块类型定义
│   │   │   │   └── index.ts         # 模块导出
│   │   │   │
│   │   │   ├── codegen/             # 代码生成模块
│   │   │   │   └── ...              # 同上结构
│   │   │   ├── database/            # 数据库管理模块
│   │   │   │   └── ...
│   │   │   ├── terminal/            # 终端模块
│   │   │   │   └── ...
│   │   │   └── mock-server/         # Mock 服务管理模块（新增）
│   │   │       ├── pages/
│   │   │       │   ├── MockServerPage.tsx
│   │   │       │   └── MockRuleEditor.tsx
│   │   │       ├── components/
│   │   │       │   ├── MockRuleList.tsx
│   │   │       │   ├── MockRuleCard.tsx
│   │   │       │   └── ServerStatusBar.tsx
│   │   │       ├── hooks/
│   │   │       │   ├── useMockServer.ts
│   │   │       │   └── useMockRules.ts
│   │   │       ├── store.ts
│   │   │       ├── types.ts
│   │   │       └── index.ts
│   │   │
│   │   ├── shared/                  # 跨模块共享
│   │   │   ├── components/          # 通用组件
│   │   │   │   ├── Layout/          # 布局组件
│   │   │   │   ├── CodeEditor/      # Monaco 封装
│   │   │   │   ├── JsonTree/        # JSON 树形视图
│   │   │   │   ├── DataTable/       # 数据表格
│   │   │   │   ├── MethodBadge/     # HTTP 方法标签
│   │   │   │   └── index.ts
│   │   │   ├── hooks/               # 通用 hooks
│   │   │   │   ├── useWailsCall.ts  # Go 方法调用封装
│   │   │   │   ├── useWailsEvent.ts # 事件监听封装
│   │   │   │   ├── useTheme.ts
│   │   │   │   └── useHttpClient.ts # HTTP 客户端封装（Mock API 调用）
│   │   │   ├── utils/               # 工具函数
│   │   │   │   ├── format.ts
│   │   │   │   └── validator.ts
│   │   │   └── types/               # 全局类型
│   │   │       ├── api.ts
│   │   │       ├── mock.ts          # Mock 相关类型（新增）
│   │   │       └── common.ts
│   │   │
│   │   ├── styles/                  # 全局样式
│   │   │   └── globals.css
│   │   │
│   │   └── assets/                  # 静态资源
│   │
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/                         # ── 后端 ──
│   ├── internal/                    # 内部包（不对外暴露）
│   │   ├── core/                    # 核心引擎
│   │   │   ├── app.go               # 应用核心结构
│   │   │   ├── config.go            # 配置管理
│   │   │   ├── logger.go            # 日志初始化
│   │   │   └── events.go            # 事件总线
│   │   │
│   │   ├── services/                # 业务服务层
│   │   │   ├── api/                 # API 调试服务
│   │   │   │   ├── client.go        # HTTP 客户端
│   │   │   │   ├── methods.go       # Wails 暴露方法
│   │   │   │   └── store.go         # 请求历史持久化
│   │   │   │
│   │   │   ├── codegen/             # 代码生成服务
│   │   │   │   ├── generator.go     # 模板引擎
│   │   │   │   ├── templates/       # 代码模板
│   │   │   │   │   ├── go.tmpl
│   │   │   │   │   ├── sql.tmpl
│   │   │   │   │   ├── http.tmpl
│   │   │   │   │   └── grpc.tmpl
│   │   │   │   └── methods.go
│   │   │   │
│   │   │   ├── database/            # 数据库管理服务
│   │   │   │   ├── connector.go     # 连接池管理
│   │   │   │   ├── executor.go      # SQL 执行器
│   │   │   │   ├── migrations/      # 迁移文件
│   │   │   │   └── methods.go
│   │   │   │
│   │   │   ├── terminal/            # 终端服务
│   │   │   │   ├── pty.go           # 伪终端管理
│   │   │   │   └── methods.go
│   │   │   │
│   │   │   ├── mock/                # Mock 服务（新增）
│   │   │   │   ├── engine.go        # Mock 引擎核心
│   │   │   │   ├── matcher.go       # 路由匹配器
│   │   │   │   ├── handler.go       # Mock 响应处理器
│   │   │   │   ├── store.go         # Mock 规则持久化
│   │   │   │   └── methods.go       # Wails 暴露方法
│   │   │   │
│   │   │   └── snippet/             # 代码片段管理
│   │   │       ├── repository.go
│   │   │       └── methods.go
│   │   │
│   │   ├── server/                  # Gin HTTP 服务器层（新增）
│   │   │   ├── server.go            # Gin Engine 初始化 + 生命周期
│   │   │   ├── router.go            # 路由注册中心
│   │   │   ├── middleware/          # Gin 中间件
│   │   │   │   ├── logger.go        # 请求日志中间件
│   │   │   │   ├── cors.go          # CORS 中间件
│   │   │   │   ├── ratelimit.go     # 限流中间件
│   │   │   │   ├── recovery.go      # 异常恢复中间件
│   │   │   │   └── auth.go          # 可选认证中间件
│   │   │   ├── handler/             # Gin HTTP Handler
│   │   │   │   ├── mock_handler.go  # Mock API Handler
│   │   │   │   ├── snippet_handler.go # 代码片段 REST API
│   │   │   │   ├── health_handler.go  # 健康检查
│   │   │   │   └── proxy_handler.go   # 代理转发 Handler
│   │   │   └── response/            # 统一响应格式
│   │   │       ├── response.go      # 统一响应结构
│   │   │       └── errors.go        # 错误码定义
│   │   │
│   │   ├── store/                   # 数据持久化层
│   │   │   ├── sqlite/              # SQLite 存储
│   │   │   │   ├── db.go            # 数据库初始化
│   │   │   │   ├── migrations.go    # 自动迁移
│   │   │   │   └── models/
│   │   │   │       ├── request.go
│   │   │   │       ├── connection.go
│   │   │   │       ├── snippet.go
│   │   │   │       └── mock_rule.go # Mock 规则模型（新增）
│   │   │   └── repository.go        # Repository 接口
│   │   │
│   │   ├── plugins/                 # 插件系统
│   │   │   ├── loader.go            # 插件加载器
│   │   │   ├── registry.go          # 插件注册表
│   │   │   └── interface.go         # 插件接口定义
│   │   │
│   │   └── models/                  # 领域模型
│   │       ├── api.go
│   │       ├── database.go
│   │       ├── terminal.go
│   │       └── mock.go              # Mock 领域模型（新增）
│   │
│   └── pkg/                         # 可复用工具包
│       ├── httputil/                # HTTP 工具（Resty 辅助函数）
│       ├── strutil/                 # 字符串工具
│       ├── fileutil/                # 文件工具
│       ├── crypto/                  # 加密工具
│       └── ginutil/                 # Gin 工具包（新增）
│           ├── bind.go              # 请求绑定工具
│           └── validator.go         # 参数校验工具
│
├── build/                           # 构建配置
│   ├── windows/
│   ├── darwin/
│   └── linux/
│
├── docs/                            # 文档
│   ├── architecture.md
│   └── api-reference.md
│
├── scripts/                         # 构建脚本
│   ├── build.sh
│   └── dev.sh
│
├── go.mod
├── go.sum
└── Makefile
```

---

## 3. Go 后端架构

### 3.1 分层架构（含 Gin）

```
┌─────────────────────────────────────┐
│  Wails Binding Layer (Methods)      │  ← 桌面前端 IPC 调用
├─────────────────────────────────────┤
│  Gin HTTP Layer (Server)            │  ← 外部 HTTP 调用（Mock/REST API）
├─────────────────────────────────────┤
│  Service Layer                      │  ← 业务逻辑编排
├─────────────────────────────────────┤
│  Store Layer (Repository)           │  ← 数据持久化
├─────────────────────────────────────┤
│  Plugin / Integration Layer         │  ← 外部集成
└─────────────────────────────────────┘
```

**Wails Binding vs Gin HTTP 的分工**：

```
Wails Binding（IPC）              Gin HTTP（REST）
─────────────────────             ─────────────────────
桌面 UI 专用方法                   外部工具可调用
二进制序列化（高效）                JSON 序列化（通用）
支持双向事件流                     标准 HTTP 请求/响应
前端直接调用 Go 方法               通过 http://127.0.0.1:port 访问
适合：终端控制、数据库查询          适合：Mock API、代码片段管理、插件扩展
```

### 3.2 Gin Server 核心实现

```go
// backend/internal/server/server.go
package server

import (
   "context"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

type Server struct {
	engine   *gin.Engine
	httpSrv  *http.Server
	port     int
	ctx      context.Context
}

type Config struct {
	Port         int    // 监听端口，0 表示自动分配
	Mode         string // gin.DebugMode / gin.ReleaseMode
	EnableCors   bool
	EnableAuth   bool
	ReadTimeout  int // 秒
	WriteTimeout int // 秒
}

func NewServer(cfg Config) *Server {
	if cfg.Port == 0 {
		cfg.Port = 0 // 让系统自动分配
	}
	if cfg.Mode == "" {
		cfg.Mode = gin.DebugMode
	}

	gin.SetMode(cfg.Mode)
	engine := gin.New()

	return &Server{
		engine: engine,
		port:   cfg.Port,
	}
}

// SetupRouter 注册所有路由
func (s *Server) SetupRouter(
    mockHandler *handler.MockHandler,
    snippetHandler *handler.SnippetHandler,
    healthHandler *handler.HealthHandler,
    proxyHandler *handler.ProxyHandler,
    pluginRouter *gin.RouterGroup, // 插件路由组（可为 nil）
) {
    // ── 全局中间件 ──
    s.engine.Use(
        middleware.Recovery(),
        middleware.RequestLogger(),
    )

    if true { // 嵌入式服务默认开启 CORS（允许前端访问）
        s.engine.Use(middleware.Cors())
    }

    // ── 健康检查 ──
    s.engine.GET("/health", healthHandler.Check)

    // ── Mock API 路由组 ──
    // 动态路由由 Mock 引擎在运行时注册
    s.engine.Any("/mock/*path", mockHandler.HandleMock)

    // ── 管理 API（版本化） ──
    v1 := s.engine.Group("/api/v1")
    {
        // Mock 规则管理
        mock := v1.Group("/mock")
        {
            mock.GET("/rules", mockHandler.ListRules)
            mock.POST("/rules", mockHandler.CreateRule)
            mock.PUT("/rules/:id", mockHandler.UpdateRule)
            mock.DELETE("/rules/:id", mockHandler.DeleteRule)
            mock.POST("/rules/:id/toggle", mockHandler.ToggleRule)
            mock.POST("/rules/import", mockHandler.ImportRules)
            mock.GET("/rules/export", mockHandler.ExportRules)
            mock.DELETE("/rules/clear", mockHandler.ClearRules)
        }

        // 代码片段管理
        snippets := v1.Group("/snippets")
        {
            snippets.GET("", snippetHandler.List)
            snippets.GET("/:id", snippetHandler.GetByID)
            snippets.POST("", snippetHandler.Create)
            snippets.PUT("/:id", snippetHandler.Update)
            snippets.DELETE("/:id", snippetHandler.Delete)
        }

        // 代理转发
        proxy := v1.Group("/proxy")
        {
            proxy.Any("/*path", proxyHandler.Forward)
        }
    }

    // ── 插件路由组 ──
    if pluginRouter != nil {
        s.engine.Group("/plugins")
    }
}

// Start 启动 HTTP 服务（阻塞）
func (s *Server) Start(ctx context.Context) error {
    s.ctx = ctx

    s.httpSrv = &http.Server{
        Addr:         fmt.Sprintf("127.0.0.1:%d", s.port),
        Handler:      s.engine,
        ReadTimeout:  30 * time.Second,
        WriteTimeout: 60 * time.Second,
    }

    ln, err := net.Listen("tcp", s.httpSrv.Addr)
    if err != nil {
        return fmt.Errorf("listen failed: %w", err)
    }

    // 实际端口（如果配置为 0 自动分配）
    s.port = ln.Addr().(*net.TCPAddr).Port

    go func() {
        log.Info().Int("port", s.port).Msg("Gin HTTP server starting")
        if err := s.httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
            log.Error().Err(err).Msg("Gin server error")
        }
    }()

    return nil
}

// Stop 优雅关闭
func (s *Server) Stop(ctx context.Context) error {
    if s.httpSrv != nil {
        return s.httpSrv.Shutdown(ctx)
    }
    return nil
}

// Port 返回实际监听端口
func (s *Server) Port() int {
    return s.port
}
```

### 3.3 Gin 中间件

```go
// backend/internal/server/middleware/logger.go
package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

// RequestLogger 请求日志中间件
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		// 处理请求
		c.Next()

		// 记录日志
		latency := time.Since(start)
		status := c.Writer.Status()

		evt := log.Info()
		if status >= 500 {
			evt = log.Error()
		} else if status >= 400 {
			evt = log.Warn()
		}

		evt.Str("method", c.Request.Method).
			Str("path", path).
			Str("query", raw).
			Int("status", status).
			Dur("latency", latency).
			Str("client_ip", c.ClientIP()).
			Msg("HTTP request")

		// 写入响应头（方便调试）
		c.Header("X-Response-Time", latency.String())
	}
}
```

```go
// backend/internal/server/middleware/cors.go
package middleware

import (
	"github.com/gin-gonic/gin"
)

// Cors 中间件（开发模式：允许所有来源）
func Cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Request-ID")
		c.Header("Access-Control-Expose-Headers", "Content-Length, X-Request-ID")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
```

```go
// backend/internal/server/middleware/ratelimit.go
package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimit 令牌桶限流中间件
func RateLimit(rps int, burst int) gin.HandlerFunc {
	type visitor struct {
		tokens    float64
		lastCheck time.Time
	}

	var (
		mu       sync.Mutex
		visitors = make(map[string]*visitor)
	)

	return func(c *gin.Context) {
		ip := c.ClientIP()

		mu.Lock()
		v, exists := visitors[ip]
		if !exists {
			v = &visitor{tokens: float64(burst), lastCheck: time.Now()}
			visitors[ip] = v
		}

		// 补充令牌
		elapsed := time.Since(v.lastCheck).Seconds()
		v.tokens += elapsed * float64(rps)
		if v.tokens > float64(burst) {
			v.tokens = float64(burst)
		}
		v.lastCheck = time.Now()

		if v.tokens < 1 {
			mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"code":    429,
				"message": "rate limit exceeded",
			})
			return
		}

		v.tokens--
		mu.Unlock()
		c.Next()
	}
}
```

```go
// backend/internal/server/middleware/recovery.go
package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

// Recovery 异常恢复中间件
func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		log.Error().
			Interface("error", recovered).
			Str("path", c.Request.URL.Path).
			Str("method", c.Request.Method).
			Msg("panic recovered")

		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "internal server error",
		})
	})
}
```

### 3.4 统一响应格式

```go
// backend/internal/server/response/response.go
package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Response 统一响应结构
type Response struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// PageData 分页数据
type PageData struct {
	Items any   `json:"items"`
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Size  int   `json:"size"`
}

// OK 成功响应
func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Response{
		Code:    0,
		Message: "success",
		Data:    data,
	})
}

// OKWithPage 分页成功响应
func OKWithPage(c *gin.Context, items any, total int64, page, size int) {
	c.JSON(http.StatusOK, Response{
		Code:    0,
		Message: "success",
		Data: PageData{
			Items: items,
			Total: total,
			Page:  page,
			Size:  size,
		},
	})
}

// Fail 业务错误响应
func Fail(c *gin.Context, code int, message string) {
	c.JSON(http.StatusOK, Response{
		Code:    code,
		Message: message,
	})
}

// FailWithHTTPStatus HTTP 错误响应
func FailWithHTTPStatus(c *gin.Context, httpStatus int, code int, message string) {
	c.JSON(httpStatus, Response{
		Code:    code,
		Message: message,
	})
}

// ServerError 服务器错误
func ServerError(c *gin.Context, err error) {
	log.Error().Err(err).Str("path", c.Request.URL.Path).Msg("server error")
	c.JSON(http.StatusInternalServerError, Response{
		Code:    500,
		Message: "internal server error",
	})
}
```

```go
// backend/internal/server/response/errors.go
package response

// 业务错误码定义
const (
	CodeSuccess       = 0
	CodeInvalidParam  = 10001
	CodeNotFound      = 10002
	CodeDuplicate     = 10003
	CodeUnauthorized  = 10004
	CodeInternalError = 50000
)

var codeMessages = map[int]string{
	CodeSuccess:       "success",
	CodeInvalidParam:  "invalid parameters",
	CodeNotFound:      "resource not found",
	CodeDuplicate:     "resource already exists",
	CodeUnauthorized:  "unauthorized",
	CodeInternalError: "internal server error",
}

func GetMessage(code int) string {
	if msg, ok := codeMessages[code]; ok {
		return msg
	}
	return "unknown error"
}
```

### 3.5 Mock Handler（Gin 核心 Handler）

```go
// backend/internal/server/handler/mock_handler.go
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"devpilot/backend/internal/models"
	"devpilot/backend/internal/services/mock"
	"devpilot/backend/internal/server/response"
)

type MockHandler struct {
	mockEngine *mock.Engine
}

func NewMockHandler(engine *mock.Engine) *MockHandler {
	return &MockHandler{mockEngine: engine}
}

// HandleMock 处理所有 Mock 请求（核心路由）
// 路由: ANY /mock/*
func (h *MockHandler) HandleMock(c *gin.Context) {
	path := c.Param("path")
	method := c.Request.Method

	// 匹配 Mock 规则
	rule, matched := h.mockEngine.Match(method, path)
	if !matched {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "no matching mock rule",
			"path":    path,
			"method":  method,
		})
		return
	}

	// 延迟模拟
	if rule.Delay > 0 {
		time.Sleep(time.Duration(rule.Delay) * time.Millisecond)
	}

	// 设置响应头
	for key, value := range rule.Response.Headers {
		c.Header(key, value)
	}

	// 设置状态码
	c.Status(rule.Response.StatusCode)

	// 返回响应体
	c.Data(rule.Response.ContentType, rule.Response.Body)
}

// ListRules 获取 Mock 规则列表
func (h *MockHandler) ListRules(c *gin.Context) {
	rules := h.mockEngine.ListRules()
	response.OK(c, rules)
}

// CreateRule 创建 Mock 规则
func (h *MockHandler) CreateRule(c *gin.Context) {
	var rule models.MockRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		response.Fail(c, response.CodeInvalidParam, err.Error())
		return
	}

	if err := h.mockEngine.AddRule(&rule); err != nil {
		response.ServerError(c, err)
		return
	}

	response.OK(c, rule)
}

// UpdateRule 更新 Mock 规则
func (h *MockHandler) UpdateRule(c *gin.Context) {
	id := c.Param("id")

	var rule models.MockRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		response.Fail(c, response.CodeInvalidParam, err.Error())
		return
	}

	rule.ID = id
	if err := h.mockEngine.UpdateRule(&rule); err != nil {
		if err == mock.ErrRuleNotFound {
			response.Fail(c, response.CodeNotFound, "rule not found")
			return
		}
		response.ServerError(c, err)
		return
	}

	response.OK(c, rule)
}

// DeleteRule 删除 Mock 规则
func (h *MockHandler) DeleteRule(c *gin.Context) {
	id := c.Param("id")
	if err := h.mockEngine.DeleteRule(id); err != nil {
		response.ServerError(c, err)
		return
	}
	response.OK(c, nil)
}

// ToggleRule 启用/禁用 Mock 规则
func (h *MockHandler) ToggleRule(c *gin.Context) {
	id := c.Param("id")
	if err := h.mockEngine.ToggleRule(id); err != nil {
		response.ServerError(c, err)
		return
	}
	response.OK(c, nil)
}

// ImportRules 批量导入 Mock 规则
func (h *MockHandler) ImportRules(c *gin.Context) {
	var rules []models.MockRule
	if err := c.ShouldBindJSON(&rules); err != nil {
		response.Fail(c, response.CodeInvalidParam, err.Error())
		return
	}

	count, err := h.mockEngine.ImportRules(rules)
	if err != nil {
		response.ServerError(c, err)
		return
	}

	response.OK(c, gin.H{"imported": count})
}

// ExportRules 导出所有 Mock 规则
func (h *MockHandler) ExportRules(c *gin.Context) {
	rules := h.mockEngine.ListRules()
	response.OK(c, rules)
}

// ClearRules 清空所有 Mock 规则
func (h *MockHandler) ClearRules(c *gin.Context) {
	if err := h.mockEngine.ClearRules(); err != nil {
		response.ServerError(c, err)
		return
	}
	response.OK(c, nil)
}
```

### 3.5.1 Proxy Handler（基于 Resty 代理转发）

```go
// backend/internal/server/handler/proxy_handler.go
package handler

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/go-resty/resty/v2"
	"devpilot/backend/internal/services/api"
	"devpilot/backend/internal/server/response"
)

type ProxyHandler struct {
	apiSvc *api.ServiceImpl
	client *resty.Client
}

func NewProxyHandler(apiSvc *api.ServiceImpl) *ProxyHandler {
	// 代理专用 Resty 客户端（独立配置）
	client := resty.New()
	client.SetTimeout(0) // 代理模式不设超时，跟随上游

	return &ProxyHandler{
		apiSvc: apiSvc,
		client: client,
	}
}

// Forward 代理转发请求
// 路由: ANY /api/v1/proxy/*path
// 用途：解决前端跨域问题，请求/响应拦截，Header 注入
func (h *ProxyHandler) Forward(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		response.Fail(c, response.CodeInvalidParam, "missing target url")
		return
	}

	// 从原始请求提取信息
	method := c.Request.Method

	// 构造 Headers（透传 + 可注入代理头）
	headers := make(map[string]string)
	for key, values := range c.Request.Header {
		// 跳过 Hop-by-Hop 头
		if isHopByHopHeader(key) {
			continue
		}
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}

	// 读取请求体
	var body string
	if c.Request.Body != nil {
		bodyBytes, _ := io.ReadAll(c.Request.Body)
		body = string(bodyBytes)
	}

	// 通过 Resty 转发请求
	r := h.client.R().
		SetContext(c.Request.Context()).
		SetHeaders(headers)

	if body != "" {
		r.SetBody(body)
	}

	// 透传 Query Params
	for key, values := range c.Request.URL.Query() {
		if key != "url" { // 排除代理参数
			if len(values) > 0 {
				r.SetQueryParam(key, values[0])
			}
		}
	}

	resp, err := r.Execute(method, targetURL)
	if err != nil {
		response.Fail(c, response.CodeInternalError, err.Error())
		return
	}

	// 透传响应头
	for key, values := range resp.Header() {
		if len(values) > 0 {
			c.Header(key, values[0])
		}
	}

	// 设置响应状态码和 Body
	c.Data(resp.StatusCode(), resp.Header().Get("Content-Type"), resp.Body())
}

// isHopByHopHeader 判断是否为 Hop-by-Hop 头（代理不应转发的头）
func isHopByHopHeader(header string) bool {
	hopByHopHeaders := map[string]bool{
		"Connection":          true,
		"Keep-Alive":          true,
		"Proxy-Authenticate":  true,
		"Proxy-Authorization": true,
		"Te":                  true,
		"Trailers":            true,
		"Transfer-Encoding":   true,
		"Upgrade":             true,
		"Host":                true,
	}
	return hopByHopHeaders[http.CanonicalHeaderKey(header)]
}
```

### 3.6 Mock 引擎核心

```go
// backend/internal/services/mock/engine.go
package mock

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"sync"

	"github.com/rs/zerolog"
)

var ErrRuleNotFound = fmt.Errorf("mock rule not found")

type Engine struct {
	mu    sync.RWMutex
	rules []*models.MockRule
	store Store
	log   *zerolog.Logger
}

// Store Mock 规则持久化接口
type Store interface {
	Save(ctx context.Context, rules []*models.MockRule) error
	Load(ctx context.Context) ([]*models.MockRule, error)
}

func NewEngine(store Store, log *zerolog.Logger) (*Engine, error) {
	e := &Engine{store: store, log: log}

	// 从持久化层加载规则
	if store != nil {
		rules, err := store.Load(context.Background())
		if err != nil {
			return nil, fmt.Errorf("load mock rules: %w", err)
		}
		e.rules = rules
	}

	return e, nil
}

// Match 匹配 Mock 规则（按优先级：精确匹配 > 正则匹配 > 前缀匹配）
func (e *Engine) Match(method, path string) (*models.MockRule, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	for _, rule := range e.rules {
		if !rule.Enabled {
			continue
		}
		if !strings.EqualFold(rule.Method, method) {
			continue
		}

		switch rule.MatchType {
		case models.MatchExact:
			if rule.Path == path {
				return rule, true
			}
		case models.MatchPrefix:
			if strings.HasPrefix(path, rule.Path) {
				return rule, true
			}
		case models.MatchRegex:
			re, err := regexp.Compile(rule.Path)
			if err != nil {
				continue
			}
			if re.MatchString(path) {
				return rule, true
			}
		}
	}

	return nil, false
}

func (e *Engine) AddRule(rule *models.MockRule) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	rule.ID = generateID()
	rule.Enabled = true
	rule.CreatedAt = time.Now()
	rule.UpdatedAt = time.Now()

	e.rules = append(e.rules, rule)

	return e.persist(context.Background())
}

func (e *Engine) UpdateRule(rule *models.MockRule) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	for i, r := range e.rules {
		if r.ID == rule.ID {
			rule.UpdatedAt = time.Now()
			e.rules[i] = rule
			return e.persist(context.Background())
		}
	}

	return ErrRuleNotFound
}

func (e *Engine) DeleteRule(id string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	for i, r := range e.rules {
		if r.ID == id {
			e.rules = append(e.rules[:i], e.rules[i+1:]...)
			return e.persist(context.Background())
		}
	}

	return ErrRuleNotFound
}

func (e *Engine) ToggleRule(id string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	for _, r := range e.rules {
		if r.ID == id {
			r.Enabled = !r.Enabled
			r.UpdatedAt = time.Now()
			return e.persist(context.Background())
		}
	}

	return ErrRuleNotFound
}

func (e *Engine) ListRules() []*models.MockRule {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.rules
}

func (e *Engine) ClearRules() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.rules = nil
	return e.persist(context.Background())
}

func (e *Engine) ImportRules(rules []models.MockRule) (int, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	count := 0
	for i := range rules {
		rules[i].ID = generateID()
		rules[i].Enabled = true
		rules[i].CreatedAt = time.Now()
		rules[i].UpdatedAt = time.Now()
		e.rules = append(e.rules, &rules[i])
		count++
	}

	return count, e.persist(context.Background())
}

// persist 持久化到存储
func (e *Engine) persist(ctx context.Context) error {
	if e.store != nil {
		return e.store.Save(ctx, e.rules)
	}
	return nil
}
```

### 3.7 Mock 领域模型

```go
// backend/internal/models/mock.go
package models

import "time"

// MatchType 路由匹配类型
type MatchType string

const (
	MatchExact  MatchType = "exact"   // 精确匹配
	MatchPrefix MatchType = "prefix"  // 前缀匹配
	MatchRegex  MatchType = "regex"   // 正则匹配
)

// MockRule Mock 规则
type MockRule struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`       // 规则名称
	Method    string       `json:"method"`     // HTTP 方法
	Path      string       `json:"path"`       // 匹配路径
	MatchType MatchType    `json:"match_type"` // 匹配类型
	Enabled   bool         `json:"enabled"`    // 是否启用
	Delay     int          `json:"delay"`      // 延迟响应（毫秒）
	Priority  int          `json:"priority"`   // 优先级（数字越小优先级越高）
	Response  MockResponse `json:"response"`   // 响应定义
	Metadata  map[string]string `json:"metadata,omitempty"` // 自定义元数据
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
}

// MockResponse Mock 响应定义
type MockResponse struct {
	StatusCode  int               `json:"status_code"`            // 状态码
	ContentType string            `json:"content_type"`           // Content-Type
	Body        []byte            `json:"body"`                   // 响应体
	Headers     map[string]string `json:"headers,omitempty"`      // 响应头
	BodyType    string            `json:"body_type"`              // body 类型: json / raw / file
	BodyRaw     string            `json:"body_raw,omitempty"`     // 原始字符串（编辑用）
}
```

### 3.8 API 调试服务（基于 Resty）

```go
// backend/internal/services/api/client.go
package api

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/go-resty/resty/v2"
)

// Request 表示一个 HTTP 请求
type Request struct {
	ID        string            `json:"id"`
	Method    string            `json:"method"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body"`
	Params    map[string]string `json:"params"`
	FormData  map[string]string `json:"form_data,omitempty"`
	TLSConfig *TLSConfig        `json:"tls_config,omitempty"`
	Timeout   int               `json:"timeout"` // 秒，0 为默认
	Auth      *AuthConfig       `json:"auth,omitempty"`
	Timestamp int64             `json:"timestamp"`
}

type TLSConfig struct {
	InsecureSkipVerify bool   `json:"insecure_skip_verify"`
	ClientCert         string `json:"client_cert,omitempty"`
	ClientKey          string `json:"client_key,omitempty"`
}

type AuthConfig struct {
	Type     string `json:"type"`     // none / basic / bearer / oauth2
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Token    string `json:"token,omitempty"`
}

// Response 表示 HTTP 响应结果
type Response struct {
	StatusCode    int               `json:"status_code"`
	Status        string            `json:"status"`
	Headers       map[string]string `json:"headers"`
	Body          string            `json:"body"`
	ContentType   string            `json:"content_type"`
	Duration      int64             `json:"duration_ms"`
	Size          int64             `json:"size_bytes"`
	TransferSize  int64             `json:"transfer_size_bytes"`
	RemoteAddr    string            `json:"remote_addr,omitempty"`
	Protocol      string            `json:"protocol"`
	RequestID     string            `json:"request_id,omitempty"`
}

// Service 定义 API 调试服务接口
type Service interface {
	Execute(ctx context.Context, req *Request) (*Response, error)
	GetHistory(ctx context.Context, page, size int) ([]*Request, int, error)
	SaveRequest(ctx context.Context, req *Request) error
	DeleteRequest(ctx context.Context, id string) error
	ImportCURL(ctx context.Context, curlCmd string) (*Request, error)
	ExportCURL(ctx context.Context, req *Request) (string, error)
}
```

```go
// backend/internal/services/api/resty_client.go
package api

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/rs/zerolog"
)

const (
	defaultTimeout     = 30 * time.Second
	maxRedirects       = 5
	defaultRetryCount  = 0  // API 调试不自动重试，用户控制
	maxResponseSize    = 50 * 1024 * 1024 // 50MB
)

// RestyClient 封装 Resty HTTP 客户端
type RestyClient struct {
	client *resty.Client
	log    *zerolog.Logger
}

// NewRestyClient 创建 Resty 客户端实例
func NewRestyClient(log *zerolog.Logger) *RestyClient {
	client := resty.New()

	// ── 基础配置 ──
	client.SetTimeout(defaultTimeout).
		SetRedirectPolicy(resty.NoRedirectPolicy()).
		SetRetryCount(defaultRetryCount).
		SetContentLength(true)

	// ── 自定义 Transport（精细控制连接） ──
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
		TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS12},
		ForceAttemptHTTP2:   true,
	}
	client.SetTransport(transport)

	// ── 请求拦截器：记录请求日志 ──
	client.SetOnBeforeRequest(func(c *resty.Client, r *resty.Request) error {
		log.Debug().
			Str("method", r.Method).
			Str("url", r.URL).
			Str("host", c.HostURL).
			Msg("sending request")
		return nil
	})

	// ── 响应拦截器：记录响应日志 ──
	client.SetOnAfterResponse(func(c *resty.Client, r *resty.Response) error {
		log.Debug().
			Int("status", r.StatusCode()).
			Dur("duration", r.Time()).
			Int64("size", int64(len(r.Body()))).
			Msg("received response")
		return nil
	})

	// ── 错误重试器：连接错误可重试 ──
	client.AddRetryCondition(func(r *resty.Response, err error) bool {
		// 网络错误可重试
		if err != nil {
			return true
		}
		// 5xx 服务端错误不自动重试（用户决定）
		return false
	})

	return &RestyClient{client: client, log: log}
}

// Execute 发送 HTTP 请求
func (rc *RestyClient) Execute(ctx context.Context, req *Request) (*Response, error) {
	// 为每次请求创建新的 request（并发安全）
	r := rc.client.R().
		SetContext(ctx)

	// 设置 Headers
	if len(req.Headers) > 0 {
		r.SetHeaders(req.Headers)
	}

	// 设置 Query Params
	if len(req.Params) > 0 {
		r.SetQueryParams(req.Params)
	}

	// 设置 Form Data
	if len(req.FormData) > 0 {
		r.SetFormData(req.FormData)
	}

	// 设置 Body
	if req.Body != "" {
		r.SetBody(req.Body)
	}

	// 设置 Auth
	if req.Auth != nil && req.Auth.Type != "none" {
		rc.setAuth(r, req.Auth)
	}

	// 设置 TLS
	if req.TLSConfig != nil && req.TLSConfig.InsecureSkipVerify {
		// 克隆 client 以避免 TLS 配置互相影响
		r.SetTLSClientConfig(&tls.Config{
			InsecureSkipVerify: true,
		})
	}

	// 设置超时
	if req.Timeout > 0 {
		r.SetTimeout(time.Duration(req.Timeout) * time.Second)
	}

	// 执行请求
	start := time.Now()
	resp, err := r.Execute(req.Method, req.URL)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	elapsed := time.Since(start)

	// 构造响应
	result := &Response{
		StatusCode:   resp.StatusCode(),
		Status:       resp.Status(),
		Headers:      rc.extractHeaders(resp),
		Body:         string(resp.Body()),
		ContentType:  resp.Header().Get("Content-Type"),
		Duration:     elapsed.Milliseconds(),
		Size:         int64(len(resp.Body())),
		TransferSize: int64(resp.RawResponse.ContentLength),
		Protocol:     resp.Proto(),
	}

	return result, nil
}

// setAuth 设置认证方式
func (rc *RestyClient) setAuth(r *resty.Request, auth *AuthConfig) {
	switch auth.Type {
	case "basic":
		r.SetBasicAuth(auth.Username, auth.Password)
	case "bearer":
		r.SetAuthToken(auth.Token)
	case "oauth2":
		// OAuth2 Bearer Token
		r.SetAuthToken(auth.Token)
		r.SetHeader("Authorization", "Bearer "+auth.Token)
	}
}

// extractHeaders 提取响应头（Go 的 Header 是 map[string][]string，转换为 map[string]string）
func (rc *RestyClient) extractHeaders(resp *resty.Response) map[string]string {
	headers := make(map[string]string)
	for key, values := range resp.Header() {
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}
	return headers
}

// ExecuteRaw 发送原始 HTTP 请求（用于代理模式，返回完整 *resty.Response）
func (rc *RestyClient) ExecuteRaw(ctx context.Context, method, url string,
	headers map[string]string, body string) (*resty.Response, error) {

	r := rc.client.R().
		SetContext(ctx).
		SetHeaders(headers)

	if body != "" {
		r.SetBody(body)
	}

	resp, err := r.Execute(method, url)
	if err != nil {
		return nil, fmt.Errorf("proxy request failed: %w", err)
	}

	return resp, nil
}
```

```go
// backend/internal/services/api/service.go
package api

import (
	"context"
	"fmt"

	"github.com/rs/zerolog"
	"devpilot/backend/internal/core"
)

// ServiceImpl API 调试服务实现
type ServiceImpl struct {
	client   *RestyClient
	log      *zerolog.Logger
	eventBus *core.EventBus
	store    HistoryStore
}

// HistoryStore 历史记录持久化接口
type HistoryStore interface {
	Save(ctx context.Context, req *Request) error
	List(ctx context.Context, page, size int) ([]*Request, int, error)
	Delete(ctx context.Context, id string) error
}

func NewService(cfg *core.Config, log *zerolog.Logger, eventBus *core.EventBus) *ServiceImpl {
	zerologLogger := log.With().Str("component", "api-service").Logger()
	client := NewRestyClient(&zerologLogger)

	return &ServiceImpl{
		client:   client,
		log:      log,
		eventBus: eventBus,
	}
}

// SetStore 设置历史记录存储（可选依赖，支持延迟注入）
func (s *ServiceImpl) SetStore(store HistoryStore) {
	s.store = store
}

// Execute 执行 HTTP 请求（对外接口）
func (s *ServiceImpl) Execute(ctx context.Context, req *Request) (*Response, error) {
	// 发送开始事件
	s.eventBus.Emit("api:request:start", map[string]any{
		"id":     req.ID,
		"method": req.Method,
		"url":    req.URL,
	})

	// 通过 Resty 执行请求
	resp, err := s.client.Execute(ctx, req)
	if err != nil {
		s.eventBus.Emit("api:request:error", map[string]any{
			"id":    req.ID,
			"error": err.Error(),
		})
		return nil, fmt.Errorf("execute request failed: %w", err)
	}

	// 发送完成事件
	s.eventBus.Emit("api:request:complete", map[string]any{
		"id":       req.ID,
		"status":   resp.StatusCode,
		"duration": resp.Duration,
		"size":     resp.Size,
	})

	// 异步保存历史记录
	if s.store != nil {
		go func() {
			_ = s.store.Save(context.Background(), req)
		}()
	}

	return resp, nil
}

// GetHistory 获取请求历史
func (s *ServiceImpl) GetHistory(ctx context.Context, page, size int) ([]*Request, int, error) {
	if s.store == nil {
		return nil, 0, nil
	}
	return s.store.List(ctx, page, size)
}

// SaveRequest 保存请求
func (s *ServiceImpl) SaveRequest(ctx context.Context, req *Request) error {
	if s.store == nil {
		return nil
	}
	return s.store.Save(ctx, req)
}

// DeleteRequest 删除请求
func (s *ServiceImpl) DeleteRequest(ctx context.Context, id string) error {
	if s.store == nil {
		return nil
	}
	return s.store.Delete(ctx, id)
}

// ImportCURL 从 cURL 命令导入（利用 Resty 的请求结构）
func (s *ServiceImpl) ImportCURL(ctx context.Context, curlCmd string) (*Request, error) {
	req, err := parseCURL(curlCmd)
	if err != nil {
		return nil, fmt.Errorf("parse curl failed: %w", err)
	}
	return req, nil
}

// ExportCURL 导出为 cURL 命令
func (s *ServiceImpl) ExportCURL(ctx context.Context, req *Request) (string, error) {
	return buildCURL(req), nil
}
```

```go
// backend/internal/store/repository.go
package store

import "context"

// Repository 通用仓库接口
type Repository[T any, ID comparable] interface {
    Create(ctx context.Context, entity *T) error
    GetByID(ctx context.Context, id ID) (*T, error)
    Update(ctx context.Context, entity *T) error
    Delete(ctx context.Context, id ID) error
    List(ctx context.Context, offset, limit int) ([]*T, int, error)
}
```

```go
// backend/internal/plugins/interface.go
package plugins

import (
    "context"
    "github.com/gin-gonic/gin"
)

// Plugin 定义插件接口
type Plugin interface {
    Info() PluginInfo
    Init(ctx context.Context, app AppContext) error
    Destroy() error
    // RegisterRoutes 注册 Gin 路由（新增：插件可扩展 HTTP API）
    RegisterRoutes(rg *gin.RouterGroup)
}

type PluginInfo struct {
    Name        string `json:"name"`
    Version     string `json:"version"`
    Description string `json:"description"`
    Author      string `json:"author"`
}

// AppContext 插件可访问的应用上下文（受限）
type AppContext interface {
    EmitEvent(name string, data any)
    GetConfig(key string) (any, bool)
    Store(key string, value []byte) error
    Load(key string) ([]byte, error)
}
```

### 3.9 Wails App 主结构（集成 Gin）

```go
// app.go
package main

import (
	"context"

	"devpilot/backend/internal/core"
	"devpilot/backend/internal/server"
	"devpilot/backend/internal/server/handler"
	"devpilot/backend/internal/services/api"
	"devpilot/backend/internal/services/codegen"
	"devpilot/backend/internal/services/database"
	"devpilot/backend/internal/services/mock"
	"devpilot/backend/internal/services/terminal"
)

type App struct {
	ctx       context.Context
	config    *core.Config
	logger    *core.Logger
	eventBus  *core.EventBus

	// 服务层
	apiSvc      *api.ServiceImpl
	codegenSvc  *codegen.Service
	dbSvc       *database.Service
	termSvc     *terminal.Service
	mockEngine  *mock.Engine

	// Gin HTTP 服务器
	ginServer *server.Server
}

func NewApp() *App {
	return &App{}
}

// Startup Wails 生命周期：应用启动
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	// ── 初始化核心组件 ──
	a.config = core.NewConfig()
	a.logger = core.NewLogger(a.config.LogLevel)
	a.eventBus = core.NewEventBus(a.ctx)

	// ── 初始化服务层 ──
	a.apiSvc = api.NewService(a.config, a.logger, a.eventBus)
	a.codegenSvc = codegen.NewService(a.config, a.logger)
	a.dbSvc = database.NewService(a.config, a.logger, a.eventBus)
	a.termSvc = terminal.NewService(a.logger, a.eventBus)
	a.mockEngine = mock.NewEngine(nil, a.logger)

	// ── 启动 Gin HTTP 服务器 ──
	a.startGinServer()

	a.logger.Info().Msg("DevPilot started")
}

func (a *App) startGinServer() {
	ginServer := server.NewServer(server.Config{
		Port:       a.config.Server.Port,
		Mode:       a.config.Server.Mode,
		EnableCors: true,
	})

	// 创建 Gin Handler
	mockHandler := handler.NewMockHandler(a.mockEngine)
	snippetHandler := handler.NewSnippetHandler(/* snippetRepo */)
	healthHandler := handler.NewHealthHandler()
	proxyHandler := handler.NewProxyHandler(a.apiSvc)

	// 注册路由
	ginServer.SetupRouter(mockHandler, snippetHandler, healthHandler, proxyHandler, nil)

	// 启动服务器
	if err := ginServer.Start(a.ctx); err != nil {
		a.logger.Fatal().Err(err).Msg("Gin server start failed")
	}

	a.ginServer = ginServer
	a.logger.Info().Int("port", a.ginServer.Port()).Msg("Gin HTTP server started")

	// 通知前端服务器已启动
	a.eventBus.Emit("server:started", map[string]any{
		"port": a.ginServer.Port(),
	})
}

// Shutdown Wails 生命周期：应用关闭
func (a *App) Shutdown(ctx context.Context) {
	a.logger.Info().Msg("DevPilot shutting down")

	// 按依赖倒序关闭
	if a.termSvc != nil {
		a.termSvc.Close()
	}
	if a.dbSvc != nil {
		a.dbSvc.Close()
	}
	if a.ginServer != nil {
		a.ginServer.Stop(ctx)
	}
}

// ─── Wails Binding 方法（前端 IPC 调用） ───

func (a *App) ExecuteRequest(req api.Request) (api.Response, error) {
	return a.apiSvc.Execute(a.ctx, &req)
}

func (a *App) GenerateCode(params codegen.Params) (codegen.Result, error) {
	return a.codegenSvc.Generate(a.ctx, params)
}

func (a *App) ExecuteQuery(connID string, query string) (database.QueryResult, error) {
	return a.dbSvc.Execute(a.ctx, connID, query)
}

func (a *App) CreateTerminal(opts terminal.Options) (string, error) {
	return a.termSvc.Create(a.ctx, opts)
}

func (a *App) WriteTerminal(sessionID string, data string) error {
	return a.termSvc.Write(sessionID, data)
}

func (a *App) ResizeTerminal(sessionID string, rows, cols int) error {
	return a.termSvc.Resize(sessionID, rows, cols)
}

func (a *App) CloseTerminal(sessionID string) error {
	return a.termSvc.Close(sessionID)
}

// ─── Mock Server Wails 方法 ───

func (a *App) GetServerPort() int {
	if a.ginServer != nil {
		return a.ginServer.Port()
	}
	return 0
}

func (a *App) CreateMockRule(rule models.MockRule) error {
	return a.mockEngine.AddRule(&rule)
}

func (a *App) GetMockRules() []models.MockRule {
	return a.mockEngine.ListRules()
}

func (a *App) ToggleMockRule(id string) error {
	return a.mockEngine.ToggleRule(id)
}

func (a *App) DeleteMockRule(id string) error {
	return a.mockEngine.DeleteRule(id)
}
```

### 3.10 事件总线设计

```go
// backend/internal/core/events.go
package core

import (
    "context"
    "sync"

    "github.com/wailsapp/wails/v2/pkg/runtime"
)

type EventBus struct {
    ctx  context.Context
    mu   sync.RWMutex
    subs map[string][]chan any
}

func NewEventBus(ctx context.Context) *EventBus {
    return &EventBus{
        ctx:  ctx,
        subs: make(map[string][]chan any),
    }
}

// Emit 发送事件到前端 + 内部订阅者
func (b *EventBus) Emit(name string, data any) {
    runtime.EventsEmit(b.ctx, name, data)

    b.mu.RLock()
    defer b.mu.RUnlock()
    for _, ch := range b.subs[name] {
        select {
        case ch <- data:
        default:
        }
    }
}

// Subscribe 内部事件订阅
func (b *EventBus) Subscribe(name string) <-chan any {
    b.mu.Lock()
    defer b.mu.Unlock()
    ch := make(chan any, 16)
    b.subs[name] = append(b.subs[name], ch)
    return ch
}
```

### 3.11 事件定义规范

| 事件名 | 方向 | 数据格式 | 说明 |
|--------|------|----------|------|
| `api:request:start` | Go→FE | `{id, method, url}` | 请求开始 |
| `api:request:complete` | Go→FE | `{id, response}` | 请求完成 |
| `api:request:error` | Go→FE | `{id, error}` | 请求失败 |
| `terminal:output` | Go→FE | `{sessionId, data}` | 终端输出 |
| `terminal:exit` | Go→FE | `{sessionId, exitCode}` | 终端退出 |
| `db:query:progress` | Go→FE | `{connId, progress}` | 查询进度 |
| `db:connection:status` | Go→FE | `{connId, status}` | 连接状态变化 |
| `server:started` | Go→FE | `{port}` | Gin 服务器启动完成 |
| `server:stopped` | Go→FE | `{}` | Gin 服务器停止 |
| `mock:rule:matched` | Go→FE | `{ruleId, path, method}` | Mock 规则命中 |
| `app:notification` | Go→FE | `{level, title, message}` | 通用通知 |

### 3.12 数据库连接池管理

```go
// backend/internal/services/database/connector.go
package database

import (
    "context"
    "database/sql"
    "fmt"
    "sync"
)

type ConnectionManager struct {
    mu    sync.RWMutex
    conns map[string]*sql.DB
}

func NewConnectionManager() *ConnectionManager {
    return &ConnectionManager{
        conns: make(map[string]*sql.DB),
    }
}

func (cm *ConnectionManager) Connect(ctx context.Context, cfg ConnectionConfig) (string, error) {
    cm.mu.Lock()
    defer cm.mu.Unlock()

    dsn := cfg.BuildDSN()
    db, err := sql.Open(cfg.Driver, dsn)
    if err != nil {
        return "", fmt.Errorf("connect failed: %w", err)
    }

    db.SetMaxOpenConns(5)
    db.SetMaxIdleConns(2)
    db.SetConnMaxLifetime(30 * 60 * 1_000_000_000)

    if err := db.PingContext(ctx); err != nil {
        db.Close()
        return "", fmt.Errorf("ping failed: %w", err)
    }

    id := generateConnectionID()
    cm.conns[id] = db
    return id, nil
}

func (cm *ConnectionManager) Get(id string) (*sql.DB, bool) {
    cm.mu.RLock()
    defer cm.RUnlock()
    db, ok := cm.conns[id]
    return db, ok
}

func (cm *ConnectionManager) Close(id string) error {
    cm.mu.Lock()
    defer cm.mu.Unlock()
    if db, ok := cm.conns[id]; ok {
        delete(cm.conns, id)
        return db.Close()
    }
    return nil
}
```

---

## 4. React 前端架构

### 4.1 模块化架构

```
frontend/src/
├── modules/           # 功能模块（高内聚低耦合）
│   └── [module]/
│       ├── pages/         # 页面级组件（路由入口）
│       ├── components/    # 模块私有组件
│       ├── hooks/         # 模块私有 hooks
│       ├── store.ts       # 模块状态
│       ├── types.ts       # 模块类型
│       └── index.ts       # 公共导出
│
├── shared/            # 跨模块共享
│   ├── components/    # 通用 UI 组件
│   ├── hooks/         # 通用 hooks
│   ├── utils/         # 工具函数
│   └── types/         # 全局类型
│
├── wails/             # Wails 通信层（IPC）
│   ├── index.ts       # 方法调用
│   └── events.ts      # 事件监听
│
└── api/               # HTTP API 调用层（Gin REST API）[新增]
    ├── client.ts      # HTTP 客户端基础配置
    ├── mock.ts        # Mock API 调用
    ├── snippet.ts     # 代码片段 API 调用
    └── types.ts       # API 通用类型
```

### 4.2 Wails 调用封装（类型安全，IPC 通道）

```typescript
// frontend/src/wails/index.ts
import { Events } from './events'

// Wails IPC 方法调用封装
export async function wailsCall<T>(
  method: string,
  ...args: any[]
): Promise<T> {
  // @ts-expect-error Wails 运行时注入
  const result = await window.go.main.App[method](...args)
  return result as T
}

// ── IPC 业务方法 ──

export const api = {
  executeRequest: (req: ApiRequest) =>
    wailsCall<ApiResponse>('ExecuteRequest', req),

  getHistory: (page: number, size: number) =>
    wailsCall<{ items: ApiRequest[]; total: number }>('GetHistory', page, size),

  saveRequest: (req: ApiRequest) =>
    wailsCall<void>('SaveRequest', req),

  importCurl: (cmd: string) =>
    wailsCall<ApiRequest>('ImportCURL', cmd),
}

export const codegen = {
  generate: (params: CodegenParams) =>
    wailsCall<CodegenResult>('GenerateCode', params),
}

export const database = {
  executeQuery: (connId: string, query: string) =>
    wailsCall<QueryResult>('ExecuteQuery', connId, query),
}

export const terminal = {
  create: (opts: TerminalOptions) =>
    wailsCall<string>('CreateTerminal', opts),

  write: (sessionId: string, data: string) =>
    wailsCall<void>('WriteTerminal', sessionId, data),

  resize: (sessionId: string, rows: number, cols: number) =>
    wailsCall<void>('ResizeTerminal', sessionId, rows, cols),

  close: (sessionId: string) =>
    wailsCall<void>('CloseTerminal', sessionId),
}

export const mockServer = {
  getPort: () =>
    wailsCall<number>('GetServerPort'),

  createRule: (rule: MockRule) =>
    wailsCall<void>('CreateMockRule', rule),

  getRules: () =>
    wailsCall<MockRule[]>('GetMockRules'),

  toggleRule: (id: string) =>
    wailsCall<void>('ToggleMockRule', id),

  deleteRule: (id: string) =>
    wailsCall<void>('DeleteMockRule', id),
}

export const events = Events
```

### 4.3 HTTP API 客户端（Gin REST API 调用）[新增]

```typescript
// frontend/src/api/client.ts
import type { ApiResponse } from './types'

// HTTP 客户端配置
const BASE_URL = `http://127.0.0.1:${await getServerPort()}`

// 获取 Gin 服务器端口
async function getServerPort(): Promise<number> {
  // @ts-expect-error Wails 运行时注入
  const port = await window.go.main.App.GetServerPort()
  return port || 18080
}

// 统一 HTTP 客户端
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = `http://127.0.0.1:${await getServerPort()}`
  const url = `${baseUrl}${path}`

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string>),
    },
  })

  const data: ApiResponse<T> = await response.json()

  if (data.code !== 0) {
    throw new ApiError(data.code, data.message || 'Unknown error')
  }

  return data.data as T
}

// HTTP 方法快捷封装
export const http = {
  get: <T>(path: string) =>
    request<T>(path, { method: 'GET' }),

  post: <T>(path: string, body?: any) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: any) =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
}

// 自定义 API 错误
export class ApiError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}
```

```typescript
// frontend/src/api/mock.ts
import { http } from './client'
import type { MockRule, PageData } from './types'

export const mockApi = {
  // 获取 Mock 规则列表
  listRules: () =>
    http.get<MockRule[]>('/api/v1/mock/rules'),

  // 创建 Mock 规则
  createRule: (rule: Omit<MockRule, 'id' | 'createdAt' | 'updatedAt'>) =>
    http.post<MockRule>('/api/v1/mock/rules', rule),

  // 更新 Mock 规则
  updateRule: (id: string, rule: Partial<MockRule>) =>
    http.put<MockRule>(`/api/v1/mock/rules/${id}`, rule),

  // 删除 Mock 规则
  deleteRule: (id: string) =>
    http.delete<void>(`/api/v1/mock/rules/${id}`),

  // 切换规则启用状态
  toggleRule: (id: string) =>
    http.post<void>(`/api/v1/mock/rules/${id}/toggle`),

  // 批量导入
  importRules: (rules: MockRule[]) =>
    http.post<{ imported: number }>('/api/v1/mock/rules/import', rules),

  // 导出所有规则
  exportRules: () =>
    http.get<MockRule[]>('/api/v1/mock/rules/export'),

  // 清空所有规则
  clearRules: () =>
    http.delete<void>('/api/v1/mock/rules/clear'),
}
```

```typescript
// frontend/src/api/types.ts
// API 层通用类型

export interface ApiResponse<T = any> {
  code: number
  message: string
  data?: T
}

export interface PageData<T = any> {
  items: T[]
  total: number
  page: number
  size: number
}
```

### 4.4 通用 Hook：双通道调用封装 [更新]

```typescript
// frontend/src/shared/hooks/useWailsCall.ts
import { useState, useCallback, useRef } from 'react'

interface UseWailsCallOptions {
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
}

interface UseWailsCallReturn<T, Args extends any[]> {
  data: T | null
  error: Error | null
  loading: boolean
  execute: (...args: Args) => Promise<T | null>
  reset: () => void
}

/**
 * Wails IPC 方法调用 Hook
 * 适用于：桌面级方法调用（终端、数据库查询等）
 */
export function useWailsCall<T, Args extends any[] = any[]>(
  method: (...args: Args) => Promise<T>,
  options: UseWailsCallOptions = {},
): UseWailsCallReturn<T, Args> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setLoading(true)
      setError(null)

      try {
        const result = await method(...args)
        if (mountedRef.current) {
          setData(result)
          options.onSuccess?.(result)
        }
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        if (mountedRef.current) {
          setError(error)
          options.onError?.(error)
        }
        return null
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [method, options],
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { data, error, loading, execute, reset }
}
```

```typescript
// frontend/src/shared/hooks/useHttpClient.ts [新增]
import { useState, useCallback, useRef } from 'react'
import { ApiError } from '../../api/client'

interface UseHttpOptions {
  onSuccess?: (data: any) => void
  onError?: (error: ApiError) => void
  immediate?: boolean
}

interface UseHttpReturn<T, Args extends any[]> {
  data: T | null
  error: ApiError | null
  loading: boolean
  execute: (...args: Args) => Promise<T | null>
  reset: () => void
}

/**
 * Gin HTTP API 调用 Hook
 * 适用于：RESTful API 调用（Mock 管理、代码片段 CRUD 等）
 */
export function useHttp<T, Args extends any[] = any[]>(
  apiMethod: (...args: Args) => Promise<T>,
  options: UseHttpOptions = {},
): UseHttpReturn<T, Args> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setLoading(true)
      setError(null)

      try {
        const result = await apiMethod(...args)
        if (mountedRef.current) {
          setData(result)
          options.onSuccess?.(result)
        }
        return result
      } catch (err) {
        const apiError = err instanceof ApiError
          ? err
          : new ApiError(500, String(err))

        if (mountedRef.current) {
          setError(apiError)
          options.onError?.(apiError)
        }
        return null
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [apiMethod, options],
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { data, error, loading, execute, reset }
}
```

### 4.5 事件监听封装

```typescript
// frontend/src/wails/events.ts
type EventCallback = (data: any) => void

export const Events = {
  on(name: string, callback: EventCallback): () => void {
    // @ts-expect-error Wails 运行时注入
    const cancel = window.runtime.EventsOn(name, callback)
    return cancel
  },

  once(name: string, callback: EventCallback): () => void {
    // @ts-expect-error Wails 运行时注入
    return window.runtime.EventsOnce(name, callback)
  },

  off(name: string, callback?: EventCallback): void {
    // @ts-expect-error Wails 运行时注入
    window.runtime.EventsOff(name, callback)
  },
}
```

### 4.6 模块 Store 示例（Zustand）

```typescript
// frontend/src/modules/api-tester/store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../../wails'
import type { ApiRequest, ApiResponse } from './types'

interface ApiTesterState {
  currentRequest: ApiRequest
  response: ApiResponse | null
  loading: boolean
  history: ApiRequest[]
  collections: Collection[]

  updateRequest: (partial: Partial<ApiRequest>) => void
  sendRequest: () => Promise<void>
  clearResponse: () => void
  loadFromHistory: (req: ApiRequest) => void
}

export const useApiTesterStore = create<ApiTesterState>()(
  persist(
    (set, get) => ({
      currentRequest: {
        method: 'GET',
        url: '',
        headers: { 'Content-Type': 'application/json' },
        body: '',
        params: {},
      },
      response: null,
      loading: false,
      history: [],
      collections: [],

      updateRequest: (partial) =>
        set((state) => ({
          currentRequest: { ...state.currentRequest, ...partial },
        })),

      sendRequest: async () => {
        const { currentRequest } = get()
        set({ loading: true, response: null })

        try {
          const resp = await api.executeRequest(currentRequest)
          set({ response: resp, loading: false })

          set((state) => ({
            history: [
              { ...currentRequest, id: generateId(), timestamp: Date.now() },
              ...state.history,
            ].slice(0, 100),
          }))
        } catch (err) {
          set({ loading: false })
          throw err
        }
      },

      clearResponse: () => set({ response: null }),
      loadFromHistory: (req) => set({ currentRequest: req }),
    }),
    {
      name: 'api-tester-storage',
      partialize: (state) => ({
        history: state.history.slice(0, 50),
        collections: state.collections,
      }),
    },
  ),
)
```

```typescript
// frontend/src/modules/mock-server/store.ts [新增]
import { create } from 'zustand'
import { mockApi } from '../../api/mock'
import { mockServer } from '../../wails'
import { events } from '../../wails/events'
import type { MockRule } from './types'

interface MockServerState {
  serverPort: number
  serverRunning: boolean
  rules: MockRule[]
  loading: boolean

  init: () => Promise<void>
  addRule: (rule: Omit<MockRule, 'id'>) => Promise<void>
  updateRule: (rule: MockRule) => Promise<void>
  deleteRule: (id: string) => Promise<void>
  toggleRule: (id: string) => Promise<void>
  refreshRules: () => Promise<void>
}

export const useMockServerStore = create<MockServerState>()((set, get) => ({
  serverPort: 0,
  serverRunning: false,
  rules: [],
  loading: false,

  init: async () => {
    // 获取服务器端口
    const port = await mockServer.getPort()
    set({ serverPort: port, serverRunning: port > 0 })

    // 加载规则（优先通过 HTTP API，更完整）
    try {
      const rules = await mockApi.listRules()
      set({ rules })
    } catch {
      // fallback: 通过 IPC 获取
      const rules = await mockServer.getRules()
      set({ rules })
    }

    // 监听 Mock 规则命中事件
    events.on('mock:rule:matched', (data: { ruleId: string }) => {
      set((state) => ({
        rules: state.rules.map((r) =>
          r.id === data.ruleId ? { ...r, lastMatched: Date.now() } : r,
        ),
      }))
    })
  },

  addRule: async (rule) => {
    set({ loading: true })
    try {
      const created = await mockApi.createRule(rule as any)
      set((state) => ({ rules: [...state.rules, created] }))
    } finally {
      set({ loading: false })
    }
  },

  updateRule: async (rule) => {
    await mockApi.updateRule(rule.id, rule)
    set((state) => ({
      rules: state.rules.map((r) => (r.id === rule.id ? rule : r)),
    }))
  },

  deleteRule: async (id) => {
    await mockApi.deleteRule(id)
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== id),
    }))
  },

  toggleRule: async (id) => {
    await mockApi.toggleRule(id)
    set((state) => ({
      rules: state.rules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r,
      ),
    }))
  },

  refreshRules: async () => {
    const rules = await mockApi.listRules()
    set({ rules })
  },
}))
```

### 4.7 终端模块（xterm.js 集成）

```typescript
// frontend/src/modules/terminal/components/TerminalView.tsx
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { terminal, events } from '../../../wails'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
}

export function TerminalView({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
      },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    const unlisten = events.on('terminal:output',
      (data: { sessionId: string; data: string }) => {
        if (data.sessionId === sessionId) {
          term.write(data.data)
        }
      })

    const unlistenExit = events.on('terminal:exit',
      (data: { sessionId: string; exitCode: number }) => {
        if (data.sessionId === sessionId) {
          term.write(`\r\n\x1b[90m[Process exited with code ${data.exitCode}]\x1b[0m\r\n`)
        }
      })

    term.onData((data) => {
      terminal.write(sessionId, data)
    })

    const resizeObserver = new ResizeObserver(() => {
      fit.fit()
      if (termRef.current && fitRef.current) {
        terminal.resize(sessionId, term.rows, term.cols)
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      unlisten()
      unlistenExit()
      term.dispose()
    }
  }, [sessionId])

  return <div ref={containerRef} className="h-full w-full" />
}
```

### 4.8 路由配置（含 Mock Server）

```typescript
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './shared/components/Layout'
import { ApiTesterPage } from './modules/api-tester/pages'
import { CodegenPage } from './modules/codegen/pages'
import { DatabasePage } from './modules/database/pages'
import { TerminalPage } from './modules/terminal/pages'
import { MockServerPage } from './modules/mock-server/pages' // 新增

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<ApiTesterPage />} />
          <Route path="/codegen" element={<CodegenPage />} />
          <Route path="/database" element={<DatabasePage />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="/mock-server" element={<MockServerPage />} /> {/* 新增 */}
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
```

---

## 5. 数据流设计

### 5.1 IPC 调用流（Wails Binding）

```
Frontend                    Wails Runtime              Go Backend
   │                            │                          │
   │  ExecuteRequest(req)       │                          │
   │───────────────────────────>│                          │
   │                            │  App.ExecuteRequest(req) │
   │                            │─────────────────────────>│
   │                            │                          │── Service 层
   │                            │                          │── HTTP Client
   │                            │                          │── Store 持久化
   │                            │  <Response, nil>         │
   │                            │<─────────────────────────│
   │  <Response>                │                          │
   │<───────────────────────────│                          │
```

### 5.2 HTTP API 调用流（Gin）[新增]

```
Frontend (React)             Gin HTTP Server              Go Backend
   │                            │                          │
   │  GET /api/v1/mock/rules    │                          │
   │  (fetch → http://127.0.0.1:port)                     │
   │───────────────────────────>│                          │
   │                            │  Gin Router 匹配          │
   │                            │  中间件链执行:            │
   │                            │    Recovery               │
   │                            │    RequestLogger           │
   │                            │    CORS                   │
   │                            │                          │
   │                            │  MockHandler.ListRules()  │
   │                            │─────────────────────────>│
   │                            │                          │── Mock Engine
   │                            │                          │── Store 层
   │                            │  <- rules                 │
   │                            │<─────────────────────────│
   │                            │  response.OK(c, rules)    │
   │                            │  统一 JSON 响应            │
   │  { code: 0, data: [...] } │                          │
   │<───────────────────────────│                          │
```

### 5.3 Mock 请求拦截流 [新增]

```
外部客户端 (Postman/curl)         Gin Server              Mock Engine
   │                                │                        │
   │  POST /mock/api/users          │                        │
   │───────────────────────────────>│                        │
   │                                │  Match("POST",         │
   │                                │       "/api/users")    │
   │                                │───────────────────────>│
   │                                │                        │
   │                                │                        │── 规则匹配:
   │                                │                        │   1. 精确匹配
   │                                │                        │   2. 前缀匹配
   │                                │                        │   3. 正则匹配
   │                                │                        │
   │                                │  <rule, matched>        │
   │                                │<───────────────────────│
   │                                │                        │
   │                                │  EventsEmit(           │
   │                                │    "mock:rule:matched")│
   │                                │                        │
   │  { statusCode, body, headers } │                        │
   │<───────────────────────────────│                        │
```

### 5.4 终端数据流（实时双向）

```
Frontend (xterm.js)        Wails Runtime              Go Backend (pty)
   │                            │                          │
   │  term.onData(input)        │                          │
   │───────────────────────────>│                          │
   │                            │  WriteTerminal(sid, data)│
   │                            │─────────────────────────>│
   │                            │                          │── pty.Write()
   │                            │                          │── 读取输出
   │  terminal:output           │  EventsEmit(...)         │
   │<───────────────────────────│<─────────────────────────│
   │  term.write(data)          │                          │
```

### 5.5 双通道调用策略 [新增]

```
调用场景选择决策树：

需要调用 Go 方法？
├── 是 → 需要 WebSocket/双向流？
│        ├── 是 → Wails IPC + 事件系统（终端、实时推送）
│        └── 否 → 仅桌面内调用？
│                 ├── 是 → Wails IPC（数据库查询、文件操作）
│                 └── 否 → Gin HTTP API（Mock 管理、代码片段、插件扩展）
└── 否 → 前端内部处理
```

| 场景 | 通道 | 理由 |
|------|------|------|
| 发送 HTTP 请求（API Tester） | Wails IPC | 通过 Resty 完整控制 HTTP 客户端 |
| 数据库查询 | Wails IPC | 桌面内操作，低延迟 |
| 终端交互 | Wails IPC + 事件 | 双向实时流 |
| Mock 规则管理 | Gin HTTP | 外部也可调用，RESTful 语义 |
| Mock 请求拦截 | Gin HTTP | 必须是 HTTP 服务器 |
| 代码片段 CRUD | Gin HTTP | 外部工具可集成 |
| 代理转发 | Gin HTTP | Resty 转发请求（解决跨域） |
| 插件扩展 API | Gin HTTP | 标准化接口 |

---

## 6. Gin REST API 参考 [新增]

### 6.1 API 端点一览

```
基础路径: http://127.0.0.1:{port}

健康检查
  GET  /health                              健康状态

Mock 规则管理
  GET     /api/v1/mock/rules                获取规则列表
  POST    /api/v1/mock/rules                创建规则
  PUT     /api/v1/mock/rules/:id            更新规则
  DELETE  /api/v1/mock/rules/:id            删除规则
  POST    /api/v1/mock/rules/:id/toggle     切换启用状态
  POST    /api/v1/mock/rules/import         批量导入
  GET     /api/v1/mock/rules/export         导出全部
  DELETE  /api/v1/mock/rules/clear          清空全部

Mock 请求拦截（动态路由）
  ANY     /mock/*path                       拦截并返回 Mock 数据

代码片段管理
  GET     /api/v1/snippets                  片段列表
  GET     /api/v1/snippets/:id              片段详情
  POST    /api/v1/snippets                  创建片段
  PUT     /api/v1/snippets/:id              更新片段
  DELETE  /api/v1/snippets/:id              删除片段

代理转发
  ANY     /api/v1/proxy/*path               请求转发（解决跨域）
```

### 6.2 请求/响应示例

```
POST /api/v1/mock/rules
Request:
{
  "name": "获取用户列表",
  "method": "GET",
  "path": "/api/users",
  "match_type": "exact",
  "delay": 200,
  "response": {
    "status_code": 200,
    "content_type": "application/json",
    "body_type": "json",
    "body_raw": "{\"users\":[{\"id\":1,\"name\":\"Alice\"}]}",
    "headers": {
      "X-Mock": "true"
    }
  }
}

Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "mock_a1b2c3d4",
    "name": "获取用户列表",
    "method": "GET",
    "path": "/api/users",
    "match_type": "exact",
    "enabled": true,
    "delay": 200,
    "response": { ... },
    "created_at": "2026-03-13T18:00:00Z",
    "updated_at": "2026-03-13T18:00:00Z"
  }
}
```

```
GET /health
Response:
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "uptime_seconds": 3600,
    "mock_rules_count": 12,
    "gin_version": "1.10.0"
  }
}
```

---

## 7. 代码规范

### 7.1 Go 后端规范

```markdown
## 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 包名 | 小写单词，不缩写 | `database` 而非 `db` |
| 文件名 | 小写蛇形 | `connection_manager.go` |
| 接口 | 名词 | `Repository`, `Service` |
| 结构体 | PascalCase | `ConnectionManager` |
| 方法 | PascalCase（导出）/ camelCase（私有） | `Execute()` / `parseResponse()` |
| 常量 | PascalCase（导出）/ camelCase（私有） | `MaxRetryCount` / `defaultTimeout` |
| 错误变量 | Err前缀 | `var ErrConnectionFailed` |
| Gin Handler 函数 | 动词 + 名词 | `ListRules`, `CreateRule` |
| Gin 路由组 | 小写名词 | `v1.Group("mock")` |

## 方法签名规范

// Service 层方法：必须接受 context.Context 作为第一个参数
func (s *Service) Execute(ctx context.Context, req *Request) (*Response, error)

// Wails Binding 方法：参数/返回值必须是可序列化类型
func (a *App) ExecuteRequest(req Request) (Response, error)

// Gin Handler 方法：遵循 gin.HandlerFunc 签名
func (h *MockHandler) ListRules(c *gin.Context) {
    // ...
}

## Gin 路由注册规范

// ✅ 路由集中在 router.go 注册，Handler 只负责业务逻辑
// ✅ 使用版本化路径: /api/v1/...
// ✅ 资源路径用名词复数: /rules, /snippets
// ✅ 中间件按需挂载，不要全部全局

// ❌ 不要在 Handler 里写业务逻辑，委托给 Service 层
func (h *Handler) CreateRule(c *gin.Context) {
    var rule Rule
    if err := c.ShouldBindJSON(&rule); err != nil {
        response.Fail(c, response.CodeInvalidParam, err.Error())
        return
    }
    // ✅ 调用 Service 层
    if err := h.svc.AddRule(&rule); err != nil {
        response.ServerError(c, err)
        return
    }
    response.OK(c, rule)
}

## 错误处理

// ❌ 不要吞掉错误
result, _ := doSomething()

// ✅ 正确处理错误（包装上下文）
result, err := doSomething()
if err != nil {
    return nil, fmt.Errorf("doSomething failed: %w", err)
}

// ✅ Gin Handler 错误处理：使用统一 response 包
if err != nil {
    response.ServerError(c, err)  // 自动记录日志 + 返回 500
    return
}

## 并发规范

// ✅ 使用 context 控制超时
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()

// ✅ 共享状态加锁
mu sync.RWMutex
mu.RLock()
defer mu.RUnlock()
```

### 7.2 TypeScript 前端规范

```markdown
## 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase.tsx | `RequestEditor.tsx` |
| 工具文件 | camelCase.ts | `formatDate.ts` |
| Hook 文件 | use前缀 | `useWailsCall.ts`, `useHttp.ts` |
| 类型文件 | camelCase.ts | `apiRequest.ts` |
| Store 文件 | camelCase.ts | `store.ts` |
| API 文件 | camelCase.ts | `mock.ts`, `snippet.ts` |
| 组件名 | PascalCase | `export function RequestEditor()` |
| Hook 名 | use前缀 | `export function useRequest()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_HISTORY_SIZE` |

## 通道选择规范

// ✅ 桌面内操作、实时流 → Wails IPC
import { api, terminal } from '../../wails'
const resp = await api.executeRequest(req)

// ✅ RESTful CRUD、Mock 管理 → HTTP API
import { mockApi } from '../../api/mock'
const rules = await mockApi.listRules()

// ❌ 不要用 Wails IPC 调用 CRUD（语义不清晰）
// ❌ 不要用 HTTP API 调用终端操作（无法双向流）

## 组件规范

interface Props {
  requestId: string
  onSend: (req: ApiRequest) => void
}

export function RequestEditor({ requestId, onSend }: Props): JSX.Element {
  return <form>...</form>
}

## 状态管理规范

// ✅ 全局状态 → Zustand store
// ✅ 模块状态 → 模块级 store
// ✅ 组件局部状态 → useState / useReducer
// ❌ 不要用 Context 做业务状态管理

## 样式规范

// ✅ 优先 Tailwind 工具类
<div className="flex items-center gap-2 rounded-lg bg-surface px-4 py-2">

// ✅ 复杂动画 → CSS Module
import styles from './RequestEditor.module.css'

// ❌ 不要内联 style 对象
```

### 7.3 Git 分支与提交规范

```
主分支:  main            ← 稳定发布版本
开发分支: develop         ← 集成分支
功能分支: feature/xxx     ← 新功能
修复分支: fix/xxx         ← Bug 修复
发布分支: release/vX.Y.Z  ← 版本发布
```

```
# Commit Message 规范（Conventional Commits）
feat(mock): add mock server with Gin routes
feat(mock): support regex and prefix route matching
feat(server): add rate limit middleware
fix(api): resolve CORS issue in proxy handler
refactor(handler): extract unified response package
docs(api): add REST API reference
chore(deps): upgrade gin to v1.10.0
```

---

## 8. 模块复用策略

### 8.1 后端复用

```
复用层次              机制                      示例
───────────────────────────────────────────────────────────
接口抽象              Go Interface              Repository[T, ID]
泛型仓库              Go 泛型                   GenericRepository[T]
Gin 统一响应           response 包               response.OK() / response.Fail()
Gin 中间件             可组合中间件链             Logger + CORS + RateLimit
Resty HTTP 客户端       请求/响应拦截器           API Tester + 代理共用
事件总线               统一 EventBus             全局事件分发（IPC + 内部）
配置管理               Viper                     所有服务共用
日志系统               zerolog                   结构化日志
Mock 引擎              可插拔 Matcher            规则匹配策略
插件系统               Gin RouterGroup 扩展      插件注册自定义路由
```

### 8.2 前端复用

```
复用层次              机制                      示例
───────────────────────────────────────────────────────────
IPC 调用              useWailsCall              终端、数据库查询
HTTP 调用             useHttp                   Mock 管理、代码片段
HTTP 客户端            http.get/post/put/delete  统一 fetch 封装
共享组件              shared/components         CodeEditor / DataTable
类型定义              shared/types              前后端一致类型
样式系统              Tailwind                  设计 token
主题管理              useTheme                  暗色/亮色切换
```

### 8.3 前后端类型同步

```markdown
策略：Go 结构体 ↔ TypeScript interface，通过 JSON 序列化自动对齐

Go:
  type MockRule struct {
      Method    string       `json:"method"`
      Path      string       `json:"path"`
      MatchType MatchType    `json:"match_type"`
      Response  MockResponse `json:"response"`
  }

TypeScript:
  interface MockRule {
      method: string
      path: string
      match_type: 'exact' | 'prefix' | 'regex'
      response: MockResponse
  }

规则：
1. Go 结构体使用 json tag
2. TypeScript interface 字段使用 snake_case（与 JSON tag 一致）
3. 枚举值使用字符串，Go 侧用自定义类型，TS 侧用联合类型
4. Gin Handler 使用 ShouldBindJSON 自动绑定
```

---

## 9. 构建与发布

### 9.1 Wails 配置

```json
// wails.json
{
  "$schema": "https://wails.io/schemas/config.v2.json",
  "name": "DevPilot",
  "outputfilename": "devpilot",
  "frontend:install": "npm install",
  "frontend:build": "npm run build",
  "frontend:dev:watcher": "npm run dev",
  "frontend:dev:serverUrl": "auto",
  "author": {
    "name": "DevPilot Team"
  },
  "info": {
    "companyName": "DevPilot",
    "productName": "DevPilot Desktop",
    "productVersion": "1.0.0",
    "copyright": "Copyright 2026 DevPilot",
    "comments": "Backend Development Assistant"
  }
}
```

### 9.2 构建命令

```makefile
# Makefile
.PHONY: dev build clean lint test

# 开发模式（热重载）
dev:
	wails dev

# 构建
build:
	wails build

# 构建全平台
build-all:
	wails build -platform darwin/amd64,darwin/arm64,windows/amd64,linux/amd64

# 清理
clean:
	rm -rf build/bin frontend/dist

# 代码生成
generate:
	wails generate module

# 代码检查
lint:
	golangci-lint run ./...
	cd frontend && npm run lint

# 测试
test:
	go test ./... -v -race -cover
	cd frontend && npm test -- --passWithNoTests

# Gin API 文档（可选：swag）
docs:
	swag init -g main.go -o docs/swagger

# 依赖检查
deps:
	go mod tidy
	go mod verify
	cd frontend && npm audit
```

### 9.3 预期产物大小

| 平台 | 格式 | 预估大小 |
|------|------|----------|
| macOS (arm64) | .app | ~14MB（含 Gin） |
| macOS (amd64) | .app | ~16MB |
| Windows (amd64) | .exe | ~12MB |
| Linux (amd64) | AppImage | ~13MB |

---

## 10. 安全考虑

| 风险 | 应对策略 |
|------|----------|
| 数据库凭证明文存储 | 系统关键链（macOS）/ 凭证管理器（Windows）加密 |
| API 请求中敏感 Header | UI 遮罩（`Bearer sk-a1b2****`） |
| 终端命令注入 | 用户手动触发，不自动执行 |
| 插件系统安全 | 插件受限 API（AppContext），不能直接访问文件系统 |
| XSS | Monaco 沙箱 + Xterm 不解析 HTML |
| Gin 端口暴露 | 仅绑定 `127.0.0.1`，不监听 `0.0.0.0` |
| 限流滥用 | RateLimit 中间件保护管理 API |
| Mock 数据注入 | Mock 路由仅在 `/mock/*` 前缀下生效，不影响全局路由 |

---

## 11. 性能考量

| 场景 | 策略 |
|------|------|
| 大响应体渲染 | 分块渲染 + 虚拟滚动 |
| 请求历史列表 | 分页加载 + SQLite 索引 |
| 终端输出频率 | 50ms 批量合并，减少 IPC 次数 |
| 代码生成模板 | 预编译 + 缓存 |
| 前端 bundle | 路由级 code split，Monaco 异步加载 |
| 数据库连接池 | 最大 5 并发，空闲 5 分钟超时 |
| Gin 并发模型 | Gin 内置协程池，无需额外配置 |
| Mock 规则匹配 | 读写锁 + 精确匹配优先（O(n)，n 通常 < 100） |

---

## 12. 扩展路线

```
Phase 1 (MVP)
├── API Tester（HTTP 请求调试）
├── 代码生成器（Go/SQL/HTTP）
├── 本地 SQLite 存储
└── Gin 嵌入式 HTTP 服务

Phase 2
├── Mock Server（规则管理 + 动态路由）
├── 数据库管理（MySQL/PostgreSQL/SQLite）
├── 集成终端
├── 代码片段管理（REST API）
└── 主题系统

Phase 3
├── 插件系统（Gin RouterGroup 扩展）
├── API 代理（跨域/CORS 解决）
├── Team Collaboration（配置导入导出）
├── gRPC 支持
└── GraphQL 支持

Phase 4
├── AI 辅助（SQL 生成、API 文档、Mock 数据生成）
├── WebSocket 调试
├── 环境变量管理
└── Swagger UI（自动 API 文档）
```

---

## 13. Go 依赖清单

```go
// go.mod
module devpilot

go 1.23

require (
    github.com/wailsapp/wails/v2     v2.11.0   // 桌面框架
    github.com/gin-gonic/gin         v1.10.0   // HTTP 框架
    github.com/gin-contrib/cors      v1.7.3    // CORS 中间件
    github.com/go-resty/resty/v2     v2.16.0   // HTTP 客户端（API 调试 + 代理）
    github.com/rs/zerolog             v1.33.0   // 结构化日志
    github.com/spf13/viper            v1.19.0   // 配置管理
    github.com/creack/pty             v1.1.24   // 伪终端
    github.com/russross/blackfriday   v2.1.0    // Markdown 渲染（代码片段）
    github.com/go-playground/validator/v10 v10.23.0 // 参数校验
    github.com/mattn/go-sqlite3       v1.14.24  // SQLite 驱动
    modernc.org/sqlite                v1.34.5   // 纯 Go SQLite（跨平台编译）
    golang.org/x/crypto               v0.31.0   // 加密工具
    golang.org/x/term                 v0.27.0   // 终端工具
)
```

---

> **架构原则总结**：模块化边界清晰、依赖注入贯穿、接口先行、双通道通信（Wails IPC + Gin HTTP）、类型安全贯穿前后端、Mock 引擎可扩展、插件通过 Gin 路由组注册自定义端点。
