# 快速参考指南

> 5 分钟快速了解这个项目的核心内容

## 🎯 项目目标

**用一句话概括**：将 DevPilot 规则链编辑器从 Blockly 拼图式布局重写为 Flowgram 自由布局，尤其是 Loop 容器节点要采用 Flowgram 的现代设计风格。

---

## 📖 文档导航（按阅读顺序）

### 1️⃣ 先读这个 → [proposal.md](./proposal.md) (9 分钟)
了解**为什么**要重写，以及重写的**价值**和**风险**。

**关键章节**：
- 当前痛点（4 个）
- 目标收益（4 个）
- 技术方案概览
- 风险与缓解

---

### 2️⃣ 再读这个 → [design.md](./design.md) (20 分钟)
了解**怎么做**，整体架构和核心模块设计。

**关键章节**：
- 系统架构图（一图胜千言）
- 目录结构设计（清晰的文件组织）
- **Loop 容器节点详细设计（★ 最重要）**
  - 完整代码示例（200+ 行）
  - 样式定义（Flowgram 风格）
  - DSL 序列化/反序列化逻辑
- 插件系统配置
- 数据流设计（保存/加载/Agent 规划）

---

### 3️⃣ 然后看任务 → [tasks.md](./tasks.md) (15 分钟)
了解**做什么**，分阶段的任务清单。

**关键章节**：
- Phase 2 的 T2.5: ForLoop 容器节点（最关键任务）
- Phase 3 的 T3.3: 容器节点 DSL 处理
- 任务依赖图（了解先后顺序）
- 并行开发策略（如果是团队）

---

### 4️⃣ 深入细节 → [specs/](./specs/) (按需阅读)

**开发节点时读**：
- [02-node-system.md](./specs/02-node-system.md) - 节点注册表规格

**开发 DSL 时读**：
- [03-dsl-adapter.md](./specs/03-dsl-adapter.md) - DSL 适配层详细实现

**开发 UI 时读**：
- [04-ui-components.md](./specs/04-ui-components.md) - 样式系统和组件规格

**编写测试时读**：
- [05-testing-strategy.md](./specs/05-testing-strategy.md) - 完整测试策略

---

## 🔑 核心概念速查

### Blockly vs Flowgram

| 维度 | Blockly (旧) | Flowgram (新) |
|-----|-------------|--------------|
| 渲染方式 | SVG | DOM (React) |
| 节点形状 | 拼图块 | 白色卡片 |
| 布局方式 | 拼接 | 自由放置 + 连线 |
| 容器节点 | 凹槽（statementInput）| 真实画布容器 |
| 样式定制 | 有限（Blockly Theme）| 灵活（styled-components）|
| 配置面板 | 模态框 | 侧边栏 |

### 节点类型映射

| 前端类型 | 后端类型 | 分类 | 特殊性 |
|---------|---------|-----|--------|
| `for-loop` | `for` | data | 容器节点 ★ |
| `switch` | `switch` | condition | 动态多端口 |
| `fork` | `fork` | flow | 动态多端口 |
| `join` | `join` | data | 动态多端口 |
| `group-action` | `groupAction` | data | 容器或多分支 |
| `start-trigger` | `startTrigger` | trigger | 不可删除 |
| `http-trigger` | `endpoint/http`（DSL 与 Blockly 一致；别名 `endpoint:http`） | trigger | 进 endpoints |
| ... | ... | ... | ... |

### DSL 关键结构

```json
{
  "ruleChain": { "id": "...", "name": "..." },
  "metadata": {
    "nodes": [
      {
        "id": "for1",
        "type": "for",                    // 后端类型
        "configuration": {
          "range": "1..10",
          "do": "llm1",                   // Do 分支的第一个节点 ID
          "mode": 1
        },
        "additionalInfo": {
          "flowgramNodeType": "for-loop", // 前端类型（用于回载）
          "position": { "x": 200, "y": 100 }
        }
      }
    ],
    "connections": [
      {
        "fromId": "for1",
        "toId": "llm1",
        "type": "Do"                      // 循环体连接
      }
    ],
    "endpoints": [...]                    // 触发器类节点
  }
}
```

### 容器节点关键点

**ForLoop 容器节点的 3 个关键特性**：

1. **`isContainer: true`**
   ```typescript
   meta: {
     isContainer: true,
     padding: () => ({ top: 120, bottom: 80, left: 80, right: 80 }),
   }
   ```

2. **BlockStart/BlockEnd 子节点**
   ```typescript
   onAdd() {
     return {
       blocks: [
         { type: 'block-start', meta: { position: { x: 32, y: 0 } } },
         { type: 'block-end', meta: { position: { x: 192, y: 0 } } },
       ],
     };
   }
   ```

3. **Do 分支的 DSL 表示**
   ```typescript
   // 序列化：找到第一个子节点
   serializeConfiguration(node) {
     return {
       do: findFirstSubNodeId(node),  // 关键
     };
   }
   
   // 反序列化：创建 Do 连接
   // { fromId: 'for1', toId: 'llm1', type: 'Do' }
   ```

---

## 🛠️ 开发工具

### 必需工具

```bash
# 查看 OpenSpec 状态
openspec status migrate-to-flowgram-editor

# 运行测试
cd frontend
npm run test

# 启动开发服务器
npm run dev

# 构建
npm run build
```

### 推荐 IDE 插件

- **Styled Components** - 样式高亮和自动补全
- **ESLint** - 代码规范检查
- **Prettier** - 代码格式化
- **TypeScript** - 类型检查

---

## 🎨 Loop 节点样式速查

### 颜色变量

```css
--container-loop-bg: #ffffff;
--container-loop-border: #f59e0b;
--container-loop-inner-bg: 
  linear-gradient(to bottom, #fef3c7 0%, #fde68a 10%, transparent 20%),
  #fafafa;
--container-loop-label-color: #a16207;
```

### 关键样式

```typescript
// 容器主体
LoopContainerStyle
  - 白色背景 (#ffffff)
  - 1px 浅灰边框
  - 8px 圆角
  - 双层投影
  - 选中态：蓝色边框 + 光晕

// 头部区域
LoopHeader
  - 渐变背景 (#fafafa → #ffffff)
  - 循环图标 (🔁) + 节点名称
  - 配置摘要（范围、模式）

// 子画布区域
LoopBody
  - 黄色渐变背景
  - "Do 循环体" 标签
  - SubCanvasRender 渲染嵌套画布
```

---

## 📞 遇到问题？

### 技术问题

1. **查看对应的 spec 文档**
   - 节点问题 → `specs/02-node-system.md`
   - DSL 问题 → `specs/03-dsl-adapter.md`
   - 样式问题 → `specs/04-ui-components.md`

2. **参考 Flowgram 官方示例**
   - [Loop 节点示例](https://github.com/bytedance/flowgram.ai/tree/main/apps/demo-free-layout/src/nodes/loop)
   - [Editor 示例](https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/editor.tsx)

3. **联系团队**
   - 在项目 Issue 中提问
   - 或在团队群组讨论

### 流程问题

1. **任务不清楚** → 查看 `tasks.md` 对应的任务描述
2. **设计有疑问** → 查看 `design.md` 对应章节
3. **需要更新计划** → 直接编辑 `tasks.md` 或 `design.md`

---

## 🚀 立即行动

### 如果你有 2 小时

执行 Phase 0（准备工作）：
1. T0.1: 安装依赖（30 分钟）
2. T0.2: 创建目录（30 分钟）
3. T0.3: 复制静态资源（1 小时）

### 如果你有 1 天

完成 M1 里程碑（基础框架）：
1. Phase 0: 准备工作
2. T1.1: 创建主编辑器组件
3. T1.2: 实现 useRuleGoEditorProps
4. 验证：能看到空白画布

### 如果你有 3 天

完成 ForLoop PoC（验证可行性）：
1. Phase 0: 准备工作
2. Phase 1: 基础框架
3. T2.5: 实现 ForLoop 容器节点
4. T3.3: 实现容器 DSL 处理
5. 验证：能创建、配置、保存、加载 Loop 节点

---

## 📈 成功指标

### 功能完整性
✅ 所有 33 个节点类型可用  
✅ ForLoop 容器样式 100% 符合 Flowgram  
✅ DSL 双向转换准确  
✅ 所有现有功能都已迁移  

### 兼容性
✅ ≥ 95% 生产规则兼容  
✅ 后端零改动  
✅ 旧规则无需迁移  

### 性能
✅ 100 节点加载 < 2s  
✅ DSL 构建 < 100ms  
✅ 60 FPS 画布操作  

### 质量
✅ 代码覆盖率 ≥ 85%  
✅ 无 P0/P1 bug  
✅ Code Review 通过  

---

## 🎉 祝你开发顺利！

有任何问题随时查看对应的文档，或者联系团队成员。

**记住**：这是一个 8 周的项目，不要着急，稳扎稳打，质量第一！
