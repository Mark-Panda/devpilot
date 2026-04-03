# 技术债务清理与未来规划

## 🧹 技术债务清理

### 旧编辑器代码清理

**时机**：新编辑器稳定运行 2 周后（Week 11）

**清理清单**：

```
frontend/src/modules/rulego/
├─ 🗑️ RuleGoScratchEditorPage.tsx (7,131 行)
├─ 🗑️ rulego-blocks/ (整个目录)
│  ├─ blocks/*.ts (33 个块定义)
│  ├─ index.ts
│  └─ types.ts
├─ 🗑️ BlockLibraryPanel.tsx
└─ ✅ 保留共享代码
   ├─ useRuleGoRules.ts
   ├─ useRuleGoApi.ts
   └─ types.ts (移至 rulego-shared/)

frontend/package.json
└─ 🗑️ 移除 "scratch-blocks": "^0.1.0"

frontend/src/styles/globals.css
└─ 🗑️ 移除 .rulego-editor-canvas .blocklySvg { ... }
```

**预估工作量**：1 天

**风险**：
- 确保所有引用都已迁移
- 保留可能的历史查看需求（可选保留只读视图）

---

### 代码重复消除

**重复代码识别**：

1. **规则 CRUD 逻辑**
   ```typescript
   // 现状：rulego/ 和 rulego-free/ 各有一份
   // 目标：统一到 rulego-shared/
   
   rulego-shared/
   ├─ hooks/
   │  ├─ useRuleGoRules.ts      // 规则 CRUD
   │  ├─ useRuleGoApi.ts        // API 调用
   │  └─ useRuleGoExecution.ts  // 规则执行
   └─ types/
      └─ common.ts               // 通用类型
   ```

2. **DSL 工具函数**
   ```typescript
   // 如果新旧编辑器短期并存，提取共同的 DSL 工具
   
   rulego-shared/utils/
   ├─ dslValidation.ts           // DSL 格式验证
   ├─ dslNormalization.ts        // DSL 标准化
   └─ nodeIdGenerator.ts         // ID 生成器
   ```

---

## 🔮 未来规划

### 短期（3-6 个月）

#### 1. 节点模板市场

**需求**：用户希望快速搭建常见规则模式

**方案**：
- 预设常用节点组合（如 HTTP → LLM → 响应）
- 一键导入模板到画布
- 支持自定义模板保存

**技术实现**：
```typescript
interface NodeTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: NodeCreateData[];
  connections: LineCreateData[];
  thumbnail?: string;
}

// 模板应用
function applyTemplate(ctx: EditorContext, template: NodeTemplate) {
  // 批量创建节点
  // 批量创建连线
  // 自动布局
}
```

**预估工作量**：2 周

---

#### 2. 规则链版本管理

**需求**：追踪规则的历史变更，支持对比和回滚

**方案**：
- 每次保存创建版本快照
- 可视化版本对比（节点/连线 diff）
- 一键回滚到历史版本

**技术实现**：
```typescript
interface RuleVersion {
  id: string;
  ruleId: string;
  version: number;
  definition: string;  // DSL JSON
  createdAt: string;
  createdBy: string;
  comment?: string;
}

// 版本对比
function diffRuleVersions(
  v1: RuleVersion,
  v2: RuleVersion
): {
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: Array<{ id: string; changes: any }>;
  addedConnections: RuleGoConnection[];
  removedConnections: RuleGoConnection[];
}
```

**预估工作量**：3 周

---

#### 3. 协作编辑

**需求**：多人同时编辑同一规则链

**方案**：
- WebSocket 实时同步
- CRDT 或 OT 算法处理冲突
- 显示其他用户的光标和选中状态

**技术实现**：
```typescript
// 使用 Yjs + y-websocket
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(
  'ws://localhost:1234',
  `rulego-${ruleId}`,
  ydoc
);

// 绑定到 Flowgram EditorContext
const yNodes = ydoc.getArray('nodes');
const yLines = ydoc.getArray('lines');

// 监听远程变更
yNodes.observe((event) => {
  // 同步到画布
});
```

**预估工作量**：4 周

**挑战**：
- Flowgram 引擎的数据结构与 Yjs 的集成
- 冲突解决策略（如两人同时连接同一端口）

---

### 中期（6-12 个月）

#### 4. AI 辅助优化规则链

**需求**：AI 分析规则链，给出优化建议

**功能点**：
- 性能瓶颈识别（如不必要的循环）
- 可读性建议（如节点命名、布局优化）
- 错误处理完整性检查
- 最佳实践推荐

**技术实现**：
```typescript
interface OptimizationSuggestion {
  type: 'performance' | 'readability' | 'error-handling' | 'best-practice';
  severity: 'high' | 'medium' | 'low';
  nodeId?: string;
  title: string;
  description: string;
  suggestion: string;
  canAutoFix: boolean;
}

async function analyzeRule(dsl: RuleGoDsl): Promise<OptimizationSuggestion[]> {
  // 调用后端 AI 分析服务
  const response = await fetch('/api/rulego/analyze', {
    method: 'POST',
    body: JSON.stringify(dsl),
  });
  
  return response.json();
}
```

**预估工作量**：6 周

---

#### 5. 可视化调试

**需求**：在编辑器中单步调试规则执行

**功能点**：
- 断点设置（点击节点设置断点）
- 单步执行（执行到下一个节点）
- 变量查看（每个节点的输入/输出）
- 执行路径高亮

**技术实现**：
```typescript
interface DebugSession {
  ruleId: string;
  sessionId: string;
  currentNodeId: string;
  breakpoints: Set<string>;
  variables: Map<string, any>;
  executionPath: string[];
}

// 调试控制面板
function DebugPanel({ session }: { session: DebugSession }) {
  return (
    <div>
      <button onClick={() => stepOver(session)}>单步执行</button>
      <button onClick={() => continue(session)}>继续</button>
      <button onClick={() => stop(session)}>停止</button>
      
      <VariableInspector variables={session.variables} />
      <ExecutionPath path={session.executionPath} />
    </div>
  );
}

// 节点高亮显示
// 当前执行节点：绿色边框 + 脉冲动画
// 断点节点：红色圆点
// 已执行路径：灰色虚线
```

**预估工作量**：8 周

**挑战**：
- 后端 RuleGo 引擎需要支持调试模式
- 实时状态同步（WebSocket）
- 大规则链的性能问题

---

#### 6. 规则链测试框架

**需求**：自动化测试规则链的正确性

**功能点**：
- 定义测试用例（输入 + 期望输出）
- 批量执行测试
- 覆盖率报告（哪些节点/分支被测试到）
- CI/CD 集成

**技术实现**：
```typescript
interface RuleTestCase {
  id: string;
  name: string;
  ruleId: string;
  input: Record<string, any>;
  expected: {
    output?: Record<string, any>;
    executedNodes?: string[];      // 期望执行的节点列表
    notExecutedNodes?: string[];   // 期望不执行的节点列表
  };
}

async function runRuleTest(
  ruleId: string,
  testCase: RuleTestCase
): Promise<{
  passed: boolean;
  actual: any;
  expected: any;
  diff?: any;
  executionTrace: string[];
}> {
  // 执行规则
  // 对比输出
  // 验证执行路径
}

// 测试覆盖率计算
function calculateCoverage(
  rule: RuleGoDsl,
  testResults: RuleTestResult[]
): {
  nodeCoverage: number;      // 节点覆盖率
  branchCoverage: number;    // 分支覆盖率
  uncoveredNodes: string[];
  uncoveredBranches: Array<{ fromId: string; type: string }>;
}
```

**预估工作量**：6 周

---

### 长期（12+ 个月）

#### 7. 规则链市场

**需求**：社区共享和交易规则链模板

**功能点**：
- 模板上传/下载
- 模板评分和评论
- 分类浏览和搜索
- 付费模板支持

**预估工作量**：12 周

---

#### 8. 低代码平台

**需求**：非技术人员也能创建规则链

**功能点**：
- 简化的节点配置界面（去除技术细节）
- 表单式节点配置（不需要写表达式）
- 预设的业务逻辑组件
- 可视化变量管理

**预估工作量**：16 周

---

#### 9. 云端协作

**需求**：规则链存储在云端，支持多设备访问

**功能点**：
- 云端存储
- 实时同步
- 权限管理（查看/编辑/执行）
- 审计日志

**预估工作量**：20 周

---

## 🔧 技术演进路线

### 架构演进

```
现在 (2026 Q2)
  Blockly SVG → React Flowgram → RuleGo Engine
  ↓
  
短期 (2026 Q3-Q4)
  + 模板市场
  + 版本管理
  + 协作编辑
  ↓
  
中期 (2027 Q1-Q2)
  + AI 优化
  + 可视化调试
  + 测试框架
  ↓
  
长期 (2027 Q3+)
  + 低代码平台
  + 云端协作
  + 规则链市场
```

### 技术栈演进

```
现在
  React 18 + Flowgram + Styled Components
  ↓
  
可能的升级
  ├─ React 19 (Compiler)
  ├─ Flowgram 下一代版本
  └─ 性能优化库（如 Partytown）
```

---

## 📉 技术债务评估

### 当前债务（重写前）

```
高债务区域:
  ├─ RuleGoScratchEditorPage.tsx (7,131 行) 🔴
  ├─ 33 个 Blockly 块定义 (分散) 🔴
  ├─ DSL 转换逻辑与 Blockly 耦合 🔴
  └─ 样式定制能力有限 🟡

技术债务指数: 8/10 (非常高)
维护难度: 9/10
扩展性: 3/10
```

### 重写后预期

```
低债务区域:
  ├─ RuleGoFreeEditorPage.tsx (500 行) ✅
  ├─ 33 个 FlowNodeRegistry (模块化) ✅
  ├─ DSL 适配层独立解耦 ✅
  └─ 插件化架构易扩展 ✅

技术债务指数: 2/10 (很低)
维护难度: 3/10
扩展性: 9/10
```

---

## 🎓 团队能力建设

### 需要掌握的技术

**必需掌握**：
- React 18 Hooks
- TypeScript 高级类型
- Styled Components
- Flowgram 编辑器 API

**建议了解**：
- Inversify（依赖注入）
- Semi Design 组件库
- Canvas 性能优化
- DSL 设计模式

### 培训计划

**Week 1（启动前）**：
- Flowgram 文档学习（2 天）
- Demo 示例研读（2 天）
- TypeScript 高级特性复习（1 天）

**开发过程中**：
- 每周技术分享会（1 小时）
- 疑难问题集中讨论
- Code Review 作为学习机会

---

## 🔍 代码质量指标

### 当前目标

```
代码覆盖率:        ≥ 85%   ⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️⬜️ (0%)
TypeScript 严格性: strict mode ✅
ESLint 规则:       标准规则集 + React 规则 ✅
代码复杂度:        平均 < 10 (Cyclomatic Complexity)
文件大小:          单文件 < 500 行（特殊情况除外）
函数长度:          单函数 < 50 行
```

### 持续监控

**工具**：
- SonarQube / CodeClimate（代码质量分析）
- Bundle Analyzer（打包体积分析）
- Chrome DevTools（性能分析）

**定期检查**（每 2 周）：
- 代码覆盖率趋势
- 技术债务指数
- 性能基准对比
- 依赖安全扫描

---

## 🚨 遗留问题（Known Issues）

### 设计阶段已知问题

1. **嵌套容器支持**
   - 当前设计：不支持容器嵌套容器
   - 原因：复杂度高，Flowgram 官方也不推荐
   - 未来：如有需求再评估

2. **GroupAction 的设计方案未最终确定**
   - 方案 A：容器节点（用户拖入）
   - 方案 B：多分支节点（用户选择 ID）
   - 决策：Phase 4 开发时根据实际情况确定

3. **性能优化策略待验证**
   - 当前计划：虚拟化渲染 + 懒加载
   - 验证：Phase 8 性能测试后确定
   - 备选：分页加载、Canvas 2D 渲染

---

## 📝 文档维护计划

### 开发期间（Week 1-8）

**实时更新**：
- tasks.md（标记任务完成状态）
- BOARD.md（更新进度）

**每周更新**：
- 技术决策记录（如果有新决策）
- 已知问题列表

**Phase 完成时更新**：
- design.md（如果有设计调整）
- specs/（如果有规格变更）

### 发布后（Week 9+）

**维护文档**：
- 用户手册（操作指南）
- FAQ（常见问题）
- 迁移指南（如何从旧编辑器过渡）
- API 文档（供其他模块调用）

**归档文档**：
- 技术决策记录（ADR）
- 已知问题和解决方案
- 性能优化记录

---

## 🎯 成功标准（再次强调）

### 功能完整性（必须 100%）

```
✅ 所有 33 个节点类型都能使用
✅ ForLoop 容器样式完美匹配 Flowgram ★
✅ DSL 双向转换准确
✅ 所有现有功能都已迁移
✅ Agent 规划功能正常
```

### 兼容性（必须 ≥ 95%）

```
✅ 至少 95% 生产规则兼容
✅ 后端 API 完全不变
✅ 数据库 schema 完全不变
✅ 旧规则无需手动迁移
```

### 性能（必须达标）

```
✅ 100 节点加载 < 2s
✅ 200 节点加载 < 5s
✅ DSL 构建 < 100ms (100 nodes)
✅ 画布操作 60 FPS
✅ 内存占用合理（< 100MB for 200 nodes）
```

### 质量（必须无严重缺陷）

```
✅ 代码覆盖率 ≥ 85%
✅ 无 P0/P1 bug
✅ P2 bug < 5 个
✅ TypeScript 类型完整
✅ Code Review 通过
```

---

## 🎊 项目收尾检查清单

### 代码质量

- [ ] 所有代码都有适当的注释
- [ ] 所有 TODO 都已清理
- [ ] 所有 console.log 调试代码都已移除
- [ ] 所有魔法数字都已提取为常量
- [ ] 所有重复代码都已重构

### 文档完整性

- [ ] README 更新（新编辑器使用说明）
- [ ] CHANGELOG 更新
- [ ] API 文档完整
- [ ] 迁移指南完整
- [ ] 故障排查指南完整

### 测试覆盖

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 所有 E2E 测试通过
- [ ] 回归测试 ≥ 95% 通过
- [ ] 性能测试达标

### 部署准备

- [ ] Feature Flag 配置完成
- [ ] 环境变量文档完整
- [ ] 灰度发布计划就绪
- [ ] 监控告警配置完成
- [ ] 回滚预案准备就绪
- [ ] 用户通知邮件草稿完成

### 团队交接

- [ ] 技术分享会已完成（向团队介绍新编辑器）
- [ ] 运维手册已交付
- [ ] On-call 轮值计划已制定
- [ ] 知识库文章已发布

---

## 📚 参考资料归档

### 内部资料

- 本 OpenSpec 变更的所有文档
- 技术调研报告
- 决策记录（ADR）
- 性能测试报告
- 回归测试报告

### 外部资料

- Flowgram.ai 官方文档（版本快照）
- 关键第三方库文档（版本快照）
- 相关技术博客文章
- 问题排查记录

---

## 🎉 项目成功庆祝计划

### 里程碑庆祝

**M1 达成**（Week 2）：
- 🍕 团队午餐

**M2 达成**（Week 3）：
- 🎂 ForLoop 容器完成派对 ★

**M3 达成**（Week 6）：
- 🍻 所有节点完成庆祝

**M5 达成**（Week 8）：
- 🎊 项目成功发布庆典

---

## 💡 经验教训（未来回顾时填写）

### 做得好的地方

- [ ] 提前做 PoC 验证
- [ ] 建立标准化的节点模板
- [ ] 完整的测试覆盖
- [ ] 清晰的文档

### 可以改进的地方

- [ ] 时间估算
- [ ] 风险预判
- [ ] 团队沟通
- [ ] 技术选型

### 下次要避免的问题

- [ ] 过早优化
- [ ] 忽略测试
- [ ] 文档滞后
- [ ] 技术债务积累

---

## 🔗 相关项目

### 其他需要同步升级的模块

1. **规则链列表页**（优先级：低）
   - 可能需要更新预览图生成逻辑
   - 如果使用了旧编辑器的组件

2. **规则执行日志页**（优先级：低）
   - 如果显示了节点图可视化
   - 需要使用新的渲染器

3. **API 文档**（优先级：中）
   - 更新编辑器相关的 API 说明
   - 补充 DSL 格式说明

---

## 🌟 愿景

**1 年后的规则链编辑器**：

- 🎨 **视觉**：现代、美观、专业
- ⚡ **性能**：快速、流畅、稳定
- 🧩 **易用**：直观、友好、高效
- 🔧 **可维护**：清晰、模块化、可扩展
- 🤝 **协作**：多人、实时、版本管理
- 🤖 **智能**：AI 辅助、自动优化、调试
- 🌐 **开放**：模板市场、社区、生态

**让 DevPilot 的规则链编辑器成为业界最好的可视化规则引擎编辑器！** 🚀

---

_最后更新：2026-04-02_  
_下次审查：Week 4（Phase 4 完成时）_
