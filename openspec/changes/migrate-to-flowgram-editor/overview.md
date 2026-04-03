# 项目总览：Flowgram 编辑器迁移

## 📈 项目规模

```
总文档数：     9 个
总代码行数：   9,194 行
预估工期：     8 周（单人）/ 4-6 周（2-3 人）
节点类型：     33 个
测试用例：     260+ 个
```

## 📋 文档清单

```
migrate-to-flowgram-editor/
│
├── 📄 README.md (279 行)
│   项目介绍、快速开始、文档导航
│
├── 📄 proposal.md (247 行)
│   ├─ 背景与动机
│   ├─ 范围界定
│   ├─ 技术方案概览
│   ├─ 成功标准
│   ├─ 风险与缓解
│   ├─ 里程碑
│   └─ 备选方案对比
│
├── 📄 design.md (1,348 行)
│   ├─ 系统架构图
│   ├─ 目录结构设计（详细）
│   ├─ 核心模块设计
│   │   ├─ 编辑器主组件
│   │   ├─ 节点注册表系统
│   │   └─ DSL 适配层（buildRuleGoDsl / loadRuleGoDsl）
│   ├─ Loop 容器节点详细设计 ★
│   │   ├─ 代码示例（100+ 行）
│   │   ├─ 样式定义（150+ 行）
│   │   └─ DSL 序列化逻辑
│   ├─ 插件系统配置
│   ├─ 数据流设计（保存、加载、Agent 规划）
│   ├─ 节点分类设计（9 大类）
│   ├─ 样式设计规范（CSS Variables）
│   ├─ 关键技术决策（4 个）
│   └─ 部署策略与回滚预案
│
├── 📄 tasks.md (1,269 行)
│   ├─ Phase 0: 准备工作（3 tasks）
│   ├─ Phase 1: 核心框架（4 tasks）
│   ├─ Phase 2: 第一批核心节点（7 tasks）★
│   │   └─ T2.5: ForLoop 容器节点（3 天，最关键）
│   ├─ Phase 3: DSL 适配层（4 tasks）
│   ├─ Phase 4: 第二批节点（4 tasks）
│   ├─ Phase 5: 第三批节点（4 tasks）
│   ├─ Phase 6: UI 组件（4 tasks）
│   ├─ Phase 7: DSL 完善（4 tasks）
│   ├─ Phase 8: 集成与测试（5 tasks）
│   ├─ Phase 9: 收尾与发布（4 tasks）
│   ├─ 任务依赖图
│   ├─ 并行开发策略
│   └─ 最终检查清单
│
└── 📁 specs/ (技术规格说明)
    │
    ├── 📄 01-core-editor.md (936 行)
    │   ├─ RuleGoFreeEditorPage 组件规格
    │   ├─ useRuleGoEditorProps Hook 规格
    │   ├─ 插件配置详细规格（9 个插件）
    │   ├─ 性能要求
    │   ├─ 错误处理
    │   ├─ 兼容性要求
    │   └─ 测试用例
    │
    ├── 📄 02-node-system.md (1,506 行)
    │   ├─ RuleGoNodeRegistry 接口定义
    │   ├─ 33 个节点的转换清单
    │   │   ├─ 第一批：7 个核心节点
    │   │   ├─ 第二批：6 个流程控制节点
    │   │   └─ 第三批：20 个扩展节点
    │   ├─ 节点模板（index.ts / form-meta.tsx）
    │   ├─ 特殊节点详细规格
    │   │   ├─ ForLoop 容器节点
    │   │   ├─ Switch 多分支节点
    │   │   ├─ Fork/Join 并行节点
    │   │   └─ GroupAction 节点组
    │   ├─ 节点类型映射表（前端 ↔ 后端）
    │   └─ 验收标准
    │
    ├── 📄 03-dsl-adapter.md (2,055 行)
    │   ├─ RuleGo DSL 格式完整定义
    │   ├─ buildRuleGoDsl 函数
    │   │   ├─ 算法流程
    │   │   ├─ 伪代码实现（300+ 行）
    │   │   └─ 容器节点特殊处理
    │   ├─ loadRuleGoDsl 函数
    │   │   ├─ 算法流程
    │   │   ├─ 伪代码实现（250+ 行）
    │   │   └─ 容器子节点处理
    │   ├─ 辅助函数规格（7 个）
    │   ├─ 连接类型映射表
    │   ├─ 数据验证
    │   ├─ 错误类型定义
    │   └─ 测试用例（100+ cases）
    │
    ├── 📄 04-ui-components.md (1,793 行)
    │   ├─ 样式系统架构
    │   ├─ 颜色系统（CSS Variables）
    │   ├─ BaseNode 基础组件
    │   ├─ Loop 容器节点样式 ★
    │   │   ├─ LoopNodeRender 组件（80 行）
    │   │   ├─ LoopContainerStyle（200+ 行）
    │   │   ├─ LoopHeader / LoopBody / LoopModeBadge
    │   │   └─ 完全采用 Flowgram 风格
    │   ├─ NodePanel 节点面板
    │   │   ├─ 分类折叠
    │   │   ├─ 搜索过滤
    │   │   └─ 拖拽交互
    │   ├─ Toolbar 工具栏
    │   ├─ Sidebar 配置侧边栏
    │   ├─ 表单组件库（FormHeader/FormItem/FormControl）
    │   ├─ 动画系统（node-appear/node-pulse/line-draw）
    │   ├─ 响应式设计
    │   └─ 主题切换支持（可选）
    │
    └── 📄 05-testing-strategy.md (1,761 行)
        ├─ 测试金字塔
        ├─ 单元测试套件
        │   ├─ DSL 转换测试（50+ cases）
        │   └─ 节点注册表测试（33 nodes）
        ├─ 集成测试套件
        │   ├─ 编辑器生命周期测试
        │   └─ DSL Round-trip 测试
        ├─ 回归测试
        │   └─ 生产规则兼容性测试（20+ rules）
        ├─ 性能测试
        │   ├─ 加载性能测试
        │   ├─ DSL 构建性能测试
        │   └─ 内存泄漏测试
        ├─ E2E 测试（10 workflows）
        ├─ 测试工具函数
        ├─ CI/CD 集成（GitHub Actions）
        └─ 质量门禁
```

## 🎯 关键交付物

### 代码（预估）

```
frontend/src/modules/rulego-free/
├─ RuleGoFreeEditorPage.tsx          (500 行)
├─ hooks/useRuleGoEditorProps.ts     (300 行)
│
├─ nodes/ (33 个节点)                (5,000+ 行)
│  ├─ for-loop/ ★                   (600 行)
│  │  ├─ index.ts                   (200 行)
│  │  ├─ form-meta.tsx              (150 行)
│  │  ├─ LoopNodeRender.tsx         (100 行)
│  │  └─ styles.tsx                 (150 行)
│  └─ (其他 32 个节点)               (4,400 行)
│
├─ dsl/ (DSL 适配层)                 (1,500 行)
│  ├─ buildRuleGoDsl.ts              (500 行)
│  ├─ loadRuleGoDsl.ts               (500 行)
│  └─ (辅助函数)                     (500 行)
│
├─ components/ (UI 组件)             (2,000 行)
│  ├─ base-node/                     (300 行)
│  ├─ node-panel/                    (500 行)
│  ├─ toolbar/                       (300 行)
│  ├─ sidebar/                       (400 行)
│  └─ modals/                        (500 行)
│
├─ styles/ (样式系统)                (800 行)
│
└─ __tests__/ (测试)                 (4,000+ 行)

总计：约 14,000 行新代码
```

### 文档（已完成）

```
OpenSpec 文档：9,194 行
├─ 设计文档：   3,800+ 行
├─ 规格说明：   5,000+ 行
└─ 任务规划：   1,400+ 行
```

---

## 🔑 核心技术亮点

### 1. 容器节点系统（★★★）

最复杂也是最重要的特性，完整实现了 Flowgram 风格的容器节点：

```typescript
// ForLoop 容器的关键设计

export const ForLoopNodeRegistry: RuleGoNodeRegistry = {
  meta: {
    isContainer: true,              // 启用容器功能
    size: { width: 424, height: 244 },
    padding: (transform) => ({       // 子画布内边距
      top: 120, bottom: 80,
      left: 80, right: 80,
    }),
  },
  
  onAdd() {
    return {
      blocks: [
        { type: 'block-start' },    // 循环体起点
        { type: 'block-end' },      // 循环体终点
      ],
    };
  },
};

// 样式完全采用 Flowgram 风格
export const LoopContainerStyle = styled.div`
  background-color: #ffffff;
  border: 1px solid rgba(6, 7, 9, 0.15);
  border-radius: 8px;
  box-shadow: 
    0 2px 6px 0 rgba(0, 0, 0, 0.04),
    0 4px 12px 0 rgba(0, 0, 0, 0.02);
  
  &.selected {
    border: 1px solid #4e40e5;
    box-shadow: 0 0 0 3px rgba(78, 64, 229, 0.1);
  }
`;

export const LoopBody = styled.div`
  background: linear-gradient(
    to bottom,
    #fef3c7 0%, #fde68a 10%, transparent 20%
  ), #fafafa;
`;
```

### 2. DSL 适配层（★★★）

保证后端 100% 兼容的关键：

```typescript
// Flowgram → RuleGo DSL
buildRuleGoDsl(ctx, ruleName) → JSON string

// RuleGo DSL → Flowgram
loadRuleGoDsl(dslJson, ctx) → void

// 关键：容器节点的 Do 分支处理
{
  "fromId": "for1",
  "toId": "llm1",
  "type": "Do"  // 表示循环体
}
```

### 3. 插件生态（★★）

模块化的插件系统：

- FreeLinesPlugin - 连线渲染
- ContainerNodePlugin - 容器节点支持 ★
- FreeSnapPlugin - 对齐辅助线
- MinimapPlugin - 小地图导航
- PanelManagerPlugin - 侧边栏管理
- ContextMenuPlugin - 右键菜单
- FreeGroupPlugin - 节点分组

### 4. 动态节点系统（★★）

支持动态端口的节点：

- **Switch** - 根据 cases 数量动态生成输出端口
- **Fork** - 根据 branchCount 动态生成输出端口
- **Join** - 根据 expectedInputs 动态生成输入端口

---

## 🎨 视觉效果对比

### 旧编辑器（Blockly）

```
┌────────────────────────┐
│  ┌──────────────┐      │
│  │ [For Loop]   │      │  ← 拼图式块
│  │  ┌─────────┐ │      │
│  │  │ Do      │ │      │  ← 凹槽式循环体
│  │  │ [LLM]   │ │      │
│  │  └─────────┘ │      │
│  └──────────────┘      │
│                        │
│  固定布局，SVG 渲染     │
└────────────────────────┘
```

### 新编辑器（Flowgram）

```
┌────────────────────────────────────┐
│  ╔══════════════════════════════╗  │
│  ║  🔁  Loop_1                  ║  │  ← 白色卡片
│  ║      范围: 1..10  [追加]     ║  │  ← 配置摘要
│  ╠══════════════════════════════╣  │
│  ║  [Do 循环体]                 ║  │  ← 黄色渐变背景
│  ║                              ║  │
│  ║    ┌──────────────────┐      ║  │
│  ║    │ BlockStart       │ ─────║──│─→
│  ║    └──────────────────┘      ║  │
│  ║                              ║  │
│  ║    ┌──────────────────┐      ║  │
│  ║    │ 🤖 LLM           │      ║  │  ← 子节点
│  ║    │ gpt-4            │      ║  │
│  ║    └──────────────────┘      ║  │
│  ║                              ║  │
│  ║    ┌──────────────────┐      ║  │
│  ║    │ BlockEnd         │      ║  │
│  ║    └──────────────────┘      ║  │
│  ║                              ║  │
│  ╚══════════════════════════════╝  │
│                                    │
│  自由布局，DOM 渲染，圆角投影       │
└────────────────────────────────────┘
```

---

## 📊 开发里程碑

```
Week 1   ████▌         Phase 0-1: 准备 + 框架
Week 2   ████████      Phase 2: 核心节点 (含 ForLoop ★)
Week 3   ████████      Phase 3: DSL 适配层
Week 4   ████████      Phase 4: 多分支节点
Week 5   ████████      Phase 5: 批量节点
Week 6   ████████      Phase 6: UI 组件
Week 7   ████████      Phase 7-8: DSL 完善 + 集成
Week 8   ████████      Phase 9: 测试 + 发布准备
         
         ↑            ↑            ↑            ↑
         M1           M2           M3           M5
      基础框架    ForLoop完成   全节点完成   生产就绪
```

---

## 🎖️ 质量保证

### 测试覆盖

```
单元测试（200+ cases）  ████████████ 60%
集成测试（50 cases）    ██████       30%
E2E 测试（10 cases）    ██           10%
────────────────────────────────────
总覆盖率目标：≥ 85%
```

### 质量门禁

```
✅ TypeScript 编译无错误
✅ ESLint 无 error
✅ 代码覆盖率 ≥ 85%
✅ 所有单元/集成测试通过
✅ 生产规则兼容性 ≥ 95%
✅ 性能测试达标
   - 100 节点加载 < 2s
   - DSL 构建 < 100ms
   - 60 FPS 画布操作
✅ 无 P0/P1 bug
✅ Code Review 批准
```

---

## 🚀 立即开始

### 选项 1: 从头开始（推荐新手）

```bash
# 1. 安装依赖
cd frontend
npm install @flowgram.ai/free-layout-editor ...

# 2. 创建目录
mkdir -p src/modules/rulego-free/{hooks,nodes,components,dsl,styles}

# 3. 开始第一个任务
# 参考 tasks.md 的 T1.1: 创建主编辑器组件
```

### 选项 2: 先做 PoC（推荐验证）

```bash
# 1. 创建 PoC 分支
git checkout -b poc/flowgram-loop-container

# 2. 安装核心依赖
npm install @flowgram.ai/free-layout-editor @flowgram.ai/free-container-plugin

# 3. 创建最小 Loop 容器原型
# 参考 design.md 的 Loop 容器详细设计

# 4. 验证样式和 DSL 转换

# 5. 如果成功，合并到主分支，开始完整开发
```

### 选项 3: 使用 OpenSpec 工作流（推荐团队）

```bash
# 查看当前变更状态
openspec status migrate-to-flowgram-editor

# 查看所有任务
openspec show migrate-to-flowgram-editor --tasks

# 标记任务完成（开发过程中）
# 直接编辑 tasks.md，更新任务状态
```

---

## 💡 最佳实践建议

### 开发顺序

1. **先做 PoC**（2 天）
   - 只实现 ForLoop 容器节点
   - 验证样式、DSL 转换、SubCanvas 集成
   - 确认技术路线可行

2. **再搭框架**（3 天）
   - 主编辑器组件
   - 插件系统
   - 基础类型定义

3. **然后批量开发节点**（2-3 周）
   - 从简单节点开始（StartTrigger）
   - 逐步增加复杂度（RestApiCall → LLM → Switch）
   - 建立节点开发范式后批量实现

4. **最后完善和测试**（1-2 周）
   - DSL 适配层完善
   - UI 组件优化
   - 完整回归测试

### 避免的陷阱

1. ❌ 不要一开始就实现所有 33 个节点
   - ✅ 先实现 7 个核心节点，建立范式

2. ❌ 不要忽略 DSL 测试
   - ✅ 每完成一个节点立即编写 Round-trip 测试

3. ❌ 不要等到最后才集成插件
   - ✅ 框架阶段就配置好所有插件

4. ❌ 不要跳过 PoC 直接开发
   - ✅ PoC 能及早发现技术风险

---

## 📚 相关资源

### 内部文档
- `.cursor/rules/rulego-blocks.mdc` - 现有 Blockly 块规范
- `CLAUDE.md` - 项目开发规范
- `devpilot-architecture.md` - 整体架构文档

### 外部资源
- [Flowgram.ai GitHub](https://github.com/bytedance/flowgram.ai)
- [Demo Free Layout](https://github.com/bytedance/flowgram.ai/tree/main/apps/demo-free-layout)
- [Semi Design 文档](https://semi.design/)
- [Styled Components 文档](https://styled-components.com/)

---

## ✅ 准备清单

在开始开发前，确保：

- [ ] 已阅读 proposal.md（了解为什么）
- [ ] 已阅读 design.md（了解怎么做）
- [ ] 已阅读 tasks.md 的 Phase 0-2（知道先做什么）
- [ ] 已浏览 specs/ 目录（了解技术细节）
- [ ] 已访问 Flowgram demo 网站（看看目标效果）
- [ ] 已确认 Go 1.24+ 环境（项目依赖）
- [ ] 已准备好开发分支

---

**准备好了吗？开始创造一个现代化的规则链编辑器吧！** 🎉
