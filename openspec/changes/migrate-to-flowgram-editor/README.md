# 迁移到 Flowgram.ai 编辑器

> 将 DevPilot RuleGo 规则链编辑器从 Blockly/Scratch-blocks 完全重写为 Flowgram.ai 自由布局编辑器

## 📋 项目概览

**目标**：打造一个视觉现代、交互流畅、功能完整的规则链编辑器，同时保持与后端 RuleGo 引擎 100% 兼容。

**核心收益**：
- ✨ 现代化的白色卡片式节点设计
- 🎨 Loop 容器节点采用 Flowgram 风格（黄色渐变背景）
- 🔗 灵活的自由布局和连线系统
- 📐 对齐辅助线、小地图等高级功能
- 🧩 插件化架构，易扩展

**兼容性承诺**：
- ✅ 后端 RuleGo DSL 格式完全不变
- ✅ 所有现有规则链无需迁移即可使用
- ✅ 后端引擎零改动

---

## 📁 文档结构

本 OpenSpec 变更包含以下文档：

### [proposal.md](./proposal.md)
项目提案，包括：
- 背景与动机（为什么要重写）
- 范围界定（做什么，不做什么）
- 技术方案概览
- 风险与缓解
- 里程碑
- 备选方案对比

### [design.md](./design.md)
架构设计文档，包括：
- 系统架构图
- 目录结构设计
- 核心模块设计（编辑器、节点、DSL 适配层）
- **Loop 容器节点详细设计（★ 重点）**
- 插件系统配置
- 数据流设计
- 关键技术决策

### [specs/](./specs/)
技术规格说明，包括：

#### [01-core-editor.md](./specs/01-core-editor.md)
- RuleGoFreeEditorPage 组件规格
- useRuleGoEditorProps Hook 规格
- 插件配置详细规格
- 性能要求
- 测试用例

#### [02-node-system.md](./specs/02-node-system.md)
- RuleGoNodeRegistry 接口定义
- 33 个节点的转换清单
- 节点模板和示例
- 特殊节点（容器、多分支）详细规格
- 节点类型映射表

#### [03-dsl-adapter.md](./specs/03-dsl-adapter.md)
- RuleGo DSL 格式完整定义
- buildRuleGoDsl 算法与实现
- loadRuleGoDsl 算法与实现
- 容器节点特殊处理逻辑
- 连接类型映射
- 错误处理

#### [04-ui-components.md](./specs/04-ui-components.md)
- 样式系统架构（CSS Variables + Styled Components）
- BaseNode 基础组件
- **Loop 容器节点渲染组件和样式（★ 完全采用 Flowgram 风格）**
- NodePanel 节点面板
- Toolbar 工具栏
- Sidebar 配置侧边栏
- 表单组件库
- 动画系统

#### [05-testing-strategy.md](./specs/05-testing-strategy.md)
- 测试金字塔（单元/集成/E2E）
- DSL 转换测试套件
- 节点注册表测试
- 回归测试（生产规则兼容性）
- 性能测试
- CI/CD 集成
- 质量门禁

### [tasks.md](./tasks.md)
详细的任务分解，包括：
- 9 个 Phase，35+ 个具体任务
- 每个任务的描述、步骤、验收标准、依赖、预估时间
- 任务依赖图
- 里程碑定义
- 并行开发策略（2-3 人团队）
- 风险缓解任务
- 最终检查清单

---

## 🎯 关键特性

### Loop 容器节点（★ 核心亮点）

这是本次重写最重要的改进点，完全采用 Flowgram demo-free-layout 中 Loop 节点的设计：

**视觉效果**：
- 白色卡片容器 + 8px 圆角 + 双层投影
- 头部区域：循环图标 + 节点名称 + 配置摘要
- 子画布区域：黄色渐变背景（#fef3c7 → #fde68a → transparent）
- "Do 循环体" 标签（黄色背景，橙色文字）
- 选中态：蓝色边框 + 蓝色光晕
- 错误态：红色边框 + 红色错误图标

**功能特性**：
- 支持范围表达式（`1..10`）、变量（`${items}`）、数组
- 4 种执行模式：忽略/追加/覆盖/异步
- 可在容器内拖入任意节点构建循环体
- BlockStart/BlockEnd 标记循环体的起点和终点

**技术实现**：
- 使用 `@flowgram.ai/free-container-plugin`
- `isContainer: true` 启用容器功能
- `padding` 函数定义子画布区域
- `SubCanvasRender` 渲染嵌套画布
- DSL 中通过 `type: 'Do'` 连接表示循环体

详细设计见 [design.md](./design.md) 和 [specs/04-ui-components.md](./specs/04-ui-components.md)。

---

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                   RuleGo Free Layout Editor                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户界面层 (React Components)                               │
│  ├─ RuleGoFreeEditorPage (主页面)                           │
│  ├─ Toolbar (工具栏)                                         │
│  ├─ NodePanel (节点面板)                                     │
│  └─ Sidebar (配置侧边栏)                                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  编辑器引擎层 (@flowgram.ai/free-layout-editor)              │
│  ├─ NodeManager (节点管理)                                   │
│  ├─ LineManager (连线管理)                                   │
│  ├─ PortManager (端口管理)                                   │
│  └─ HistoryManager (撤销/重做)                               │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  节点系统层 (FlowNodeRegistry[])                             │
│  ├─ 33 个节点类型定义                                        │
│  ├─ ForLoop 容器节点 ★                                      │
│  └─ Switch/Fork/Join 多分支节点                             │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  DSL 适配层 (保持后端兼容)                                    │
│  ├─ buildRuleGoDsl() (Flowgram → RuleGo DSL)               │
│  └─ loadRuleGoDsl() (RuleGo DSL → Flowgram)                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  后端层 (完全不变)                                            │
│  └─ RuleGo Engine + API                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 从哪里开始？

**如果你想立即开始开发**：
1. 阅读 [tasks.md](./tasks.md) 的 Phase 0 部分
2. 执行 T0.1（依赖安装）
3. 执行 T0.2（创建目录）
4. 执行 T1.1（主编辑器组件）

**如果你想先验证可行性**：
1. 阅读 [design.md](./design.md) 的 Loop 容器节点设计
2. 执行风险缓解任务 R2（早期 PoC）
3. 创建一个最小的 Loop 节点原型
4. 验证样式和 DSL 转换

**如果你想深入理解设计**：
1. 先读 [proposal.md](./proposal.md) 了解全局
2. 再读 [design.md](./design.md) 了解架构
3. 最后读 [specs/](./specs/) 了解细节

---

## 📊 进度追踪

使用 OpenSpec CLI 查看进度：

```bash
# 查看变更状态
openspec status migrate-to-flowgram-editor

# 查看所有任务
openspec show migrate-to-flowgram-editor --tasks

# 查看完成度
openspec list --changes
```

---

## 🧪 测试策略

详见 [specs/05-testing-strategy.md](./specs/05-testing-strategy.md)

**测试金字塔**：
- 60% 单元测试（200+ cases）
- 30% 集成测试（50 cases）
- 10% E2E 测试（10 cases）

**质量门禁**：
- 代码覆盖率 ≥ 85%
- 生产规则兼容性 ≥ 95%
- 性能测试达标
- 无 P0/P1 bug

---

## ⚠️ 风险与缓解

### 高风险

1. **DSL 转换出错** → 完整测试 + 回归测试
2. **容器节点复杂度高** → 提前研究 + PoC 验证
3. **开发周期长** → Feature Flag + 渐进式交付

详见 [proposal.md](./proposal.md) 的风险章节。

---

## 📅 里程碑

- **M1 (Week 2)**: 基础框架可用
- **M2 (Week 3)**: ForLoop 容器节点完成 ★
- **M3 (Week 6)**: 所有节点完成
- **M4 (Week 8 中)**: 测试完成
- **M5 (Week 8 末)**: 生产就绪

---

## 🤝 团队协作

### 2 人并行开发

**开发者 A（资深）**：
- 核心框架
- DSL 适配层
- ForLoop 容器节点

**开发者 B（中级）**：
- 简单节点实现
- UI 组件开发
- 批量节点转换

详见 [tasks.md](./tasks.md) 的并行开发策略。

---

## 📞 联系方式

**项目负责人**：[待定]

**技术支持**：
- Flowgram 文档: https://github.com/bytedance/flowgram.ai
- Demo 示例: https://github.com/bytedance/flowgram.ai/tree/main/apps/demo-free-layout

**问题反馈**：
- 在项目 Issue 中提出
- 或在团队群组讨论

---

## 📜 许可

本项目使用 MIT License。

Flowgram.ai 也是 MIT License，我们可以自由使用和修改。

---

## 🎉 开始行动

准备好了吗？让我们开始这个激动人心的重写之旅！

**建议的第一步**：
```bash
# 进入前端目录
cd frontend

# 安装 Flowgram 依赖
npm install @flowgram.ai/free-layout-editor @flowgram.ai/free-lines-plugin ...

# 创建目录结构
mkdir -p src/modules/rulego-free/{hooks,nodes,components,dsl,plugins,styles,types,utils}

# 开始开发第一个组件
# 参考 tasks.md 的 T1.1
```

祝开发顺利！🚀
