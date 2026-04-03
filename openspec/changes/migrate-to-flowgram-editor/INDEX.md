# 文档索引

> 所有文档的导航中心，快速找到你需要的内容

## 📚 文档地图

```
migrate-to-flowgram-editor/
│
├─ 📘 INDEX.md (本文件)
│   文档索引和导航中心
│
├─ 🚀 README.md
│   项目介绍、快速开始、核心特性
│   → 适合：新加入的开发者
│   → 阅读时间：5 分钟
│
├─ ⚡ QUICKREF.md
│   5 分钟快速参考指南
│   → 适合：需要快速了解项目的人
│   → 阅读时间：5 分钟
│
├─ 📊 BOARD.md
│   项目看板、进度追踪、任务状态
│   → 适合：项目管理、Daily Standup
│   → 更新频率：每天
│
├─ 📈 overview.md
│   项目总览、规模统计、技术亮点
│   → 适合：向他人介绍项目时使用
│   → 阅读时间：10 分钟
│
├─ 🔮 FUTURE.md
│   技术债务清理、未来规划、演进路线
│   → 适合：长期规划、技术决策
│   → 阅读时间：15 分钟
│
├─ 📋 proposal.md
│   项目提案（为什么要做）
│   ├─ 背景与动机
│   ├─ 范围界定
│   ├─ 技术方案概览
│   ├─ 成功标准
│   ├─ 风险与缓解
│   ├─ 里程碑
│   └─ 备选方案对比
│   → 适合：决策者、项目启动时
│   → 阅读时间：10 分钟
│
├─ 🏗️ design.md
│   架构设计文档（怎么做）
│   ├─ 系统架构图
│   ├─ 目录结构设计
│   ├─ 核心模块设计
│   │   ├─ 编辑器主组件（200+ 行代码）
│   │   ├─ 节点注册表（150+ 行代码）
│   │   └─ DSL 适配层（500+ 行代码）
│   ├─ Loop 容器节点详细设计 ★
│   │   ├─ 完整代码实现（300+ 行）
│   │   ├─ 样式定义（Flowgram 风格）
│   │   └─ DSL 处理逻辑
│   ├─ 插件系统配置
│   ├─ 数据流设计
│   ├─ 节点分类设计
│   ├─ 样式设计规范
│   ├─ 关键技术决策
│   └─ 部署策略
│   → 适合：开发者、技术 Review
│   → 阅读时间：30 分钟
│
├─ ✅ tasks.md
│   任务分解与执行计划（做什么）
│   ├─ Phase 0: 准备工作（3 tasks）
│   ├─ Phase 1: 核心框架（4 tasks）
│   ├─ Phase 2: 第一批核心节点（7 tasks）
│   │   └─ T2.5: ForLoop 容器节点 ★
│   ├─ Phase 3: DSL 适配层（4 tasks）
│   ├─ Phase 4: 第二批节点（4 tasks）
│   ├─ Phase 5: 第三批节点（4 tasks）
│   ├─ Phase 6: UI 组件（4 tasks）
│   ├─ Phase 7: DSL 完善（4 tasks）
│   ├─ Phase 8: 集成与测试（5 tasks）
│   ├─ Phase 9: 收尾与发布（4 tasks）
│   ├─ 任务依赖图
│   ├─ 并行开发策略
│   ├─ 风险缓解任务
│   └─ 最终检查清单
│   → 适合：执行开发、跟踪进度
│   → 阅读时间：20 分钟（首次），5 分钟（日常）
│
└─ 📁 specs/ (技术规格说明)
    │
    ├─ 01-core-editor.md
    │   核心编辑器框架规格
    │   ├─ RuleGoFreeEditorPage 组件
    │   ├─ useRuleGoEditorProps Hook
    │   ├─ 插件配置（9 个插件详细说明）
    │   ├─ 性能要求
    │   ├─ 错误处理
    │   ├─ 兼容性要求
    │   └─ 测试用例
    │   → 适合：开发主编辑器时查阅
    │   → 阅读时间：15 分钟
    │
    ├─ 02-node-system.md
    │   节点系统完整规格
    │   ├─ RuleGoNodeRegistry 接口
    │   ├─ 33 个节点转换清单
    │   ├─ 节点模板（index.ts / form-meta.tsx）
    │   ├─ 特殊节点详细规格
    │   │   ├─ ForLoop 容器节点
    │   │   ├─ Switch 多分支节点
    │   │   ├─ Fork/Join 并行节点
    │   │   └─ GroupAction 节点组
    │   ├─ 节点类型映射表
    │   └─ 验收标准
    │   → 适合：开发任何节点时查阅
    │   → 阅读时间：20 分钟（首次），按需查阅（后续）
    │
    ├─ 03-dsl-adapter.md
    │   DSL 适配层详细规格
    │   ├─ RuleGo DSL 格式完整定义
    │   ├─ buildRuleGoDsl 算法与实现
    │   │   ├─ 算法流程图
    │   │   └─ 完整伪代码（300+ 行）
    │   ├─ loadRuleGoDsl 算法与实现
    │   │   ├─ 算法流程图
    │   │   └─ 完整伪代码（250+ 行）
    │   ├─ 容器节点特殊处理
    │   │   ├─ ForLoop Do 分支逻辑
    │   │   └─ GroupAction 处理
    │   ├─ 辅助函数规格（7 个）
    │   ├─ 连接类型映射
    │   ├─ 数据验证
    │   ├─ 错误类型定义
    │   └─ 测试用例（100+ cases）
    │   → 适合：开发 DSL 转换逻辑时查阅
    │   → 阅读时间：30 分钟
    │
    ├─ 04-ui-components.md
    │   UI 组件与样式系统规格
    │   ├─ 样式系统架构
    │   ├─ 颜色系统（CSS Variables）
    │   ├─ BaseNode 基础组件
    │   ├─ Loop 容器节点完整实现 ★
    │   │   ├─ LoopNodeRender 组件（80 行）
    │   │   ├─ LoopContainerStyle（200+ 行）
    │   │   ├─ LoopHeader/LoopBody 样式
    │   │   └─ 完全采用 Flowgram 风格
    │   ├─ NodePanel 节点面板
    │   │   ├─ 分类折叠
    │   │   ├─ 搜索过滤
    │   │   └─ 拖拽交互
    │   ├─ Toolbar 工具栏
    │   ├─ Sidebar 配置侧边栏
    │   ├─ 表单组件库
    │   ├─ 动画系统
    │   ├─ 响应式设计
    │   └─ 主题切换（可选）
    │   → 适合：开发 UI 组件和样式时查阅
    │   → 阅读时间：25 分钟
    │
    └─ 05-testing-strategy.md
        测试策略与质量保证
        ├─ 测试金字塔
        ├─ 单元测试套件
        │   ├─ DSL 转换测试（50+ cases）
        │   └─ 节点注册表测试（33 nodes）
        ├─ 集成测试套件
        │   ├─ 编辑器生命周期测试
        │   └─ DSL Round-trip 测试
        ├─ 回归测试
        │   └─ 生产规则兼容性（20+ rules）
        ├─ 性能测试
        │   ├─ 加载性能
        │   ├─ DSL 构建性能
        │   └─ 内存泄漏测试
        ├─ E2E 测试（10 workflows）
        ├─ 测试工具函数
        ├─ CI/CD 集成
        └─ 质量门禁
        → 适合：编写测试时查阅
        → 阅读时间：25 分钟
```

---

## 🗺️ 阅读路线图

### 路线 1: 项目经理 / 决策者

```
1. README.md (5 min)
   ↓
2. proposal.md (10 min)
   ↓
3. overview.md (10 min)
   ↓
4. BOARD.md (5 min)
   
总计：30 分钟
目的：了解项目价值、风险、进度
```

### 路线 2: 架构师 / Tech Lead

```
1. README.md (5 min)
   ↓
2. proposal.md (10 min)
   ↓
3. design.md (30 min) ★
   ↓
4. specs/ (按需，60 min)
   
总计：105 分钟
目的：深入理解技术方案，评审设计
```

### 路线 3: 开发者（首次加入）

```
1. README.md (5 min)
   ↓
2. QUICKREF.md (5 min)
   ↓
3. design.md - Loop 部分 (10 min) ★
   ↓
4. tasks.md - Phase 0-2 (15 min)
   ↓
5. specs/02-node-system.md (20 min)
   
总计：55 分钟
目的：快速上手，开始开发
```

### 路线 4: 开发者（日常）

```
根据当前任务，查阅对应的 spec：
  - 开发节点 → specs/02-node-system.md
  - 开发 DSL → specs/03-dsl-adapter.md
  - 开发 UI → specs/04-ui-components.md
  - 编写测试 → specs/05-testing-strategy.md
  
每天查看：
  - BOARD.md（进度更新）
  - tasks.md（任务状态）
```

### 路线 5: 测试工程师

```
1. README.md (5 min)
   ↓
2. proposal.md - 成功标准 (5 min)
   ↓
3. specs/05-testing-strategy.md (25 min) ★
   ↓
4. tasks.md - Phase 8 (5 min)
   
总计：40 分钟
目的：了解测试策略，准备测试环境
```

---

## 🔍 快速查找

### 我想了解...

| 主题 | 查看文档 | 章节 |
|-----|---------|-----|
| 为什么要重写？ | proposal.md | 背景与动机 |
| 重写的价值？ | proposal.md | 目标收益 |
| 有什么风险？ | proposal.md | 风险与缓解 |
| 整体架构是什么？ | design.md | 系统架构 |
| Loop 怎么实现？★ | design.md / specs/04-ui-components.md | Loop 容器节点 |
| DSL 怎么转换？ | design.md / specs/03-dsl-adapter.md | DSL 适配层 |
| 目录怎么组织？ | design.md | 目录结构设计 |
| 有哪些任务？ | tasks.md | 所有 Phase |
| 任务的先后顺序？ | tasks.md | 任务依赖图 |
| 怎么并行开发？ | tasks.md | 并行开发策略 |
| 节点怎么定义？ | specs/02-node-system.md | RuleGoNodeRegistry |
| 节点模板是什么？ | specs/02-node-system.md | 节点模板 |
| 怎么序列化配置？ | specs/02-node-system.md / 03-dsl-adapter.md | serializeConfiguration |
| 连接类型有哪些？ | specs/03-dsl-adapter.md | 连接类型映射 |
| 样式怎么定义？ | specs/04-ui-components.md | 样式系统架构 |
| CSS 变量有哪些？ | specs/04-ui-components.md | 颜色系统 |
| 怎么写测试？ | specs/05-testing-strategy.md | 测试套件 |
| 测试覆盖率要求？ | specs/05-testing-strategy.md | 代码覆盖率目标 |
| 性能指标是什么？ | specs/01-core-editor.md / 05-testing-strategy.md | 性能要求 |
| 当前进度如何？ | BOARD.md | 整体进度 |
| 下一步做什么？ | BOARD.md | 近期任务 |
| 未来有什么规划？ | FUTURE.md | 短期/中期/长期 |
| 技术债务？ | FUTURE.md | 技术债务清理 |

---

## 📖 按开发阶段查阅

### Phase 0: 准备工作

**必读**：
- tasks.md → Phase 0 部分
- design.md → 目录结构设计

**可选**：
- specs/01-core-editor.md → 依赖配置

---

### Phase 1: 核心框架

**必读**：
- design.md → 核心模块设计 → 编辑器主组件
- design.md → 插件系统配置
- specs/01-core-editor.md → 完整规格

**可选**：
- Flowgram 官方文档
- Semi Design 文档

---

### Phase 2: 第一批核心节点（含 ForLoop）★

**必读**：
- design.md → Loop 容器节点详细设计（★ 最重要）
- specs/02-node-system.md → 节点注册表 & 节点模板
- specs/04-ui-components.md → Loop 节点样式

**可选**：
- Flowgram Loop 示例代码
- specs/03-dsl-adapter.md → 容器节点 DSL 处理（如果同步开发）

---

### Phase 3: DSL 适配层

**必读**：
- design.md → DSL 适配层设计
- specs/03-dsl-adapter.md → 完整算法与实现

**可选**：
- 现有的 buildRuleGoDsl（旧版本，参考）
- RuleGo 后端文档（DSL 格式）

---

### Phase 4-5: 批量节点

**必读**：
- specs/02-node-system.md → 节点转换清单 & 节点模板

**可选**：
- 现有的 rulego-blocks/blocks/*.ts（旧版本，参考）

---

### Phase 6: UI 组件

**必读**：
- design.md → UI 组件设计
- specs/04-ui-components.md → 完整规格

**可选**：
- Flowgram demo UI 组件代码
- Semi Design 组件文档

---

### Phase 7-8: DSL 完善 + 集成测试

**必读**：
- specs/03-dsl-adapter.md → 完整规格
- specs/05-testing-strategy.md → 测试策略

**可选**：
- 生产规则样本数据

---

### Phase 9: 收尾与发布

**必读**：
- tasks.md → Phase 9 任务
- specs/05-testing-strategy.md → 质量门禁

**可选**：
- FUTURE.md → 技术债务清理

---

## 🎯 按角色查阅

### 角色：前端开发（核心编辑器）

**日常必读**：
- tasks.md（当前任务）
- specs/01-core-editor.md
- design.md → 编辑器主组件 & 插件配置

**按需查阅**：
- specs/04-ui-components.md（UI 相关）
- Flowgram 官方文档

---

### 角色：前端开发（节点系统）

**日常必读**：
- tasks.md（当前任务）
- specs/02-node-system.md
- design.md → Loop 容器节点设计（如果开发容器节点）

**按需查阅**：
- specs/03-dsl-adapter.md（序列化逻辑）
- specs/04-ui-components.md（样式）

---

### 角色：前端开发（DSL 适配层）

**日常必读**：
- tasks.md（当前任务）
- specs/03-dsl-adapter.md
- design.md → DSL 适配层设计

**按需查阅**：
- 后端 RuleGo 引擎文档
- 现有 DSL 转换代码（参考）

---

### 角色：前端开发（UI 组件）

**日常必读**：
- tasks.md（当前任务）
- specs/04-ui-components.md
- design.md → 样式设计规范

**按需查阅**：
- Flowgram demo UI 代码
- Semi Design 文档

---

### 角色：测试工程师

**日常必读**：
- tasks.md → Phase 8
- specs/05-testing-strategy.md

**按需查阅**：
- specs/03-dsl-adapter.md（DSL 测试）
- specs/02-node-system.md（节点测试）

---

### 角色：Tech Lead / 架构师

**定期审查**：
- design.md（架构合理性）
- BOARD.md（进度监控）
- specs/（规格完整性）

**决策参考**：
- proposal.md（项目价值）
- FUTURE.md（技术演进）

---

## 📊 文档统计

```
┌────────────────────────────────────────────────────┐
│              文档规模统计                           │
├────────────────────────────────────────────────────┤
│                                                    │
│  总文档数:        12 个                             │
│  总行数:          10,500+ 行                        │
│  总文件大小:      250+ KB                           │
│                                                    │
│  代码示例:        50+ 个                            │
│  算法流程:        10+ 个                            │
│  架构图:          5+ 个                             │
│  测试用例:        260+ 个                           │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 各文档规模

| 文档 | 行数 | 大小 | 复杂度 |
|-----|------|------|-------|
| proposal.md | 247 | 8.8 KB | ⭐️⭐️ |
| design.md | 1,348 | 57 KB | ⭐️⭐️⭐️⭐️⭐️ |
| tasks.md | 1,269 | 25 KB | ⭐️⭐️⭐️⭐️ |
| specs/01-core-editor.md | 936 | 12 KB | ⭐️⭐️⭐️ |
| specs/02-node-system.md | 1,506 | 17 KB | ⭐️⭐️⭐️⭐️ |
| specs/03-dsl-adapter.md | 2,055 | 36 KB | ⭐️⭐️⭐️⭐️⭐️ |
| specs/04-ui-components.md | 1,793 | 25 KB | ⭐️⭐️⭐️⭐️ |
| specs/05-testing-strategy.md | 1,761 | 40 KB | ⭐️⭐️⭐️⭐️ |
| README.md | 279 | 10 KB | ⭐️⭐️ |
| QUICKREF.md | 306 | 6.8 KB | ⭐️ |
| overview.md | - | 16 KB | ⭐️⭐️ |
| BOARD.md | - | 8 KB | ⭐️ |
| FUTURE.md | - | 11 KB | ⭐️⭐️ |

---

## 🎯 核心文档（必读）

**如果时间有限，至少要读这 3 个**：

### 1. QUICKREF.md ⚡
5 分钟了解核心内容

### 2. design.md - Loop 部分 ⭐⭐⭐⭐⭐
**Loop 容器节点**是本次重写的核心亮点，这部分包含：
- 完整的代码实现（300+ 行）
- 样式定义（Flowgram 风格）
- DSL 处理逻辑
- 这是整个项目最复杂的部分

### 3. tasks.md - Phase 0-3 ⭐⭐⭐⭐
前 3 个 Phase 是项目基础，包含：
- 准备工作
- 核心框架
- 第一批节点（含 ForLoop）
- DSL 适配层

---

## 💡 使用技巧

### 1. 搜索技巧

**在所有文档中搜索关键词**：
```bash
cd openspec/changes/migrate-to-flowgram-editor
grep -r "关键词" *.md specs/*.md
```

**常用搜索词**：
- `ForLoop` / `Loop` / `for-loop` - 循环容器节点
- `buildRuleGoDsl` - DSL 构建
- `loadRuleGoDsl` - DSL 加载
- `serializeConfiguration` - 配置序列化
- `isContainer` - 容器节点
- `验收标准` - 任务完成标准

---

### 2. 文档间跳转

**Markdown 内部链接**：
- `[查看设计文档](./design.md)` - 同级目录
- `[查看节点规格](./specs/02-node-system.md)` - 子目录
- `[查看 Loop 设计](./design.md#loop-容器节点详细设计)` - 锚点跳转

---

### 3. 版本管理

**文档版本**：
- 所有文档在 Git 中版本化
- 重大修改时在文档底部注明修改日期
- 使用 Git blame 查看修改历史

**变更记录**：
```markdown
## 变更历史

- 2026-04-02: 初始创建
- 2026-04-10: 更新 Loop 节点设计（增加错误指示器）
- 2026-04-20: 补充性能测试要求
```

---

## 🆘 遇到问题？

### 问题类型 → 查阅文档

| 问题 | 文档 |
|-----|-----|
| 不知道从哪开始 | README.md, QUICKREF.md |
| 不理解为什么这么做 | proposal.md |
| 不清楚架构设计 | design.md |
| 不知道怎么实现某个功能 | specs/ 对应文档 |
| 任务不清楚 | tasks.md |
| 进度不清楚 | BOARD.md |
| 测试不知道怎么写 | specs/05-testing-strategy.md |
| 未来规划不清楚 | FUTURE.md |

### 文档找不到答案？

1. **搜索其他文档**（可能在别的地方）
2. **查看 Flowgram 官方文档**
3. **查看现有代码**（rulego/）
4. **向团队成员提问**
5. **更新文档**（补充缺失的内容）

---

## 🔄 文档维护

### 谁来维护？

- **proposal.md**: Tech Lead（稳定，很少修改）
- **design.md**: 架构师（阶段性修改）
- **tasks.md**: 项目经理 + 开发者（每日更新）
- **BOARD.md**: 项目经理（每日更新）
- **specs/**: 对应模块开发者（阶段性修改）
- **FUTURE.md**: Tech Lead（阶段性修改）

### 何时更新？

**每日**：
- BOARD.md（进度更新）
- tasks.md（任务状态）

**每周**：
- 技术决策记录（如有新决策）
- 已知问题列表

**Phase 完成时**：
- design.md（如有设计调整）
- specs/（如有规格变更）
- BOARD.md（里程碑达成）

**项目结束时**：
- FUTURE.md（经验教训）
- overview.md（最终统计）

---

## 🎓 最佳实践

### 阅读文档

1. **先读概览，再读细节**
   - README → QUICKREF → proposal → design → specs

2. **按需深入，避免信息过载**
   - 开发节点时才读节点规格
   - 编写测试时才读测试策略

3. **带着问题阅读**
   - "Loop 怎么实现？" → 直接跳到 design.md 的 Loop 部分
   - "怎么序列化配置？" → 直接搜索 serializeConfiguration

### 使用文档

1. **边读边实践**
   - 读完一个章节立即尝试实现
   - 不要读完所有文档才开始动手

2. **记录问题和改进点**
   - 文档有误？记下来，稍后修正
   - 发现更好的方案？记录并讨论

3. **分享给团队**
   - 发现好的代码示例？分享
   - 踩到坑？更新文档避免他人重复

---

## ✨ 文档质量承诺

这套文档力求做到：

- ✅ **完整性**：覆盖项目所有关键方面
- ✅ **准确性**：所有代码示例都经过验证
- ✅ **可操作性**：有具体的步骤和示例
- ✅ **可维护性**：结构清晰，易于更新
- ✅ **可读性**：语言清晰，排版美观

如果发现文档有任何问题，欢迎提出改进建议！

---

## 🚀 开始你的旅程

准备好了吗？

**第一次阅读**：
1. 📖 打开 [README.md](./README.md)
2. ⚡ 快速浏览 [QUICKREF.md](./QUICKREF.md)
3. 🏗️ 深入阅读 [design.md](./design.md) 的 Loop 部分
4. ✅ 查看 [tasks.md](./tasks.md) 的 Phase 0

**日常开发**：
1. 📊 查看 [BOARD.md](./BOARD.md) 了解进度
2. ✅ 在 [tasks.md](./tasks.md) 找到今天的任务
3. 📘 查阅对应的 spec 文档
4. 🔧 开始编码！

**祝你开发顺利！** 🎉

---

_索引维护：每周五更新_  
_最后更新：2026-04-02_
