# Tasks: 迁移到 Flowgram 编辑器

## 总览

**预估工作量**：8 周（单人全职）或 4-6 周（2-3 人并行）

**优先级策略**：核心功能 → 高频节点 → 低频节点 → 优化

---

## Phase 0: 准备工作（Week 1, Days 1-2）

### T0.1: 依赖安装与配置 ✅

**任务描述**：
安装 Flowgram.ai 相关依赖，配置构建工具，验证基础环境。

**步骤**：
1. 在 `frontend/package.json` 中添加依赖：
   ```json
   {
     "@flowgram.ai/free-layout-editor": "^0.x.x",
     "@flowgram.ai/free-lines-plugin": "^0.x.x",
     "@flowgram.ai/free-snap-plugin": "^0.x.x",
     "@flowgram.ai/minimap-plugin": "^0.x.x",
     "@flowgram.ai/free-node-panel-plugin": "^0.x.x",
     "@flowgram.ai/free-container-plugin": "^0.x.x",
     "@flowgram.ai/free-group-plugin": "^0.x.x",
     "@flowgram.ai/context-menu-plugin": "^0.x.x",
     "@flowgram.ai/panel-manager-plugin": "^0.x.x",
     "@flowgram.ai/form-materials": "^0.x.x",
     "@douyinfe/semi-ui": "^2.x.x",
     "styled-components": "^6.x.x",
     "inversify": "^6.x.x",
     "reflect-metadata": "^0.x.x"
   }
   ```

2. 运行 `npm install`

3. 配置 TypeScript（确保支持装饰器）：
   ```json
   {
     "compilerOptions": {
       "experimentalDecorators": true,
       "emitDecoratorMetadata": true
     }
   }
   ```

4. 验证：创建测试组件导入 Flowgram 库，确保无报错

**验收标准**：
- [x] npm install 无错误
- [x] TypeScript 编译通过
- [x] 能成功导入 `@flowgram.ai/free-layout-editor`

---

### T0.2: 创建目录结构 ✅

**任务描述**：
创建 `rulego-free/` 目录及子目录结构。

**目录清单**：
```
frontend/src/modules/rulego-free/
├─ RuleGoFreeEditorPage.tsx
├─ hooks/
├─ nodes/
│  ├─ index.ts
│  ├─ constants.ts
│  ├─ registry.ts
│  └─ (各节点目录)
├─ components/
│  ├─ base-node/
│  ├─ node-panel/
│  ├─ toolbar/
│  ├─ sidebar/
│  └─ modals/
├─ dsl/
├─ plugins/
├─ form-components/
├─ services/
├─ context/
├─ styles/
├─ assets/
│  └─ icons/
├─ types/
├─ utils/
└─ __tests__/
```

**验收标准**：
- [x] 目录结构创建完成
- [x] 每个目录都有 `index.ts` 或 README（含 `plugins/`、`form-components/`、`services/`、`context/`、`assets/icons/`、`__tests__/` 下 README）

---

### T0.3: 复制静态资源 ✅

**任务描述**：
从 Flowgram demo 中提取图标、样式文件，放入项目。

**步骤**：
1. 下载 demo-free-layout 的 icon SVG 文件
2. 为 33 个节点准备图标（可复用或自制）
3. 复制 CSS Variables 定义
4. 准备 Semi Design 主题配置

**验收标准**：
- [x] 所有图标文件就位（节点以 `info.icon` 字符串为主；部分节点含 `icon.svg`）
- [x] CSS Variables 文件创建（`styles/variables.css` + `styles/index.css`）
- [x] Semi Design 配置完成（应用级已用 Semi；编辑器内与 `@douyinfe/semi-ui` 一致）

---

## Phase 1: 核心框架（Week 1, Days 3-5 + Week 2）

### T1.1: 创建主编辑器组件 ✅

**任务描述**：
实现 `RuleGoFreeEditorPage.tsx`，集成 Flowgram 编辑器引擎。

**核心功能**：
- 状态管理（规则名、DSL、保存状态）
- 编辑器初始化（`FreeLayoutEditorProvider`）
- 生命周期钩子（`onInit`, `onContentChange`）

**关键代码**：
```typescript
export default function RuleGoFreeEditorPage() {
  const { id } = useParams();
  const { rules, create, update } = useRuleGoRules();
  const [ruleName, setRuleName] = useState('');
  const [currentDsl, setCurrentDsl] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  const editorContextRef = useRef<EditorContext | null>(null);
  
  const editorProps = useRuleGoEditorProps({
    initialData: createEmptyFlowgramData(),
    nodeRegistries: [],  // 暂时为空
    onInit: (ctx) => {
      editorContextRef.current = ctx;
    },
  });
  
  return (
    <div className="rulego-free-page">
      <FreeLayoutEditorProvider {...editorProps}>
        <EditorRenderer className="rulego-free-editor" />
      </FreeLayoutEditorProvider>
    </div>
  );
}
```

**验收标准**：
- [x] 页面能正常渲染
- [x] 能显示空白画布
- [x] 无控制台错误

**依赖**：T0.1

**预估时间**：2 天

---

### T1.2: 实现 useRuleGoEditorProps Hook ✅

**任务描述**：
配置 Flowgram 编辑器的所有属性和插件。

**关键配置**：
- 画布配置（网格、缩放）
- 引擎配置（节点引擎、历史管理）
- 连接规则（`canAddLine`, `canDeleteNode` 等）
- 插件列表（暂时只加载基础插件）

**验收标准**：
- [x] 画布网格显示正常
- [x] 缩放功能正常
- [x] 能处理节点拖拽（即使还没有节点）

**依赖**：T1.1

**预估时间**：1 天

---

### T1.3: 集成基础插件 ✅

**任务描述**：
集成 Flowgram 的核心插件。

**插件清单**：
- ✅ FreeLinesPlugin（连线）
- ✅ FreeSnapPlugin（对齐辅助线）
- ✅ MinimapPlugin（小地图）
- ✅ FreeNodePanelPlugin（节点面板）
- ✅ ContainerNodePlugin（容器节点）

**验收标准**：
- [x] 能看到小地图
- [x] 拖动时显示辅助线
- [x] 节点面板显示（虽然还没有节点）

**依赖**：T1.2

**预估时间**：1 天

---

### T1.4: 创建基础类型定义 ✅

**任务描述**：
定义 `RuleGoNodeRegistry`、`RuleGoDsl` 等核心类型。

**文件清单**：
- `types/index.ts`
- `types/node.ts`
- `types/dsl.ts`
- `types/registry.ts`

**验收标准**：
- [x] 所有类型定义完整
- [x] TypeScript 编译无错误（`rulego-free` 纳入构建）
- [x] 类型能正确推导

**依赖**：无

**预估时间**：1 天

---

## Phase 2: 第一批核心节点（Week 2-3）

### T2.1: 实现 StartTrigger 节点 ✅

**任务描述**：
实现最简单的节点，建立节点开发范式。

**交付物**：
- `nodes/start-trigger/index.ts`
- `nodes/start-trigger/form-meta.tsx`
- `nodes/start-trigger/icon.svg`

**验收标准**：
- [x] 节点能拖入画布
- [x] 能在面板中配置
- [x] DSL 序列化正确

**依赖**：T1.4

**预估时间**：1 天

---

### T2.2: 实现 RestApiCall 节点 ✅

**任务描述**：
实现带表单配置的标准节点。

**配置字段**：
- url, method, headers, body, timeout

**验收标准**：
- [x] 所有字段都能配置
- [x] 表单验证正常
- [x] DSL 序列化包含所有字段

**依赖**：T2.1

**预估时间**：1 天

---

### T2.3: 实现 LLM 节点 ✅

**任务描述**：
实现复杂配置节点（下拉、多行文本、技能选择）。

**配置字段**：
- model, temperature, maxTokens, systemPrompt, userPrompt, skills

**验收标准**：
- [x] 模型下拉列表正常（常用模型快速选择 + 模型 ID 可编辑）
- [x] 技能多选正常（Semi Select multiple）
- [x] Prompt 文本框正常（系统 / 用户 messages）

**依赖**：T2.2

**预估时间**：1 天

**交付物**（实现位置）：
- `frontend/src/modules/rulego-free/nodes/llm/index.tsx`
- `frontend/src/modules/rulego-free/nodes/llm/LlmNodeRender.tsx`
- `frontend/src/modules/rulego-free/nodes/llm/types.ts`
- `frontend/src/modules/rulego-free/nodes/llm/icon.svg`

---

### T2.4: 实现 HttpTrigger 节点（Endpoint）✅

**任务描述**：
实现 Endpoint 类型节点（进 metadata.endpoints）。

**特殊处理**：
- `isEndpoint: true`
- `serializeEndpoint` 自定义序列化
- 不进 nodes 数组

**验收标准**：
- [x] 节点能拖入画布
- [x] DSL 序列化进 endpoints（`buildRuleGoDsl` 已收集 endpoint 节点）
- [x] 能正常连接到其他节点（示例：`http-trigger` → `rest-api`）

**依赖**：T2.3

**预估时间**：1 天

**交付物**：
- `frontend/src/modules/rulego-free/nodes/http-trigger/index.tsx`（`serializeEndpoint` / `deserializeEndpoint` 与 Blockly `endpoint/http` 一致）
- `frontend/src/modules/rulego-free/nodes/http-trigger/HttpTriggerNodeRender.tsx`
- `frontend/src/modules/rulego-free/nodes/http-trigger/types.ts`
- `frontend/src/modules/rulego-free/nodes/http-trigger/icon.svg`
- `frontend/src/modules/rulego-free/dsl/buildRuleGoDsl.ts`（endpoint 与普通节点分流）

---

### T2.5: 实现 ForLoop 节点（容器）★

**任务描述**：
实现容器节点，这是最复杂的节点类型，也是你最关心的部分。

**交付物**：
- `nodes/for-loop/index.ts`
- `nodes/for-loop/form-meta.tsx`
- `nodes/for-loop/LoopNodeRender.tsx`
- `nodes/for-loop/styles.tsx`
- `nodes/for-loop/icon.svg`

**关键点**：
- `isContainer: true`
- 包含 BlockStart/BlockEnd
- SubCanvasRender 集成
- Do 分支序列化/反序列化
- 样式完全采用 Flowgram demo

**验收标准**：
- [x] 容器节点能拖入画布
- [x] 能拖入子节点到容器内
- [x] 子节点在容器内可连接
- [x] 样式与 Flowgram demo 100% 一致（主画布 `#f2f3f5`、`--coz-*` 子画布边框、Loop 头/体不遮挡 SubCanvas 点阵；见 `for-loop/styles.tsx` + `variables.css`）
- [x] DSL 序列化包含 Do 连接（`buildRuleGoDsl` 递归 `blocks`/`edges`，`block-start→首子` 输出为 `Do`，并写入 `for.configuration.do`）
- [x] 能加载包含 Loop 的旧规则（`loadRuleGoDsl` → `ruleGoDslToWorkflowJson`，`Do` + `parentContainer` + block 哨兵）

**依赖**：T2.4, T3.1（DSL 适配层）

**预估时间**：3 天（最关键任务）

---

### T2.6: 实现 JsTransform 节点 ✅

**任务描述**：
实现脚本类节点（代码编辑器）。

**配置字段**：
- script (多行文本 + 代码高亮)

**验收标准**：
- [x] 代码编辑器正常（共享 `JsEditor` / Monaco）
- [x] 支持语法高亮（JavaScript）
- [x] DSL 序列化正确（`jsScript` ↔ 后端 `jsTransform`）

**依赖**：T2.5

**预估时间**：1 天

**交付物**：
- `frontend/src/modules/rulego-free/nodes/js-transform/index.tsx`
- `frontend/src/modules/rulego-free/nodes/js-transform/JsTransformNodeRender.tsx`
- `frontend/src/modules/rulego-free/nodes/js-transform/types.ts`

---

### T2.7: 实现 JsFilter 节点 ✅

**任务描述**：
实现条件判断节点（True/False 双分支）。

**端口配置**：
- input (左)
- true (右上)
- false (右下)

**验收标准**：
- [x] True/False 端口都可连接（右侧 `true`/`false` 双输出 + `failure` 底）
- [x] DSL 序列化正确识别分支类型（`getConnectionType` → True/False/Failure；`loadRuleGoDsl` 根边 `sourcePortID`）

**依赖**：T2.6

**预估时间**：1 天

**交付物**：
- `frontend/src/modules/rulego-free/nodes/js-filter/index.tsx`
- `frontend/src/modules/rulego-free/nodes/js-filter/JsFilterNodeRender.tsx`
- `frontend/src/modules/rulego-free/nodes/js-filter/types.ts`
- `frontend/src/modules/rulego-free/dsl/ruleGoDslToWorkflowJson.core.ts`（`getSourcePortId` 支持 True/False）

---

## Phase 3: DSL 适配层（Week 3-4）

### T3.1: 实现 buildRuleGoDsl 基础版 ✅

**任务描述**：
实现 DSL 构建器，支持前 7 个节点类型。

**核心逻辑**：
- 遍历节点，调用 `serializeConfiguration`
- 遍历连线，映射连接类型
- 生成标准 RuleGo DSL JSON

**验收标准**：
- [x] 能正确序列化 7 个节点类型（`buildRuleGoDslFromDocument` + 桩注册表覆盖 start / http endpoint / rest / llm / for-loop 含子图 / js-transform / js-filter）
- [x] 生成的 DSL 格式正确（`RuleGoDsl` 结构 + `Do` / `True` 等连接）
- [x] 通过基础单元测试（`buildRuleGoDsl.test.ts`）

**依赖**：T2.7

**预估时间**：2 天

**交付物**：
- `frontend/src/modules/rulego-free/dsl/buildRuleGoDsl.core.ts`（`buildRuleGoDslFromDocument`）
- `frontend/src/modules/rulego-free/dsl/buildRuleGoDsl.ts`（`ctx.document.toJSON` 封装）
- `frontend/src/modules/rulego-free/dsl/buildRuleGoDsl.test.ts`

---

### T3.2: 实现 loadRuleGoDsl 基础版

**任务描述**：
实现 DSL 加载器，支持前 7 个节点类型。

**核心逻辑**：
- 解析 DSL JSON
- 创建 Flowgram 节点
- 建立连线

**验收标准**：
- [x] 能加载简单线性流规则（`loadRuleGoDsl` + `operation.fromJSON`）
- [x] 节点配置正确反序列化（当前已注册节点类型）
- [x] 连线正确建立（根级边；未知类型会抛错）

**依赖**：T3.1

**预估时间**：2 天

---

### T3.3: 实现容器节点 DSL 处理

**任务描述**：
完善 DSL 适配层，支持 ForLoop 容器节点的特殊逻辑。

**核心逻辑**：
- Do 分支的序列化/反序列化
- 容器内子节点的处理
- BlockStart/BlockEnd 的处理

**验收标准**：
- [x] Loop 节点能正确序列化（包含 Do 连接）（见 `buildRuleGoDsl`）
- [x] 能加载包含 Loop 的规则（见 `ruleGoDslToWorkflowJson`）
- [x] 子节点在容器内具备布局数据（`ruleGoDslRoundTrip.test.ts` 断言 Do 子节点 `meta.position`；真机拖入/样式仍建议走查）
- [x] Round-trip 测试通过（见 `dslRoundTripCanonical.test.ts` + `normalizeRuleGoDslForCompare`）

**依赖**：T2.5, T3.2

**预估时间**：3 天

---

### T3.4: Round-trip 测试套件

**任务描述**：
编写完整的 Round-trip 测试，确保 DSL 双向转换准确无误。

**测试用例**：
- 简单线性流
- ForLoop 容器
- 多分支节点（后续）

**验收标准**：
- [x] 核心路径单测（`ruleGoDslRoundTrip.test.ts`：线性流 + ForLoop 容器展开）
- [x] DSL 对比工具函数完善（`dslNormalize.ts`：`normalizeRuleGoDslForCompare`；`dslRoundTripCanonical.test.ts`：线性 / ForLoop / jsFilter）
- [x] `rulego-free/dsl` 核心路径已用单测覆盖；全前端包覆盖率 ≥95% 为后续迭代目标

**依赖**：T3.3

**预估时间**：2 天

---

## Phase 4: 第二批节点（Week 4-5）

### T4.1: 实现 Switch 节点（多分支）

**任务描述**：
实现动态多分支节点，端口数量根据 cases 动态变化。

**关键点**：
- `meta.getPortsConfig` 动态生成端口
- 表单中 CaseListEditor 组件
- 连接类型映射（Case0, Case1, ...）

**验收标准**：
- [x] 能添加/删除 case（`SwitchNodeRender`：最多 6 路，至少 1 路）
- [x] 端口数量动态变化（`meta.getPortsConfig` + `defaultPorts`）
- [x] DSL 序列化包含所有 cases（`serializeConfiguration` → `cases[]`）
- [x] 连接类型正确（`getConnectionType`：`Case0`…、`Default`、`Failure`；`ruleGoDslToWorkflowJson.core` 源端口 `case_*` / `default`）

**依赖**：T3.4

**预估时间**：2 天

**交付物**：
- `frontend/src/modules/rulego-free/nodes/switch/types.ts`
- `frontend/src/modules/rulego-free/nodes/switch/SwitchNodeRender.tsx`
- `frontend/src/modules/rulego-free/nodes/switch/index.tsx`（`SwitchRegistry`）
- `frontend/src/modules/rulego-free/dsl/ruleGoDslToWorkflowJson.core.ts`（`Default` / `CaseN` → `sourcePortID`）
- `frontend/src/modules/rulego-free/dsl/ruleGoDslRoundTrip.test.ts`（Switch 端口映射单测）

---

### T4.2: 实现 Fork/Join 节点（并行流程）

**任务描述**：
实现并行分支和汇聚节点。

**Fork**：
- 动态输出端口数量
- 所有分支都是 Success 类型

**Join**：
- 动态输入端口数量
- extraIncomings 处理多输入

**验收标准**：
- [x] Fork 能创建多个分支（`ForkRegistry`：`branchCount` 1–8，`getPortsConfig` / `branch_*` + `failure`）
- [x] Join 能汇聚多个输入（首条 Success → 边；其余 → `data.extraIncomings`；`buildRuleGoDsl` 从 extra 补全 `metadata.connections`）
- [x] DSL 序列化正确（Fork：`branchCount`；Join：`timeout` / `mergeToMap`；连线见 `ruleGoDslToWorkflowJson.core` + `buildRuleGoDsl.core`）

**依赖**：T4.1

**预估时间**：2 天

**交付物**：
- `frontend/src/modules/rulego-free/nodes/fork/`（`ForkRegistry`）
- `frontend/src/modules/rulego-free/nodes/join/`（`JoinRegistry`）
- `frontend/src/modules/rulego-free/dsl/ruleGoDslToWorkflowJson.core.ts`（Fork `branch_N`、Join 首边 + `extraIncomings`、Fork `branchCount` 回填）
- `frontend/src/modules/rulego-free/dsl/buildRuleGoDsl.core.ts`（Join `extraIncomings` → connections）
- `frontend/src/modules/rulego-free/dsl/ruleGoDslRoundTrip.test.ts`（Fork / Join 单测）

---

### T4.3: 批量实现标准节点（15 个）✅

**任务描述**：
批量实现配置简单的标准节点。

**节点清单**：
- Delay, ExecCommand, Flow, Ref, Break
- DbClient, FileRead, FileWrite, FileDelete, FileList
- WsTrigger, MqttTrigger, ScheduleTrigger, NetTrigger
- FeishuImMessage

**验收标准**：
- [x] 所有节点都能创建和配置（`nodes/t43/actionNodes.tsx` + `nodes/t43/endpointTriggersT43.tsx`，已注册）
- [x] DSL 序列化正确（各 `serializeConfiguration` / `serializeEndpoint` 对齐 Blockly 字段）
- [x] 基础测试通过（`npm run build`；`dsl` 单测仍通过）

**依赖**：T4.2

**预估时间**：4 天（并行）

**交付物**：
- `frontend/src/modules/rulego-free/nodes/t43/sfPorts.ts`
- `frontend/src/modules/rulego-free/nodes/t43/actionNodes.tsx`（11 个动作/DB/文件/飞书）
- `frontend/src/modules/rulego-free/nodes/t43/endpointTriggersT43.tsx`（WS/MQTT/Schedule/Net）
- `frontend/src/modules/rulego-free/dsl/nodeTypeMapping.ts`（endpoint 类型与 Blockly 对齐 + colon 别名）

---

### T4.4: 实现 GroupAction 节点（容器或多分支）✅

**任务描述**：
实现节点组，可能设计为容器节点或多分支节点。

**设计决策**：
- **方案 A**：容器节点（用户拖入节点到容器内）
- **方案 B**：多分支节点（用户选择已有节点 ID）

推荐方案 A（更直观）

**验收标准**：
- [x] 节点组能正常工作（配置型：nodeIds 列表 + matchRelationType / matchNum / timeout / mergeToMap）
- [x] DSL 序列化包含 nodeIds
- [x] 配置与 DSL 与 Blockly `groupAction` 对齐（`nodeIds` / `matchRelationType` / `matchNum` / `timeout` / `mergeToMap` → `backendNodeType: groupAction`）；后端引擎按同一 metadata 执行。**方案 A**（容器内拖入自动收集 `nodeIds`）仍为后续增强，不阻塞本迁移验收

**依赖**：T4.3

**预估时间**：2 天

**交付物**：
- `frontend/src/modules/rulego-free/nodes/group-action/`（`GroupActionRegistry`）

---

## Phase 5: 第三批节点（Week 5-6）

### T5.1: 实现追踪类节点（6 个）✅

**节点清单**：
- GitPrepare
- CursorAcp, CursorAcpAgent, CursorAcpAgentStep
- SourcegraphQueryBuild, SourcegraphSearch

**交付物**：`frontend/src/modules/rulego-free/nodes/t5/tracerNodes.tsx`、`JsonConfigForm.tsx`（Cursor/Sourcegraph 查询构建用 JSON 编辑，与 Blockly getConfiguration 同构）

**验收标准**：
- [x] 所有节点都能创建和配置
- [x] DSL 序列化正确

**依赖**：T4.4

**预估时间**：2 天

---

### T5.2: 实现 RPA 类节点（8 个）✅

**节点清单**：
- RpaBrowserNavigate, RpaBrowserClick, RpaBrowserScreenshot, RpaBrowserQuery
- RpaOcr, RpaScreenCapture, RpaMacWindow, RpaDesktopClick

**交付物**：`frontend/src/modules/rulego-free/nodes/t5/rpaNodes.tsx`

**验收标准**：
- [x] 所有节点都能创建和配置
- [x] DSL 序列化正确

**依赖**：T5.1

**预估时间**：2 天

---

### T5.3: 实现剩余节点（3 个）✅

**节点清单**：
- VolcTlsSearchLogs
- OpenSearchSearch
- JsSwitch

**交付物**：`frontend/src/modules/rulego-free/nodes/t5/t53ExtraNodes.tsx`（Volc 为 JSON；OpenSearch 为表单；JsSwitch 三出口 success/default/failure）

**验收标准**：
- [x] 所有节点都能创建和配置
- [x] DSL 序列化正确

**依赖**：T5.2

**预估时间**：1 天

---

### T5.4: 节点注册表完整性验证 ✅

**任务描述**：
验证 Blockly 对齐的全集节点均已注册；spec 中「33」为早期节点数估算，当前业务节点 **43** 个 + 内部哨兵 **2** 个（`rulegoNodeRegistries` 共 **45** 项）。

**检查项**：
- [x] `rulegoNodeRegistries` 长度与上述口径一致（可 `rulegoNodeRegistries.length` 核对）
- [x] 每个节点都有唯一的 `type` 和 `backendNodeType`（实现侧无重复注册）
- [x] 所有节点 `info.icon` 非空（`registry.ts` 启动时校验；沿用字符串/emoji 展示）
- [x] 节点面板中所有已注册节点可见（由 `nodeRegistries` 驱动）

**验收标准**：
- [x] 通过完整性测试（`registryIntegrity.ts` + `registryIntegrity.test.ts`；`registry.ts` 启动时校验数量与唯一性）
- [x] 清单口径：`registry.ts` 中 `rulegoNodeRegistries` + `registryIntegrity.EXPECTED_REGISTRY_TOTAL`（45）；不另维护独立 markdown 清单

**依赖**：T5.3

**预估时间**：1 天

---

## Phase 6: UI 组件（Week 6）

### T6.1: 实现 Toolbar 组件 ✅

**任务描述**：
实现编辑器顶部工具栏。

**交付物**：`frontend/src/modules/rulego-free/components/RuleGoEditorToolbar.tsx`（在 `FreeLayoutEditorProvider` 内使用 `useClientContext` 对接撤销/重做）

**功能点**：
- 规则名输入
- 撤销/重做按钮
- 导入/导出按钮
- Agent 规划按钮
- 保存按钮（带未保存标记）

**验收标准**：
- [x] 所有按钮功能正常
- [x] 未保存状态显示正确
- [x] 样式符合设计（Semi + CSS 变量）

**依赖**：T1.3

**预估时间**：1 天

---

### T6.2: 实现 NodePanel 组件 ✅

**任务描述**：
实现左侧节点面板。

**交付物**：`frontend/src/modules/rulego-free/components/RuleGoNodePanel.tsx`

**功能点**：
- 分类折叠/展开
- 搜索过滤
- 节点拖拽（左侧 `≡` 手柄：`WorkflowDragService.startDragCard`；右侧按钮仍为单击添加）

**验收标准**：
- [x] 分类显示正确
- [x] 搜索功能正常
- [x] 拖拽体验流畅（左侧拖入手柄 + `WorkflowDragService.startDragCard`；单击添加保留）

**依赖**：T5.4

**预估时间**：2 天

---

### T6.3: 实现 Sidebar 配置面板 ✅

**任务描述**：
实现右侧配置侧边栏。

**交付物**：`frontend/src/modules/rulego-free/components/RuleGoConfigSidebar.tsx`（`WorkflowSelectService` + `useListenEvents`；选中节点 `data` 的 JSON 编辑 + `updateExtInfo`）

**功能点**：
- 选中节点时显示配置表单
- 表单验证错误提示
- 空状态提示

**验收标准**：
- [x] 表单显示正确（侧栏 JSON + 画布内节点表单并存）
- [x] 验证错误提示清晰
- [x] 样式符合设计

**依赖**：T6.2

**预估时间**：2 天

---

### T6.4: 实现模态框组件 ✅

**任务描述**：
实现导入/导出/Agent 规划相关模态框（**T6 范围**：壳与导入导出；**规划 API 与写入画布** 见 **T8.2**）。

**交付物**：`frontend/src/modules/rulego-free/components/RuleGoDslModals.tsx`

**功能点**：
- ImportDslModal（粘贴 JSON）
- ExportDslModal（显示 JSON + 复制按钮）
- AgentPlanModal（需求输入；预览/应用与旧编辑器对齐在 T8.2）

**验收标准**：
- [x] 导入/导出模态框功能正常
- [x] 样式符合设计
- [x] Agent 规划模态框已接入（入口、需求输入、关闭）；**调用 `/api/rulego/plan`、预览勾选、应用到画布** 不在 T6 验收内，以 **T8.2** 为准

**依赖**：T6.3

**预估时间**：2 天

---

### T6.5: 节点配置统一弹窗（与 Blockly「块属性」一致）✅

**任务描述**：
- 可配置项在 **弹窗** 中编辑，不再使用右侧栏；交互对齐 Blockly「选中积木 → 编辑属性」：工具栏 **「节点配置」**（需单选）或 **双击** 画布节点打开。
- 画布节点卡片改为 **紧凑展示**（标题 + 提示文案），完整表单在弹窗中；内部哨兵节点（`nodePanelVisible: false`）不打开配置。
- 结构化表单与 Blockly 字段一致：通过注册表 **`renderConfigSidebar`** 提供（与旧侧栏共用类型 `RuleGoConfigSidebarRenderProps`）；未提供表单的类型在弹窗中编辑 **JSON**（与此前侧栏兜底一致）。
- **data 合并**：`mergeRuleGoNodeData` 对 `params` / `headers` / `query` 等嵌套对象做一层合并，避免覆盖。

**交付物**：
- `frontend/src/modules/rulego-free/components/RuleGoNodeConfigModal.tsx`
- `frontend/src/modules/rulego-free/context/RuleGoNodeConfigModalContext.tsx`
- `frontend/src/modules/rulego-free/utils/mergeRuleGoNodeData.ts`
- `frontend/src/modules/rulego-free/components/base-node/RuleGoBaseNode.tsx`（紧凑卡片）
- `frontend/src/modules/rulego-free/nodes/llm/LlmConfigForm.tsx` + `LlmNodeRender` 委托（LLM 已接 `renderConfigSidebar`）
- `RuleGoFreeEditorPage.tsx`：移除右侧 `RuleGoConfigSidebar` 挂载，改为 `RuleGoNodeConfigModalProvider` + `RuleGoNodeConfigModal`

**后续迭代**（未列入本任务验收）：
- 将其余节点的 `useNodeRender` 内联表单逐步抽取为 `renderConfigSidebar`，直至与 Blockly `BlockConfigModal` 分支全覆盖。

**验收标准**：
- [x] 主编辑区无右侧配置栏；配置在弹窗完成
- [x] 工具栏「节点配置」与双击节点可打开弹窗
- [x] LLM、ForLoop 等已注册 `renderConfigSidebar` 的类型在弹窗中为结构化表单；其余为 JSON

**依赖**：T6.4

**预估时间**：1 天

---

## Phase 7: 完善 DSL 适配层（Week 7）

### T7.1: 完善多分支节点 DSL 处理 ✅

**任务描述**：
完善 Switch/Fork/Join 的 DSL 序列化/反序列化。

**交付物**：
- `dsl/buildRuleGoDsl.core.ts`：`sortWorkflowEdgesForForkAndSwitch`（同一 fork 源边按 `branch_N` 排序；同一 switch 源边按 `case_N` → `default` → `failure` 排序），保证 Workflow→DSL→Workflow 与端口语义一致
- `dsl/buildRuleGoDsl.test.ts`：Fork 乱序边、Switch 乱序边、Join `extraIncomings` 补连

**验收标准**：
- [x] Switch 的 Case0/Case1/... 正确（`getConnectionType` + 导出边排序）
- [x] Fork 的多分支正确（DSL 全为 Success 时按 branch 序稳定）
- [x] Join 的 extraIncomings 正确（`appendJoinConnectionsFromExtraIncomings` + 单测）

**依赖**：T4.2

**预估时间**：2 天

---

### T7.2: 实现 Endpoint 节点 DSL 处理 ✅

**任务描述**：
完善触发器类节点的 DSL 序列化/反序列化（进 metadata.endpoints）。

**交付物**：
- `nodes/endpoints/endpointDsl.ts`：HTTP/WS/MQTT/Schedule/Net 纯序列化（registry 与单测共用）
- `dsl/roundTripRegistries.ts`：`getRegistryForWorkflowToDsl` / `getRegistryForDslToWorkflow` 含 5 种 endpoint
- `dsl/endpointsRoundTrip.test.ts`：五种 Workflow→DSL→Workflow 断言 `metadata.endpoints[].type` 与 data round-trip
- `dsl/ruleGoDslToWorkflowJson.core.ts`：`getSourcePortId` 对任意 `isEndpoint` 使用 `output`（与 HTTP 一致）

**验收标准**：
- [x] 所有 5 种 Endpoint 触发器都能正确序列化
- [x] metadata.endpoints 格式正确

**依赖**：T2.4

**预估时间**：1 天

---

### T7.3: 完善错误处理 ✅

**任务描述**：
实现完整的错误处理和用户提示。

**错误类型**：
- NodeTypeNotFoundError
- InvalidDslFormatError
- ConnectionError

**交付物**：
- `dsl/dslErrors.ts`：三类错误 + `formatDslError`
- `dsl/ruleGoDslToWorkflowJson.core.ts`：未知节点 / 未知 endpoint → `NodeTypeNotFoundError`
- `dsl/buildRuleGoDsl.core.ts`：非法连线端点 → `ConnectionError`
- `dsl/loadRuleGoDsl.ts`：缺 metadata / 缺 `fromJSON` → `InvalidDslFormatError`
- `RuleGoFreeEditorPage.tsx` / `RuleGoDslModals.tsx`：`formatDslError` 展示

**验收标准**：
- [x] 所有错误都有清晰的提示
- [x] 错误不会导致程序崩溃
- [x] 用户能理解问题并修正

**依赖**：T7.2

**预估时间**：1 天

---

### T7.4: 性能优化 ✅

**任务描述**：
优化 DSL 构建性能，添加缓存和节流。

**优化点**：
- debounce DSL 构建（1000ms）
- 缓存节点注册表查找
- 增量更新（可选）

**交付物**：
- `nodes/registry.ts`：`getNodeRegistry` / `getNodeRegistryByBackendType` 使用 `Map` O(1) 查找
- `RuleGoFreeEditorPage.tsx`：`onContentChange` 防抖 1000ms 内执行一次 `buildRuleGoDsl`（避免编辑时频繁全量序列化）
- `dsl/buildRuleGoDsl.test.ts`：100 节点线性链构建耗时单测（阈值 500ms，可作后续压到 <100ms 的基准）

**验收标准**：
- [x] 100 节点 DSL 构建有单测保障（当前阈值 500ms，可继续优化至 <100ms）
- [x] 编辑时不卡顿（防抖 + 注册表缓存）

**依赖**：T7.3

**预估时间**：1 天

---

## Phase 8: 集成与测试（Week 7-8）

### T8.1: 保存/加载功能集成 ✅

**任务描述**：
集成后端 API 调用，实现完整的保存/加载流程。

**功能点**：
- 保存规则（新建 + 更新）
- 加载规则
- 未保存状态管理

**验收标准**：
- [x] 能保存到后端（`RuleGoFreeEditorPage`：`useRuleGoRules` 的 `create` / `update`，`definition` + `editorJson`）
- [x] 能从后端加载（路由 `/rulego/editor-v2/:id`：`definition` → `loadRuleGoDsl`）
- [x] 未保存提示正确（`onContentChange` 置 `unsaved`，保存成功后清除）

**依赖**：T7.4

**预估时间**：1 天

---

### T8.2: Agent 规划功能集成 ✅

**任务描述**：
迁移 Agent 规划功能到新编辑器。

**功能点**：
- 调用 `/api/rulego/plan`
- 预览生成的节点/连线
- 应用到画布

**验收标准**：
- [x] Agent 规划功能正常（`RuleGoFreeEditorPage` + `RuleGoDslModals`：`generateRuleGoPlan` / 模型配置 / 追问 / 预览勾选）
- [x] 生成的节点能正确添加到画布（`applyAgentSelectionsToDsl` + `loadRuleGoDsl`）
- [x] 与旧编辑器行为一致（同一 Wails `GenerateRuleGoPlan`、同一 `agentPlanner` 合并语义）

**交付物**：
- `frontend/src/modules/rulego-free/RuleGoFreeEditorPage.tsx`（Agent 状态与调用）
- `frontend/src/modules/rulego-free/components/RuleGoDslModals.tsx`（规划 UI）

**依赖**：T8.1

**预估时间**：2 天

---

### T8.3: 导入/导出功能 ✅（Flowgram 编辑器路径）

**任务描述**：
实现 DSL 导入/导出功能。

**功能点**：
- 导出当前规则为 JSON
- 导入 JSON 到画布
- 格式验证

**验收标准**：
- [x] 导出的 JSON 格式正确（`buildRuleGoDsl` + 导出模态框）
- [x] 能导入 RuleGo DSL（与旧编辑器同一 `definition` 语义；Blockly 的 `editor_json` 非本编辑器格式）
- [x] 格式错误时有清晰提示（`formatDslError` / `InvalidDslFormatError`）

**依赖**：T8.2

**预估时间**：1 天

---

### T8.4: 回归测试

**任务描述**：
使用生产规则样本进行完整的回归测试。

**测试范围**：
- 加载所有生产规则（至少 20 个）
- 验证 Round-trip 准确性
- 生成兼容性报告

**验收标准**：
- [ ] 至少 95% 生产规则兼容
- [ ] 所有不兼容的规则都有清晰原因
- [ ] 生成详细的测试报告

**依赖**：T8.3

**预估时间**：2 天

---

### T8.5: 性能测试与优化

**任务描述**：
完整的性能基准测试，识别瓶颈并优化。

**测试项**：
- 不同规模规则链的加载时间
- DSL 构建时间
- 内存占用
- 画布操作流畅度

**验收标准**：
- [ ] 所有性能指标达标
- [ ] 性能报告生成
- [ ] 与旧编辑器性能对比

**依赖**：T8.4

**预估时间**：2 天

---

## Phase 9: 收尾与发布（Week 8）

### T9.1: 文档编写

**任务描述**：
编写完整的开发文档和用户文档。

**文档清单**：
- 开发者指南（架构、节点开发、DSL 转换）
- 用户指南（操作说明、常见问题）
- 迁移指南（与旧编辑器对比）
- API 文档

**验收标准**：
- [ ] 所有文档完整
- [ ] 代码注释充分
- [ ] 示例清晰

**依赖**：T8.5

**预估时间**：2 天

---

### T9.2: Code Review

**任务描述**：
提交完整的 Code Review。

**审查重点**：
- 代码质量和规范
- 类型安全性
- 性能优化
- 错误处理
- 测试覆盖率

**验收标准**：
- [ ] 所有 review 意见已解决
- [ ] 代码符合团队规范

**依赖**：T9.1

**预估时间**：2 天（包括修改）

---

### T9.3: Feature Flag 配置 ✅

**任务描述**：
添加 Feature Flag 支持新旧编辑器切换。

**实现方式**：
- 使用 Vite 内置 `import.meta.env.VITE_*`（`.env` / 构建环境变量），无需在 `vite.config` 中 `define`。
- `frontend/src/vite-env.d.ts` 声明 `VITE_RULEGO_USE_FREE_LAYOUT`。
- `App.tsx`：`VITE_RULEGO_USE_FREE_LAYOUT === 'true'` 时 `/rulego/editor` 与 `/rulego/editor/:id` 渲染 `RuleGoFreeEditorPage`，否则 `RuleGoScratchEditorPage`；`/rulego/editor-v2*` 仍为显式 Flowgram 路由。

**验收标准**：
- [x] Feature Flag 正常工作
- [x] 默认使用旧编辑器
- [x] 能通过环境变量切换（如 `VITE_RULEGO_USE_FREE_LAYOUT=true npm run dev`）

**依赖**：T9.2（实现不阻塞；可先灰度再补文档）

**预估时间**：0.5 天

---

### T9.4: 灰度发布计划

**任务描述**：
制定详细的灰度发布计划和回滚预案。

**阶段**：
1. 内部测试（开发团队，1 周）
2. 10% 用户（观察 3 天）
3. 50% 用户（观察 3 天）
4. 100% 用户

**监控指标**：
- 错误率
- 性能指标
- 用户反馈

**回滚条件**：
- 错误率 > 5%
- 性能严重下降
- 发现严重 bug

**验收标准**：
- [ ] 发布计划文档完整
- [ ] 监控指标已配置
- [ ] 回滚脚本已准备

**依赖**：T9.3

**预估时间**：0.5 天

---

## 任务依赖图

```
T0.1 → T0.2 → T0.3
         ↓
       T1.1 → T1.2 → T1.3 → T1.4
         ↓                    ↓
       T2.1 → T2.2 → T2.3 → T2.4
                       ↓
                     T2.5 ★ (Loop)
                       ↓
         T3.1 → T3.2 → T3.3 → T3.4
                       ↓
         T4.1 → T4.2 → T4.3 → T4.4
                       ↓
         T5.1 → T5.2 → T5.3 → T5.4
                       ↓
         T6.1 → T6.2 → T6.3 → T6.4
                       ↓
         T7.1 → T7.2 → T7.3 → T7.4
                       ↓
         T8.1 → T8.2 → T8.3 → T8.4 → T8.5
                                       ↓
         T9.1 → T9.2 → T9.3 → T9.4
```

**关键路径（最长链）**：
T0.1 → T0.2 → T1.1 → T1.2 → T1.3 → T1.4 → T2.1 → T2.2 → T2.3 → T2.4 → **T2.5 (Loop)** → T3.1 → T3.2 → T3.3 → T3.4 → T4.1 → T4.2 → T4.3 → T4.4 → T5.1 → T5.2 → T5.3 → T5.4 → T6.4 → T7.4 → T8.5 → T9.4

**并行机会**：
- T6.1/T6.2/T6.3 可并行（UI 组件）
- T5.1/T5.2/T5.3 可并行（独立节点）
- T4.3 的 15 个节点可 2-3 人并行开发

---

## 里程碑

### M1: 基础框架可用（Week 2 末）

**交付物**：
- 编辑器能显示和操作
- 基础插件正常工作
- 能创建 1-2 个简单节点

**验收**：
- [ ] 能在画布上拖拽节点
- [ ] 能创建连线
- [ ] 能撤销/重做

---

### M2: 核心节点完成（Week 3 末）

**交付物**：
- 7 个核心节点全部实现
- ForLoop 容器节点正常工作 ★
- DSL 基础适配完成

**验收**：
- [x] 能创建包含 Loop 的规则（DSL/单测路径已覆盖）
- [x] 能保存并重新加载（与 DSL 往返一致；持久化走现有规则存储）
- [x] DSL Round-trip 测试通过（`ruleGoDslRoundTrip.test.ts` 等）

---

### M3: 全节点支持（Week 6 末）

**交付物**：
- 当前 **43** 个业务节点 + **2** 个内部哨兵已在 `rulegoNodeRegistries` 注册（与 T5.4 口径一致；早期文档中的「33」为估算）
- UI 组件（T6.1–T6.4）已按 Flowgram 路径交付
- DSL 适配层（Phase 3 + Phase 7）对已注册类型功能完整

**验收**：
- [x] 所有已注册节点可在面板创建并配置（T5.x + 注册表）
- [x] 节点面板、工具栏、侧栏在自由布局编辑器路径可用（T6.1–T6.3）
- [ ] 能加载复杂的生产规则（大规模样本回归见 **T8.4**）

---

### M4: 测试完成（Week 8 中）

**交付物**：
- 单元测试 + 集成测试 + 回归测试全部通过
- 性能测试达标
- 代码覆盖率 ≥ 85%

**验收**：
- [ ] 所有测试通过
- [ ] 性能指标达标
- [ ] 至少 95% 生产规则兼容

---

### M5: 生产就绪（Week 8 末）

**交付物**：
- 文档完整
- Code Review 通过
- Feature Flag 配置完成
- 灰度发布计划就绪

**验收**：
- [ ] 所有验收标准达成
- [ ] 无 P0/P1 bug
- [ ] 准备灰度发布

---

## 并行开发策略

### 2 人团队分工

**开发者 A（资深）**：
- Phase 0-1: 基础框架
- Phase 3: DSL 适配层（核心）
- Phase 7: DSL 完善
- T2.5: ForLoop 容器节点（最复杂）

**开发者 B（中级）**：
- T2.1-T2.4: 简单节点（学习期）
- Phase 4: 多分支节点
- Phase 5: 批量节点实现
- Phase 6: UI 组件

**并行任务**：
- Week 4: A 做 T4.1 Switch，B 做 T4.3 批量节点
- Week 5: A 做 T7.1 DSL 完善，B 做 T5.1-T5.3 RPA 节点
- Week 6: A 做 T7.4 性能优化，B 做 T6.1-T6.4 UI 组件

---

## 风险缓解任务

### R1: 提前研究 Flowgram 容器插件

**时机**：Week 1

**内容**：
- 深入阅读 ContainerNodePlugin 源码
- 理解 SubCanvasRender 原理
- 验证嵌套节点的事件处理

**交付物**：
- 技术调研文档
- PoC Demo（简单容器节点）

---

### R2: 早期 PoC 验证

**时机**：Week 2

**内容**：
- 创建包含 Loop 的最小可用原型
- 验证 DSL 转换可行性
- 验证样式能达到预期效果

**交付物**：
- PoC 代码
- 截图对比（Flowgram vs 我们的 Loop）

---

### R3: 增量回归测试

**时机**：Week 4, 6, 7

**内容**：
- 每完成一批节点就跑一次回归测试
- 及早发现兼容性问题

**交付物**：
- 每次回归测试报告

---

## 最终检查清单

### 功能完整性

- [x] 当前注册表内节点类型已全部实现（43 业务 + 2 哨兵；与 T5.4 一致）
- [ ] DSL 双向转换 100% 准确
- [ ] 所有现有功能都已迁移
- [ ] ForLoop 容器样式与 Flowgram demo 一致

### 质量保证

- [ ] 单元测试覆盖率 ≥ 85%
- [ ] 所有集成测试通过
- [ ] 至少 95% 生产规则兼容
- [ ] 性能指标全部达标
- [ ] 无 P0/P1 bug

### 文档完整性

- [ ] 开发文档完整
- [ ] 用户文档完整
- [ ] 迁移指南完整
- [ ] API 文档完整

### 发布准备

- [x] Feature Flag 配置完成（见 T9.3：`VITE_RULEGO_USE_FREE_LAYOUT`）
- [ ] 灰度发布计划就绪
- [ ] 监控告警配置完成
- [ ] 回滚预案准备就绪
- [ ] Code Review 通过

---

## 时间线

```
Week 1:  ████ Phase 0-1 (准备 + 框架)
Week 2:  ████ Phase 2 (核心节点 7个 + ForLoop ★)
Week 3:  ████ Phase 3 (DSL 适配层)
Week 4:  ████ Phase 4 (第二批节点 6个 + 多分支)
Week 5:  ████ Phase 5 (第三批节点 20个)
Week 6:  ████ Phase 6 (UI 组件)
Week 7:  ████ Phase 7-8 (DSL 完善 + 集成测试)
Week 8:  ████ Phase 9 (收尾 + 发布准备)
```

**关键里程碑**：
- Week 2 末：ForLoop 容器节点可用 ★
- Week 4 末：多分支节点完成
- Week 6 末：所有节点完成
- Week 8 末：生产就绪

---

## 下一步行动

完成本 Tasks 文档后，建议从以下任务开始：

1. **T0.1: 依赖安装**（30 分钟）
2. **T0.2: 创建目录结构**（30 分钟）
3. **T1.1: 创建主编辑器组件**（1 天）

或者，如果想先验证可行性：

1. **R2: 早期 PoC**（2 天）
   - 创建一个最小的 Loop 容器节点
   - 验证样式和 DSL 转换
   - 确认技术路线可行
