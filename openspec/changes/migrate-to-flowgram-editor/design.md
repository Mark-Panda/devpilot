# Design: Flowgram 编辑器架构设计

## 系统架构

### 整体架构图

```
┌───────────────────────────────────────────────────────────────────────┐
│                        RuleGo Free Layout Editor                      │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  用户界面层                                                            │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ RuleGoFreeEditorPage                                        │     │
│  │  ├─ Toolbar (工具栏)                                         │     │
│  │  ├─ FreeLayoutEditorProvider (编辑器提供者)                  │     │
│  │  │   ├─ EditorRenderer (画布渲染器)                          │     │
│  │  │   └─ DockedPanelLayer (侧边栏容器)                        │     │
│  │  └─ Modals (导入/导出/Agent 规划)                            │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                          ↓                                            │
│  编辑器引擎层 (@flowgram.ai/free-layout-editor)                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ EditorContext                                               │     │
│  │  ├─ NodeManager (节点管理)                                   │     │
│  │  ├─ LineManager (连线管理)                                   │     │
│  │  ├─ PortManager (端口管理)                                   │     │
│  │  ├─ SelectionManager (选择管理)                              │     │
│  │  ├─ HistoryManager (历史/撤销)                               │     │
│  │  └─ VariableEngine (变量引擎)                                │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                          ↓                                            │
│  节点系统层                                                            │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ FlowNodeRegistry[] (33 个节点注册表)                         │     │
│  │  ├─ StartTrigger, HttpTrigger, ...                         │     │
│  │  ├─ RestApiCall, LLM, ...                                  │     │
│  │  ├─ ForLoop ★ (容器节点)                                    │     │
│  │  ├─ Switch, Fork, Join, ...                                │     │
│  │  └─ CursorAcp, Feishu, VolcTls, ...                        │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                          ↓                                            │
│  插件系统层                                                            │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ Plugins                                                     │     │
│  │  ├─ FreeLinesPlugin (连线渲染与交互)                         │     │
│  │  ├─ FreeSnapPlugin (对齐辅助线)                              │     │
│  │  ├─ MinimapPlugin (小地图导航)                               │     │
│  │  ├─ FreeNodePanelPlugin (节点面板)                           │     │
│  │  ├─ ContainerNodePlugin ★ (容器节点支持)                     │     │
│  │  ├─ FreeGroupPlugin (节点分组)                               │     │
│  │  ├─ ContextMenuPlugin (右键菜单)                             │     │
│  │  └─ PanelManagerPlugin (侧边栏管理)                          │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                          ↓                                            │
│  DSL 适配层 (保持后端兼容)                                             │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ DSL Adapter                                                 │     │
│  │  ├─ buildRuleGoDsl() (Flowgram → RuleGo DSL)               │     │
│  │  └─ loadRuleGoDsl() (RuleGo DSL → Flowgram)                │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                          ↓                                            │
│  后端接口 (完全不变)                                                   │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ RuleGo Engine                                               │     │
│  │  ├─ POST /api/rulego/rules (保存规则)                        │     │
│  │  ├─ GET /api/rulego/rules/:id (加载规则)                     │     │
│  │  ├─ POST /api/rulego/execute (执行规则)                      │     │
│  │  └─ POST /api/rulego/plan (Agent 规划)                       │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## 目录结构设计

```
frontend/src/modules/
│
├─ rulego/                           # 旧编辑器（保留 2-4 周）
│  ├─ RuleGoScratchEditorPage.tsx
│  ├─ rulego-blocks/
│  └─ ...
│
├─ rulego-free/                      # 新编辑器 ★
│  │
│  ├─ RuleGoFreeEditorPage.tsx       # 主页面组件
│  │
│  ├─ hooks/                         # Hooks
│  │  ├─ useRuleGoEditorProps.ts     # 编辑器配置
│  │  ├─ useNodeRenderContext.ts     # 节点渲染上下文
│  │  ├─ useIsSidebar.ts             # 侧边栏状态
│  │  └─ usePortClick.ts             # 端口点击处理
│  │
│  ├─ nodes/                         # 节点定义（33个）
│  │  ├─ index.ts                    # 统一导出
│  │  ├─ constants.ts                # 节点类型常量
│  │  ├─ registry.ts                 # 注册表管理
│  │  │
│  │  ├─ start-trigger/              # 手动触发节点
│  │  │  ├─ index.ts                 # FlowNodeRegistry
│  │  │  ├─ form-meta.tsx            # 表单配置
│  │  │  └─ icon.svg                 # 图标
│  │  │
│  │  ├─ http-trigger/               # HTTP 触发器
│  │  │  └─ ...
│  │  │
│  │  ├─ for-loop/                   # For 循环 ★
│  │  │  ├─ index.ts
│  │  │  ├─ form-meta.tsx
│  │  │  ├─ LoopNodeRender.tsx       # 自定义渲染
│  │  │  ├─ styles.tsx               # 样式定义
│  │  │  └─ icon.svg
│  │  │
│  │  ├─ switch/                     # Switch 分支
│  │  ├─ llm/                        # LLM 节点
│  │  ├─ rest-api-call/              # HTTP 客户端
│  │  └─ ...                         # 其他 26 个节点
│  │
│  ├─ components/                    # UI 组件
│  │  ├─ base-node/                  # 基础节点组件
│  │  │  ├─ index.tsx                # BaseNode
│  │  │  ├─ NodeWrapper.tsx          # 节点包装器
│  │  │  ├─ styles.tsx               # 样式
│  │  │  └─ utils.ts                 # 工具函数
│  │  │
│  │  ├─ node-panel/                 # 节点添加面板
│  │  │  ├─ index.tsx
│  │  │  ├─ CategorySection.tsx
│  │  │  └─ NodeDragItem.tsx
│  │  │
│  │  ├─ toolbar/                    # 工具栏
│  │  │  └─ index.tsx
│  │  │
│  │  ├─ sidebar/                    # 配置侧边栏
│  │  │  ├─ index.tsx
│  │  │  ├─ NodeConfigPanel.tsx
│  │  │  └─ EmptyState.tsx
│  │  │
│  │  └─ modals/                     # 模态框
│  │     ├─ ImportDslModal.tsx
│  │     ├─ ExportDslModal.tsx
│  │     └─ AgentPlanModal.tsx
│  │
│  ├─ dsl/                           # DSL 适配层 ★
│  │  ├─ buildRuleGoDsl.ts           # Flowgram → RuleGo DSL
│  │  ├─ loadRuleGoDsl.ts            # RuleGo DSL → Flowgram
│  │  ├─ nodeTypeMapping.ts          # 节点类型映射表
│  │  ├─ connectionTypeMapping.ts    # 连接类型映射表
│  │  └─ containerNodeHandler.ts     # 容器节点特殊处理
│  │
│  ├─ plugins/                       # 自定义插件
│  │  ├─ index.ts
│  │  ├─ context-menu-plugin/        # 右键菜单
│  │  └─ rulego-runtime-plugin/      # 运行时状态显示
│  │
│  ├─ form-components/               # 表单组件库
│  │  ├─ FormHeader.tsx
│  │  ├─ FormContent.tsx
│  │  ├─ FormItem.tsx
│  │  └─ Feedback.tsx
│  │
│  ├─ services/                      # 服务层
│  │  ├─ CustomService.ts            # DI 服务示例
│  │  └─ index.ts
│  │
│  ├─ context/                       # React Context
│  │  ├─ NodeRenderContext.ts
│  │  └─ SidebarContext.ts
│  │
│  ├─ styles/                        # 样式
│  │  ├─ index.css                   # 全局样式
│  │  ├─ variables.css               # CSS 变量
│  │  └─ animations.css              # 动画定义
│  │
│  ├─ assets/                        # 静态资源
│  │  └─ icons/                      # 节点图标
│  │
│  ├─ types/                         # 类型定义
│  │  ├─ index.ts
│  │  ├─ node.ts                     # 节点类型
│  │  ├─ dsl.ts                      # DSL 类型
│  │  └─ registry.ts                 # 注册表类型
│  │
│  └─ utils/                         # 工具函数
│     ├─ index.ts
│     ├─ nodeFactory.ts              # 节点工厂
│     └─ validation.ts               # 校验函数
│
└─ rulego-shared/                    # 新旧编辑器共享代码
   ├─ useRuleGoRules.ts              # 规则 CRUD
   ├─ useRuleGoApi.ts                # API 调用
   ├─ types.ts                       # 通用类型
   └─ dslUtils.ts                    # DSL 工具函数
```

## 核心模块设计

### 1. 编辑器主组件

```typescript
// RuleGoFreeEditorPage.tsx

export default function RuleGoFreeEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rules, create, update } = useRuleGoRules();
  
  // 状态管理
  const [ruleName, setRuleName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [root, setRoot] = useState(true);
  const [currentDsl, setCurrentDsl] = useState('');
  const [savedDsl, setSavedDsl] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  
  // 编辑器上下文
  const editorContextRef = useRef<EditorContext | null>(null);
  
  // 初始数据
  const initialData = useMemo(() => {
    if (editingRule?.definition) {
      return convertDslToFlowgramData(JSON.parse(editingRule.definition));
    }
    return createEmptyFlowgramData();
  }, [editingRule]);
  
  // 编辑器配置
  const editorProps = useRuleGoEditorProps({
    initialData,
    nodeRegistries: rulegoNodeRegistries,
    onInit: (ctx) => {
      editorContextRef.current = ctx;
    },
    onContentChange: debounce((ctx) => {
      const dsl = buildRuleGoDsl(ctx, ruleName, { debugMode, root, enabled });
      setCurrentDsl(dsl);
      setUnsaved(dsl !== savedDsl);
    }, 1000),
  });
  
  // 保存处理
  const handleSave = async () => {
    if (!editorContextRef.current) return;
    
    const dsl = buildRuleGoDsl(
      editorContextRef.current,
      ruleName,
      { debugMode, root, enabled }
    );
    
    if (id) {
      await update(id, { name: ruleName, definition: dsl, description });
    } else {
      const created = await create({ name: ruleName, definition: dsl, description });
      navigate(`/rulego/editor/${created.id}`);
    }
    
    setSavedDsl(dsl);
    setUnsaved(false);
  };
  
  return (
    <div className="rulego-free-page">
      <RuleGoToolbar
        ruleName={ruleName}
        onRuleNameChange={setRuleName}
        unsaved={unsaved}
        onSave={handleSave}
        onImport={() => setImportModalOpen(true)}
        onExport={() => setExportModalOpen(true)}
        onAgentPlan={() => setAgentModalOpen(true)}
        onUndo={() => editorContextRef.current?.history.undo()}
        onRedo={() => editorContextRef.current?.history.redo()}
      />
      
      <FreeLayoutEditorProvider {...editorProps}>
        <div className="rulego-free-container">
          <DockedPanelLayer>
            <EditorRenderer className="rulego-free-editor" />
          </DockedPanelLayer>
        </div>
      </FreeLayoutEditorProvider>
      
      {/* 各种模态框 */}
      {importModalOpen && <ImportDslModal ... />}
      {exportModalOpen && <ExportDslModal ... />}
      {agentModalOpen && <AgentPlanModal ... />}
    </div>
  );
}
```

### 2. 节点注册表设计

#### 2.1 核心类型定义

```typescript
// types/registry.ts

export interface RuleGoNodeRegistry extends FlowNodeRegistry {
  // Flowgram 标准字段
  type: string;                      // 前端节点类型（如 'for-loop'）
  info: {
    icon: string;
    description: string;
  };
  meta: {
    isContainer?: boolean;           // 是否是容器节点
    size?: { width: number; height: number };
    padding?: (transform: any) => { top: number; bottom: number; left: number; right: number };
    defaultPorts?: PortConfig[];
    wrapperStyle?: React.CSSProperties;
  };
  onAdd?: () => NodeCreateData;
  formMeta: FormMeta;
  
  // RuleGo 扩展字段
  backendNodeType: string;           // 后端节点类型（如 'for'）
  category: RuleGoCategory;          // 分类（trigger/action/condition/data/flow）
  
  // DSL 转换钩子
  serializeConfiguration?: (node: FlowNodeEntity) => Record<string, unknown>;
  deserializeConfiguration?: (config: Record<string, unknown>) => Record<string, unknown>;
  
  // 连接规则
  getConnectionType?: (port: PortEntity, node: FlowNodeEntity) => string;
  canConnectTo?: (fromNode: FlowNodeEntity, toNode: FlowNodeEntity, connType: string) => boolean;
}
```

#### 2.2 节点类型映射表

```typescript
// dsl/nodeTypeMapping.ts

// 前端类型 ↔ 后端类型映射
export const NODE_TYPE_MAPPING = {
  // 触发器
  'start-trigger': 'startTrigger',
  'http-trigger': 'endpoint:http',
  'ws-trigger': 'endpoint:ws',
  'mqtt-trigger': 'endpoint:mqtt',
  'schedule-trigger': 'endpoint:schedule',
  'net-trigger': 'endpoint:net',
  
  // 动作
  'rest-api-call': 'restApiCall',
  'llm': 'ai/llm',
  'feishu-message': 'feishu/imMessage',
  'volc-tls-search': 'volcTls/searchLogs',
  'opensearch-search': 'opensearch/search',
  'delay': 'delay',
  'exec-command': 'exec',
  
  // 数据处理
  'for-loop': 'for',
  'join': 'join',
  'group-action': 'groupAction',
  'js-transform': 'jsTransform',
  'js-filter': 'jsFilter',
  
  // 条件判断
  'switch': 'switch',
  'js-switch': 'jsSwitch',
  
  // 流程控制
  'flow': 'flow',
  'ref': 'ref',
  'fork': 'fork',
  'break': 'break',
  
  // 数据库
  'db-client': 'dbClient',
  
  // 文件
  'file-read': 'x/fileRead',
  'file-write': 'x/fileWrite',
  'file-delete': 'x/fileDelete',
  'file-list': 'x/fileList',
  
  // 追踪
  'git-prepare': 'apiRouteTracer/gitPrepare',
  'cursor-acp': 'cursor/acp',
  'cursor-acp-agent': 'cursor/acp_agent',
  'cursor-acp-agent-step': 'cursor/acp_agent_step',
  'sourcegraph-query-build': 'sourcegraph/queryBuild',
  'sourcegraph-search': 'sourcegraph/search',
  
  // RPA
  'rpa-browser-navigate': 'x/rpaBrowserNavigate',
  'rpa-browser-click': 'x/rpaBrowserClick',
  'rpa-browser-screenshot': 'x/rpaBrowserScreenshot',
  'rpa-browser-query': 'x/rpaBrowserQuery',
  'rpa-ocr': 'x/rpaOcr',
  'rpa-screen-capture': 'x/rpaScreenCapture',
  'rpa-mac-window': 'x/rpaMacWindow',
  'rpa-desktop-click': 'x/rpaDesktopClick',
} as const;

export function getFrontendNodeType(backendType: string): string | undefined {
  const entry = Object.entries(NODE_TYPE_MAPPING).find(([_, backend]) => backend === backendType);
  return entry?.[0];
}

export function getBackendNodeType(frontendType: string): string | undefined {
  return NODE_TYPE_MAPPING[frontendType as keyof typeof NODE_TYPE_MAPPING];
}
```

### 3. DSL 适配层详细设计

#### 3.1 构建 DSL (Flowgram → RuleGo)

```typescript
// dsl/buildRuleGoDsl.ts

export interface BuildDslOptions {
  ruleId?: string;
  debugMode?: boolean;
  root?: boolean;
  enabled?: boolean;
}

export function buildRuleGoDsl(
  ctx: EditorContext,
  ruleName: string,
  options: BuildDslOptions = {}
): string {
  const nodes: RuleGoNode[] = [];
  const connections: RuleGoConnection[] = [];
  const endpoints: RuleGoEndpoint[] = [];
  
  // 1. 收集所有节点（包括容器内的子节点）
  const allNodes = collectAllNodes(ctx);
  
  allNodes.forEach(({ node, parentContainer }) => {
    const registry = getNodeRegistry(node.type) as RuleGoNodeRegistry;
    if (!registry) {
      console.warn(`Unknown node type: ${node.type}`);
      return;
    }
    
    const backendType = registry.backendNodeType;
    
    // 触发器类节点进 endpoints
    if (registry.category === 'trigger' && backendType.startsWith('endpoint:')) {
      endpoints.push(serializeEndpoint(node, registry));
      return;
    }
    
    // 普通节点进 nodes
    const configuration = registry.serializeConfiguration 
      ? registry.serializeConfiguration(node)
      : serializeDefaultConfiguration(node);
    
    nodes.push({
      id: node.id,
      type: backendType,
      name: node.data.title || node.type,
      debugMode: node.data.debugMode || false,
      configuration,
      additionalInfo: {
        flowgramNodeType: node.type,  // 保存前端类型，便于回载
        position: node.meta.position,
        parentContainer: parentContainer?.id,  // 容器节点 ID
      },
    });
  });
  
  // 2. 收集连线
  const allLines = ctx.lineManager.getAllLines();
  
  allLines.forEach(line => {
    const fromPort = ctx.portManager.getPortById(line.fromPortID);
    const toPort = ctx.portManager.getPortById(line.toPortID);
    
    if (!fromPort || !toPort) return;
    
    const fromNode = ctx.nodeManager.getNodeById(fromPort.nodeID);
    const toNode = ctx.nodeManager.getNodeById(toPort.nodeID);
    
    if (!fromNode || !toNode) return;
    
    const registry = getNodeRegistry(fromNode.type) as RuleGoNodeRegistry;
    const connectionType = registry.getConnectionType
      ? registry.getConnectionType(fromPort, fromNode)
      : getDefaultConnectionType(fromPort);
    
    connections.push({
      fromId: fromNode.id,
      toId: toNode.id,
      type: connectionType,  // Success/Failure/Do/Case0/etc
    });
  });
  
  // 3. 处理容器节点的特殊连线（Do 分支）
  const containerConnections = buildContainerConnections(ctx, allNodes);
  connections.push(...containerConnections);
  
  // 4. 构建最终 DSL
  const dsl = {
    ruleChain: {
      id: options.ruleId || 'rule01',
      name: ruleName,
      debugMode: options.debugMode || false,
      root: options.root !== false,
      disabled: !options.enabled,
      configuration: {},
      additionalInfo: {},
    },
    metadata: {
      firstNodeIndex: 0,
      nodes,
      connections,
      ruleChainConnections: [],
      ...(endpoints.length > 0 && { endpoints }),
    },
  };
  
  return JSON.stringify(dsl, null, 2);
}

// 收集所有节点（包括容器内的）
function collectAllNodes(ctx: EditorContext): Array<{
  node: FlowNodeEntity;
  parentContainer?: FlowNodeEntity;
}> {
  const result: Array<{ node: FlowNodeEntity; parentContainer?: FlowNodeEntity }> = [];
  
  ctx.nodeManager.getAllNodes().forEach(node => {
    result.push({ node });
    
    // 如果是容器节点，收集其子节点
    if (node.blocks?.length) {
      node.blocks.forEach(subNode => {
        result.push({
          node: subNode as unknown as FlowNodeEntity,
          parentContainer: node,
        });
      });
    }
  });
  
  return result;
}

// 构建容器节点的 Do 分支连线
function buildContainerConnections(
  ctx: EditorContext,
  allNodes: Array<{ node: FlowNodeEntity; parentContainer?: FlowNodeEntity }>
): RuleGoConnection[] {
  const connections: RuleGoConnection[] = [];
  
  // For 循环：找到 BlockStart 并连接到第一个子节点
  allNodes.forEach(({ node, parentContainer }) => {
    if (!parentContainer || parentContainer.type !== 'for-loop') return;
    
    // BlockStart → 第一个子节点
    if (node.type === 'block-start') {
      const firstSubNode = findFirstSubNode(parentContainer);
      if (firstSubNode) {
        connections.push({
          fromId: parentContainer.id,
          toId: firstSubNode.id,
          type: 'Do',  // For 循环的 Do 分支
        });
      }
    }
  });
  
  return connections;
}
```

#### 3.2 加载 DSL (RuleGo → Flowgram)

```typescript
// dsl/loadRuleGoDsl.ts

export function loadRuleGoDsl(
  dslJson: RuleGoDsl,
  ctx: EditorContext
): void {
  const nodes = dslJson.metadata?.nodes || [];
  const connections = dslJson.metadata?.connections || [];
  const endpoints = dslJson.metadata?.endpoints || [];
  
  // 清空画布
  ctx.nodeManager.clear();
  
  const nodeIdMap = new Map<string, FlowNodeEntity>();
  
  // 1. 先创建所有普通节点和容器节点
  nodes.forEach(nodeData => {
    const backendType = nodeData.type;
    const registry = getNodeRegistryByBackendType(backendType);
    
    if (!registry) {
      console.warn(`Unsupported backend node type: ${backendType}`);
      return;
    }
    
    // 反序列化配置
    const config = registry.deserializeConfiguration
      ? registry.deserializeConfiguration(nodeData.configuration || {})
      : nodeData.configuration || {};
    
    // 创建节点
    const nodeConfig: NodeCreateData = {
      id: nodeData.id,
      type: registry.type,
      data: {
        title: nodeData.name,
        debugMode: nodeData.debugMode,
        ...config,
      },
      meta: {
        position: nodeData.additionalInfo?.position || { x: 100, y: 100 },
      },
    };
    
    // 容器节点需要特殊处理
    if (registry.meta.isContainer) {
      nodeConfig.blocks = createContainerBlocks(nodeData, registry);
    }
    
    const node = ctx.nodeManager.addNode(nodeConfig);
    nodeIdMap.set(nodeData.id, node);
  });
  
  // 2. 处理 endpoints（触发器）
  endpoints.forEach(epData => {
    const registry = getNodeRegistryByEndpointType(epData.type);
    if (!registry) return;
    
    const node = ctx.nodeManager.addNode({
      id: epData.id || `ep_${nanoid(5)}`,
      type: registry.type,
      data: deserializeEndpointData(epData, registry),
      meta: {
        position: epData.additionalInfo?.position || { x: 50, y: 50 },
      },
    });
    
    nodeIdMap.set(epData.id, node);
  });
  
  // 3. 建立连线
  connections.forEach(conn => {
    const fromNode = nodeIdMap.get(conn.fromId);
    const toNode = nodeIdMap.get(conn.toId);
    
    if (!fromNode || !toNode) {
      console.warn(`Connection references missing nodes: ${conn.fromId} → ${conn.toId}`);
      return;
    }
    
    // 找到对应的端口
    const fromPort = findOutputPortForConnection(fromNode, conn.type, toNode);
    const toPort = findInputPort(toNode);
    
    if (fromPort && toPort) {
      ctx.lineManager.addLine({
        fromPortID: fromPort.id,
        toPortID: toPort.id,
      });
    }
  });
  
  // 4. 处理容器节点的内部连线（Do 分支）
  connections
    .filter(conn => conn.type === 'Do')
    .forEach(conn => {
      const containerNode = nodeIdMap.get(conn.fromId);
      const firstSubNode = nodeIdMap.get(conn.toId);
      
      if (!containerNode || !firstSubNode) return;
      
      // 将 firstSubNode 放入容器的 blocks 数组
      if (containerNode.blocks) {
        const blockStart = containerNode.blocks.find(b => b.type === 'block-start');
        if (blockStart) {
          // 在容器内建立 BlockStart → firstSubNode 的连接
          createInternalConnection(ctx, blockStart, firstSubNode);
        }
      }
    });
}

// 为容器节点创建内部的 BlockStart/BlockEnd
function createContainerBlocks(
  nodeData: RuleGoNode,
  registry: RuleGoNodeRegistry
): FlowNodeEntity[] {
  return [
    {
      id: `block_start_${nanoid(5)}`,
      type: 'block-start',
      meta: { position: { x: 32, y: 0 } },
      data: {},
    },
    {
      id: `block_end_${nanoid(5)}`,
      type: 'block-end',
      meta: { position: { x: 192, y: 0 } },
      data: {},
    },
  ] as FlowNodeEntity[];
}

// 根据连接类型找到对应的输出端口
function findOutputPortForConnection(
  node: FlowNodeEntity,
  connectionType: string,
  _toNode: FlowNodeEntity
): PortEntity | undefined {
  const ports = node.getAllPorts?.() || [];
  
  // 根据连接类型匹配端口
  const portMapping: Record<string, string> = {
    'Success': 'output',      // 默认输出
    'Failure': 'failure',     // 失败分支
    'Do': 'do',               // 循环体
    'True': 'true',           // 真分支
    'False': 'false',         // 假分支
    // Switch 的 Case
    'Case0': 'case_0',
    'Case1': 'case_1',
    // ...
  };
  
  const portId = portMapping[connectionType] || 'output';
  return ports.find(p => p.portID === portId);
}
```

### 4. Loop 容器节点详细设计

这是你最关心的部分，我会特别详细地设计：

```typescript
// nodes/for-loop/index.ts

import { nanoid } from 'nanoid';
import type { RuleGoNodeRegistry } from '../../types';
import { formMeta } from './form-meta';
import { LoopNodeRender } from './LoopNodeRender';
import iconLoop from '../../assets/icons/loop.svg';

let loopIndex = 0;

export const ForLoopNodeRegistry: RuleGoNodeRegistry = {
  // Flowgram 标准配置
  type: 'for-loop',
  backendNodeType: 'for',
  category: 'data',
  
  info: {
    icon: iconLoop,
    description: '循环遍历，支持范围表达式、数组、对象迭代',
  },
  
  meta: {
    // ★ 容器节点关键配置
    isContainer: true,
    
    // 容器尺寸
    size: {
      width: 424,
      height: 244,
    },
    
    // 容器内边距（给子画布留空间）
    padding: (transform) => {
      if (!transform.isContainer) {
        return { top: 0, bottom: 0, left: 0, right: 0 };
      }
      return {
        top: 120,    // 顶部留给头部信息
        bottom: 80,  // 底部留给状态栏
        left: 80,    // 左右留给 BlockStart/End
        right: 80,
      };
    },
    
    // 端口配置
    defaultPorts: [
      { type: 'input', location: 'left' },           // 前驱连接
      { type: 'output', location: 'right' },         // Success 出口
      { type: 'output', location: 'bottom', portID: 'failure' }, // Failure 出口
    ],
    
    // 容器选择逻辑（鼠标在容器外壳才可选中，避免干扰内部节点）
    selectable(node: FlowNodeEntity, mousePos?: PositionSchema): boolean {
      if (!mousePos) return true;
      const transform = node.getData(FlowNodeTransformData);
      return !transform.bounds.contains(mousePos.x, mousePos.y);
    },
    
    wrapperStyle: {
      minWidth: 'unset',
      width: '100%',
    },
  },
  
  // 创建节点时的初始化
  onAdd() {
    return {
      id: `for_${nanoid(5)}`,
      type: 'for-loop',
      data: {
        title: `For_${++loopIndex}`,
        range: '1..3',          // 默认范围
        mode: 0,                // 执行模式：0=忽略
      },
      blocks: [
        // 子画布的起点标记
        {
          id: `block_start_${nanoid(5)}`,
          type: 'block-start',
          meta: { position: { x: 32, y: 0 } },
          data: {},
        },
        // 子画布的终点标记
        {
          id: `block_end_${nanoid(5)}`,
          type: 'block-end',
          meta: { position: { x: 192, y: 0 } },
          data: {},
        },
      ],
    };
  },
  
  formMeta,
  
  // DSL 序列化：node.data → configuration
  serializeConfiguration(node) {
    // 找到 Do 分支连接的第一个子节点
    const doPort = node.getAllPorts?.().find(p => p.portID === 'do');
    const doLine = doPort 
      ? ctx.lineManager.getLinesFromPort(doPort.id)[0]
      : null;
    const doNodeId = doLine
      ? ctx.portManager.getPortById(doLine.toPortID)?.nodeID
      : undefined;
    
    return {
      range: node.data.range || '1..3',
      do: doNodeId || 's3',  // 后端要求的 do 节点 ID
      mode: node.data.mode || 0,
    };
  },
  
  // DSL 反序列化：configuration → node.data
  deserializeConfiguration(config) {
    return {
      range: config.range || '1..3',
      mode: config.mode || 0,
      // do 字段由 loadRuleGoDsl 在连线阶段处理
    };
  },
  
  // 连接类型映射
  getConnectionType(port, node) {
    if (port.portID === 'failure') return 'Failure';
    if (port.portID === 'do') return 'Do';
    return 'Success';
  },
};
```

#### Loop 节点的表单配置

```typescript
// nodes/for-loop/form-meta.tsx

import { FormMeta, FormRenderProps, Field } from '@flowgram.ai/free-layout-editor';
import { SubCanvasRender } from '@flowgram.ai/free-container-plugin';
import { FormHeader, FormContent, FormItem, Feedback } from '../../form-components';
import { useIsSidebar, useNodeRenderContext } from '../../hooks';

export const ForLoopFormRender = ({ form }: FormRenderProps) => {
  const isSidebar = useIsSidebar();
  const { readonly } = useNodeRenderContext();
  
  return (
    <>
      <FormHeader title="循环配置" icon="🔁" />
      
      <FormContent>
        {/* 范围表达式 */}
        <FormItem label="范围表达式" required>
          <Field name="range">
            {({ field, fieldState }) => (
              <>
                <input
                  type="text"
                  value={field.value || '1..3'}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder="例如：1..10 或 ${items}"
                  disabled={readonly}
                  className={fieldState.error ? 'error' : ''}
                />
                <Feedback error={fieldState.error} />
                <small className="form-hint">
                  支持范围（1..10）、变量（$&#123;items&#125;）、数组表达式
                </small>
              </>
            )}
          </Field>
        </FormItem>
        
        {/* 执行模式 */}
        <FormItem label="执行模式">
          <Field name="mode">
            {({ field }) => (
              <>
                <select
                  value={field.value || 0}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  disabled={readonly}
                >
                  <option value={0}>忽略子节点输出</option>
                  <option value={1}>追加到数组</option>
                  <option value={2}>覆盖输出</option>
                  <option value={3}>异步并行</option>
                </select>
                <small className="form-hint">
                  控制循环内节点输出的聚合方式
                </small>
              </>
            )}
          </Field>
        </FormItem>
        
        {/* 子画布渲染区域 */}
        {!isSidebar && (
          <FormItem label="循环体">
            <SubCanvasRender />
            <small className="form-hint">
              在上方容器内拖入节点构建循环体逻辑
            </small>
          </FormItem>
        )}
      </FormContent>
    </>
  );
};

export const formMeta: FormMeta = {
  render: ForLoopFormRender,
  
  // 表单验证
  validate: (data) => {
    const errors: Record<string, string> = {};
    
    if (!data.range?.trim()) {
      errors.range = '范围表达式不能为空';
    }
    
    // 验证范围表达式语法
    const range = String(data.range || '').trim();
    if (range && !isValidRangeExpression(range)) {
      errors.range = '范围表达式格式无效';
    }
    
    return errors;
  },
};

// 范围表达式验证
function isValidRangeExpression(expr: string): boolean {
  // 1..10 格式
  if (/^\d+\.\.\d+$/.test(expr)) return true;
  // ${variable} 格式
  if (/^\$\{[^}]+\}$/.test(expr)) return true;
  // 数组/对象表达式
  if (expr.startsWith('[') || expr.startsWith('{')) return true;
  return false;
}
```

#### Loop 节点的渲染组件

```typescript
// nodes/for-loop/LoopNodeRender.tsx

import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import { SubCanvasRender } from '@flowgram.ai/free-container-plugin';
import { LoopContainerStyle, LoopHeader, LoopBody } from './styles';

export const LoopNodeRender = () => {
  const { node, selected } = useNodeRender();
  const form = useNodeRender().form;
  
  return (
    <LoopContainerStyle 
      className={`
        ${selected ? 'selected' : ''}
        ${form?.state.invalid ? 'error' : ''}
      `}
    >
      {/* 头部 */}
      <LoopHeader>
        <div className="loop-icon">🔁</div>
        <div className="loop-info">
          <div className="loop-title">{node.data.title}</div>
          <div className="loop-config">
            范围: <code>{node.data.range}</code>
            {node.data.mode !== 0 && (
              <span className="loop-mode-badge">
                {['', '追加', '覆盖', '异步'][node.data.mode]}
              </span>
            )}
          </div>
        </div>
      </LoopHeader>
      
      {/* 子画布容器 */}
      <LoopBody>
        <SubCanvasRender />
      </LoopBody>
      
      {/* 验证错误指示 */}
      {form?.state.invalid && (
        <div className="loop-error-indicator" title="配置有误">
          ⚠️
        </div>
      )}
    </LoopContainerStyle>
  );
};
```

#### Loop 节点的样式定义（★ Flowgram 风格）

```typescript
// nodes/for-loop/styles.tsx

import styled from 'styled-components';

// 容器主体样式
export const LoopContainerStyle = styled.div`
  /* 基础外观（完全采用 Flowgram 风格） */
  background-color: #ffffff;
  border: 1px solid rgba(6, 7, 9, 0.15);
  border-radius: 8px;
  box-shadow: 
    0 2px 6px 0 rgba(0, 0, 0, 0.04),
    0 4px 12px 0 rgba(0, 0, 0, 0.02);
  
  /* 布局 */
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 424px;
  min-height: 244px;
  
  /* 选中态（蓝色边框 + 光晕） */
  &.selected {
    border: 1px solid #4e40e5;
    box-shadow: 
      0 0 0 3px rgba(78, 64, 229, 0.1),
      0 2px 6px 0 rgba(0, 0, 0, 0.04),
      0 4px 12px 0 rgba(0, 0, 0, 0.02);
  }
  
  /* 错误态（红色边框） */
  &.error {
    border-color: #ff0000;
    box-shadow: 
      0 0 0 3px rgba(255, 0, 0, 0.1),
      0 2px 6px 0 rgba(0, 0, 0, 0.04);
  }
  
  /* 悬停态 */
  &:hover:not(.selected) {
    border-color: rgba(6, 7, 9, 0.25);
  }
`;

// 头部区域
export const LoopHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(6, 7, 9, 0.08);
  background: linear-gradient(to bottom, #fafafa, #ffffff);
  border-radius: 8px 8px 0 0;
  
  .loop-icon {
    font-size: 24px;
    line-height: 1;
  }
  
  .loop-info {
    flex: 1;
  }
  
  .loop-title {
    font-size: 14px;
    font-weight: 600;
    color: #18181b;
    margin-bottom: 4px;
  }
  
  .loop-config {
    font-size: 12px;
    color: #71717a;
    display: flex;
    align-items: center;
    gap: 8px;
    
    code {
      background: rgba(245, 158, 11, 0.1);
      color: #d97706;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 11px;
    }
  }
  
  .loop-mode-badge {
    background: #fef3c7;
    color: #92400e;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
  }
`;

// 子画布区域
export const LoopBody = styled.div`
  flex: 1;
  position: relative;
  min-height: 180px;
  padding: 16px;
  
  /* 子画布背景 */
  background: 
    linear-gradient(to bottom, #fef3c7 0%, #fde68a 10%, transparent 20%),
    #fafafa;
  
  /* 子画布内部提示 */
  &::before {
    content: 'Do 循环体';
    position: absolute;
    top: 8px;
    left: 16px;
    font-size: 11px;
    color: #a16207;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  /* SubCanvasRender 容器 */
  > div {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.5);
  }
`;
```

### 5. 插件系统配置

```typescript
// hooks/useRuleGoEditorProps.ts

import { useMemo } from 'react';
import { FreeLayoutProps } from '@flowgram.ai/free-layout-editor';
import {
  createFreeLinesPlugin,
  createMinimapPlugin,
  createFreeSnapPlugin,
  createFreeNodePanelPlugin,
  createContainerNodePlugin,
  createFreeGroupPlugin,
  createContextMenuPlugin,
  createPanelManagerPlugin,
} from '@flowgram.ai/plugins';
import { RuleGoNodePanel } from '../components/node-panel';

export function useRuleGoEditorProps(options: {
  initialData: FlowDocumentJSON;
  nodeRegistries: RuleGoNodeRegistry[];
  onInit?: (ctx: EditorContext) => void;
  onContentChange?: (ctx: EditorContext, event: any) => void;
}): FreeLayoutProps {
  const { initialData, nodeRegistries, onInit, onContentChange } = options;
  
  return useMemo<FreeLayoutProps>(() => ({
    // 基础配置
    background: true,               // 显示网格背景
    readonly: false,
    initialData,
    nodeRegistries,
    
    // 画布配置
    playground: {
      preventGlobalGesture: true,   // 阻止 Mac 浏览器后退手势
    },
    
    // 引擎配置
    nodeEngine: { enable: true },
    variableEngine: { enable: true },
    history: {
      enable: true,
      enableChangeNode: true,
    },
    
    // 网格配置（与 Blockly 保持一致的网格间距）
    grid: {
      spacing: 24,
      snap: true,
      color: 'rgba(148, 163, 184, 0.28)',
    },
    
    // 缩放配置
    zoom: {
      min: 0.4,
      max: 2.0,
      step: 0.1,
      default: 0.9,
    },
    
    // 连接规则
    canAddLine: (ctx, fromPort, toPort) => {
      // 不能连接到自己
      if (fromPort.nodeID === toPort.nodeID) return false;
      
      // 输入端口只能有一条入线
      if (toPort.type === 'input') {
        const existingLines = ctx.lineManager.getLinesToPort(toPort.id);
        if (existingLines.length > 0) return false;
      }
      
      // 检查是否会形成环路
      if (wouldCreateCycle(ctx, fromPort.nodeID, toPort.nodeID)) {
        return false;
      }
      
      return true;
    },
    
    canDeleteLine: (ctx, line) => {
      // 所有连线都可删除
      return true;
    },
    
    canDeleteNode: (ctx, node) => {
      const registry = getNodeRegistry(node.type) as RuleGoNodeRegistry;
      
      // 触发器节点可以删除（与 Blockly 不同，Flowgram 允许无触发器）
      // BlockStart/BlockEnd 不可删除（容器内部节点）
      if (node.type === 'block-start' || node.type === 'block-end') {
        return false;
      }
      
      return true;
    },
    
    // 节点拖放规则
    canDropToNode: (ctx, params) => {
      const { dragNode, targetNode } = params;
      
      // 只有容器节点可以接收拖入
      const targetRegistry = getNodeRegistry(targetNode.type);
      if (!targetRegistry?.meta.isContainer) return false;
      
      // BlockStart/BlockEnd 不能拖出容器
      if (dragNode.type === 'block-start' || dragNode.type === 'block-end') {
        return false;
      }
      
      return true;
    },
    
    // 插件系统
    plugins: () => [
      // 连线插件（带连线上的添加按钮）
      createFreeLinesPlugin({
        renderInsideLine: LineAddButton,
        lineStyle: {
          stroke: 'var(--rulego-line-default)',
          strokeWidth: 2,
        },
      }),
      
      // 小地图插件
      createMinimapPlugin({
        position: 'bottom-right',
        width: 200,
        height: 150,
      }),
      
      // 对齐辅助线插件
      createFreeSnapPlugin({
        snapDistance: 10,
        guideLineColor: '#3b82f6',
      }),
      
      // 节点面板插件
      createFreeNodePanelPlugin({
        renderer: RuleGoNodePanel,
        position: 'left',
        width: 280,
      }),
      
      // 容器节点插件 ★
      createContainerNodePlugin({
        containerTypes: ['for-loop', 'group-action'],  // 支持的容器类型
        allowNested: false,                            // 不允许嵌套容器
      }),
      
      // 节点分组插件
      createFreeGroupPlugin({
        groupNodeRender: GroupNodeRender,
        allowGroupInContainer: true,
      }),
      
      // 右键菜单插件
      createContextMenuPlugin({
        menuItems: [
          { id: 'copy', label: '复制', shortcut: 'Cmd+C' },
          { id: 'paste', label: '粘贴', shortcut: 'Cmd+V' },
          { id: 'delete', label: '删除', shortcut: 'Delete' },
          { id: 'duplicate', label: '复制节点', shortcut: 'Cmd+D' },
          'separator',
          { id: 'bring-front', label: '置于顶层' },
          { id: 'send-back', label: '置于底层' },
        ],
      }),
      
      // 侧边栏面板管理插件
      createPanelManagerPlugin({
        panels: [
          {
            id: 'node-config',
            title: '节点配置',
            position: 'right',
            defaultWidth: 360,
            render: NodeConfigPanel,
          },
        ],
      }),
    ],
    
    // 生命周期钩子
    onInit: (ctx) => {
      console.log('[RuleGo] Editor initialized');
      onInit?.(ctx);
    },
    
    onContentChange: (ctx, event) => {
      onContentChange?.(ctx, event);
    },
    
    onAllLayersRendered: (ctx) => {
      console.log('[RuleGo] All layers rendered');
    },
  }), [initialData, nodeRegistries, onInit, onContentChange]);
}
```

## 数据流设计

### 保存流程

```
用户点击「保存」
     ↓
获取 EditorContext
     ↓
buildRuleGoDsl(ctx, ruleName, options)
     ├─ 遍历所有节点 (NodeManager.getAllNodes)
     ├─ 收集节点配置 (registry.serializeConfiguration)
     ├─ 遍历所有连线 (LineManager.getAllLines)
     ├─ 映射连接类型 (registry.getConnectionType)
     ├─ 处理容器节点 (container-specific logic)
     └─ 生成 RuleGo DSL JSON
     ↓
调用后端 API: POST /api/rulego/rules
     ↓
更新本地状态 (savedDsl, unsaved=false)
```

### 加载流程

```
打开编辑器页面
     ↓
从后端加载规则: GET /api/rulego/rules/:id
     ↓
解析 DSL JSON
     ↓
loadRuleGoDsl(dslJson, ctx)
     ├─ 遍历 metadata.nodes
     ├─ 查找 NodeRegistry (by backendNodeType)
     ├─ 反序列化配置 (registry.deserializeConfiguration)
     ├─ 创建节点 (NodeManager.addNode)
     ├─ 处理容器节点的 blocks
     ├─ 遍历 metadata.connections
     ├─ 查找端口 (findOutputPortForConnection)
     └─ 建立连线 (LineManager.addLine)
     ↓
画布渲染完成
```

### Agent 规划流程

```
用户输入需求描述
     ↓
调用后端: POST /api/rulego/plan
     ├─ 传入当前 DSL (buildRuleGoDsl)
     ├─ 传入支持的节点类型列表
     └─ 传入可用子规则链
     ↓
后端返回 plan (nodes + edges)
     ↓
构建预览列表 (buildAgentPreviewItems)
     ↓
用户勾选要应用的节点/连线
     ↓
applyAgentPlanToEditor(plan, selectedIds, ctx)
     ├─ 根据 plan.nodes 创建节点
     ├─ 根据 plan.edges 建立连线
     └─ 自动布局
     ↓
画布更新，生成新 DSL
```

## 节点分类设计

### 节点类型分层

```
RuleGo 节点（33个）
│
├─ 触发器类 (6个)
│  ├─ 手动触发 (startTrigger)
│  └─ Endpoint 触发器 (http/ws/mqtt/schedule/net)
│
├─ 动作类 (9个)
│  ├─ 外部调用 (restApiCall, feishuImMessage)
│  ├─ 日志查询 (volcTls, opensearch)
│  ├─ AI (llm)
│  └─ 系统 (delay, exec, jsTransform, jsFilter)
│
├─ 条件判断类 (2个)
│  ├─ 静态分支 (switch)
│  └─ 脚本分支 (jsSwitch)
│
├─ 数据处理类 (3个)
│  ├─ 循环 (for) ★
│  ├─ 汇聚 (join)
│  └─ 节点组 (groupAction)
│
├─ 流程控制类 (4个)
│  ├─ 子规则链 (flow)
│  ├─ 节点引用 (ref)
│  ├─ 并行网关 (fork)
│  └─ 终止循环 (break)
│
├─ 数据库类 (1个)
│  └─ 数据库客户端 (dbClient)
│
├─ 文件类 (4个)
│  └─ 文件操作 (read/write/delete/list)
│
├─ 追踪类 (6个)
│  ├─ API 追踪 (gitPrepare, sourcegraph)
│  └─ Cursor ACP (acp/acp_agent/acp_agent_step)
│
└─ RPA 类 (8个)
   ├─ 浏览器 (navigate/click/screenshot/query)
   └─ 桌面 (ocr/screen-capture/mac-window/desktop-click)
```

### 容器节点识别

容器节点（需要 `isContainer: true`）：
- **for** - 循环容器
- **groupAction** - 节点组容器（可能需要特殊设计）

非容器但有多分支的节点：
- **switch** - 用多个输出端口
- **fork** - 用多个输出端口
- **jsSwitch** - 用多个输出端口

## 样式设计规范

### 颜色系统

```typescript
// styles/variables.css

:root {
  /* 节点分类颜色（与 Blockly 主题保持一致） */
  --rulego-trigger: #ef4444;
  --rulego-action: #3b82f6;
  --rulego-condition: #14b8a6;
  --rulego-data: #f59e0b;
  --rulego-flow: #8b5cf6;
  --rulego-db: #0d9488;
  --rulego-file: #b45309;
  --rulego-tracer: #0891b2;
  --rulego-rpa: #6366f1;
  
  /* 节点基础样式（Flowgram 风格） */
  --node-bg: #ffffff;
  --node-border: rgba(6, 7, 9, 0.15);
  --node-border-radius: 8px;
  --node-shadow: 
    0 2px 6px 0 rgba(0, 0, 0, 0.04),
    0 4px 12px 0 rgba(0, 0, 0, 0.02);
  
  /* 节点选中态 */
  --node-selected-border: #4e40e5;
  --node-selected-shadow: 0 0 0 3px rgba(78, 64, 229, 0.1);
  
  /* 端口颜色 */
  --port-primary: #4d53e8;
  --port-secondary: #9197f1;
  --port-error: #ff0000;
  --port-bg: #ffffff;
  
  /* 连线颜色 */
  --line-default: #4d53e8;
  --line-drawing: #5dd6e3;
  --line-hover: #37d0ff;
  --line-selected: #37d0ff;
  --line-error: red;
  
  /* 容器节点特殊色 */
  --container-loop-accent: #f59e0b;
  --container-loop-bg-gradient: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
}
```

### 节点样式规范

**所有节点的共同样式**（通过 BaseNode）：
- 白色背景 (#ffffff)
- 浅灰边框 (rgba(6, 7, 9, 0.15))
- 8px 圆角
- 双层投影
- 宽度 360px（容器节点 424px）

**分类标识**：
- 节点头部带图标和颜色标识
- 图标旁边显示节点名称
- 底部显示节点类型小标签

**状态样式**：
- **正常**：上述基础样式
- **选中**：蓝色边框 + 蓝色光晕
- **悬停**：边框颜色加深
- **错误**：红色边框 + 红色光晕
- **运行中**：虚线边框 + 脉冲动画

## 关键技术决策

### 决策 1: 保留 additionalInfo 字段存储额外信息

**问题**：Flowgram 的节点数据结构与 RuleGo DSL 不完全匹配

**方案**：利用 RuleGo DSL 的 `additionalInfo` 字段存储 Flowgram 特有信息

```json
{
  "id": "for1",
  "type": "for",
  "configuration": { "range": "1..10", "do": "s3", "mode": 0 },
  "additionalInfo": {
    "flowgramNodeType": "for-loop",
    "position": { "x": 200, "y": 150 },
    "blockId": "abc123"  // 原 Blockly block ID（兼容性）
  }
}
```

### 决策 2: 端口与连接类型的映射

**问题**：Flowgram 用端口 ID，RuleGo DSL 用连接类型字符串

**方案**：建立映射表并在 NodeRegistry 中定义转换规则

```typescript
// 端口 ID → 连接类型
const PORT_TO_CONNECTION_TYPE = {
  'output': 'Success',
  'failure': 'Failure',
  'do': 'Do',
  'true': 'True',
  'false': 'False',
  'case_0': 'Case0',
  'case_1': 'Case1',
  // ...
};

// 连接类型 → 端口 ID
const CONNECTION_TYPE_TO_PORT = Object.fromEntries(
  Object.entries(PORT_TO_CONNECTION_TYPE).map(([k, v]) => [v, k])
);
```

### 决策 3: 容器节点的子节点表示

**问题**：Flowgram 容器的 `blocks` 数组 vs RuleGo DSL 的 `connections[type=Do]`

**方案**：
1. Flowgram 内部：子节点存在 `node.blocks` 数组
2. 序列化时：找到 Do 分支的第一个子节点，生成 `{fromId: loop, toId: firstSub, type: 'Do'}` 连接
3. 反序列化时：将 Do 连接的目标节点放入容器的 blocks

```typescript
// For 循环的子节点处理

// 保存时：
const doConnections = connections.filter(c => 
  c.type === 'Do' && c.fromId === loopNode.id
);
// doConnections[0].toId 就是第一个子节点

// 加载时：
if (conn.type === 'Do') {
  const container = nodeMap.get(conn.fromId);
  const firstSub = nodeMap.get(conn.toId);
  if (container && firstSub && container.blocks) {
    // 将 firstSub 放入容器内部
    container.blocks.push(firstSub);
  }
}
```

### 决策 4: 旧编辑器的过渡策略

**方案**：Feature Flag + 双路由

```typescript
// App.tsx 路由配置

const USE_FREE_LAYOUT = import.meta.env.VITE_RULEGO_USE_FREE_LAYOUT === 'true';

<Route path="/rulego/editor/:id?" element={
  USE_FREE_LAYOUT 
    ? <RuleGoFreeEditorPage />   // 新编辑器
    : <RuleGoScratchEditorPage /> // 旧编辑器
} />

// 或者提供切换按钮让用户选择
<Route path="/rulego/editor-v2/:id?" element={<RuleGoFreeEditorPage />} />
<Route path="/rulego/editor/:id?" element={<RuleGoScratchEditorPage />} />
```

## 性能优化策略

### 1. 节点渲染优化

- 使用 Flowgram 内置的虚拟化渲染
- 懒加载节点表单（只在打开配置面板时渲染）
- React.memo 包裹节点组件

### 2. DSL 构建节流

- 使用 debounce 延迟 DSL 构建（1000ms）
- 只在需要时构建（保存、导出、Agent 规划）
- 缓存上一次构建结果，avoid 重复计算

### 3. 大规则链优化

- 超过 100 个节点时自动折叠容器节点
- 提供「性能模式」关闭实时预览
- 小地图使用简化渲染

## 测试策略

### 单元测试

```typescript
// __tests__/dsl-adapter.test.ts

describe('DSL Adapter', () => {
  describe('buildRuleGoDsl', () => {
    it('should convert simple linear flow', () => {
      const ctx = createTestEditor();
      addNode(ctx, { type: 'start-trigger', ... });
      addNode(ctx, { type: 'rest-api-call', ... });
      connectNodes(ctx, 'start', 'api');
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      expect(parsed.metadata.nodes).toHaveLength(2);
      expect(parsed.metadata.connections).toHaveLength(1);
    });
    
    it('should handle for-loop container', () => {
      const ctx = createTestEditor();
      const loop = addNode(ctx, { type: 'for-loop', data: { range: '1..5' } });
      const subNode = addNode(ctx, { type: 'llm' });
      addNodeToContainer(ctx, subNode, loop);
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      const loopConn = parsed.metadata.connections.find(c => c.type === 'Do');
      expect(loopConn).toBeDefined();
      expect(loopConn.fromId).toBe(loop.id);
    });
  });
  
  describe('loadRuleGoDsl', () => {
    it('should load and restore nodes', () => {
      const dsl = {
        ruleChain: { id: 'test', name: 'Test' },
        metadata: {
          nodes: [
            { id: 'n1', type: 'startTrigger', name: 'Start' },
            { id: 'n2', type: 'for', name: 'Loop', configuration: { range: '1..3' } },
          ],
          connections: [
            { fromId: 'n1', toId: 'n2', type: 'Success' },
          ],
        },
      };
      
      const ctx = createTestEditor();
      loadRuleGoDsl(dsl, ctx);
      
      expect(ctx.nodeManager.getAllNodes()).toHaveLength(2);
      expect(ctx.lineManager.getAllLines()).toHaveLength(1);
    });
  });
  
  describe('Round-trip conversion', () => {
    it('should maintain DSL integrity', () => {
      const originalDsl = loadSampleDsl('complex-workflow.json');
      
      const ctx = createTestEditor();
      loadRuleGoDsl(originalDsl, ctx);
      const rebuiltDsl = buildRuleGoDsl(ctx, originalDsl.ruleChain.name);
      
      const original = JSON.parse(JSON.stringify(originalDsl));
      const rebuilt = JSON.parse(rebuiltDsl);
      
      // 忽略 additionalInfo 的差异
      expect(normalizeForComparison(rebuilt)).toEqual(normalizeForComparison(original));
    });
  });
});
```

### 集成测试

```typescript
// __tests__/editor-integration.test.ts

describe('Editor Integration', () => {
  it('should save and load rule correctly', async () => {
    const { ctx, save, load } = setupTestEditor();
    
    // 创建规则
    addNode(ctx, { type: 'http-trigger', data: { path: '/test' } });
    addNode(ctx, { type: 'llm', data: { model: 'gpt-4' } });
    
    // 保存
    const ruleId = await save('test-rule');
    
    // 清空
    ctx.nodeManager.clear();
    
    // 加载
    await load(ruleId);
    
    // 验证
    expect(ctx.nodeManager.getAllNodes()).toHaveLength(2);
  });
});
```

### 回归测试

```typescript
// __tests__/production-compatibility.test.ts

describe('Production Rules Compatibility', () => {
  it('should load all production rules without error', async () => {
    const rules = await fetchAllProductionRules();
    const results = [];
    
    for (const rule of rules) {
      try {
        const ctx = createTestEditor();
        const dsl = JSON.parse(rule.definition);
        loadRuleGoDsl(dsl, ctx);
        
        results.push({ id: rule.id, success: true });
      } catch (err) {
        results.push({
          id: rule.id,
          success: false,
          error: err.message,
        });
      }
    }
    
    const failures = results.filter(r => !r.success);
    expect(failures).toHaveLength(0);
  });
});
```

## 部署策略

### 阶段 1: 并行开发（Week 1-7）

- 新编辑器在 `rulego-free/` 目录开发
- 旧编辑器保持不变，继续支持业务需求
- Feature Flag 控制：`VITE_RULEGO_USE_FREE_LAYOUT=false`

### 阶段 2: 内部测试（Week 8）

- Feature Flag 打开：`VITE_RULEGO_USE_FREE_LAYOUT=true`
- 内部团队切换到新编辑器
- 回归测试所有生产规则链
- 收集反馈，修复 bug

### 阶段 3: 灰度发布（Week 9-10）

- 10% 用户切换到新编辑器
- 监控错误率和性能指标
- 逐步扩大到 50% → 100%

### 阶段 4: 完全切换（Week 11）

- 所有用户使用新编辑器
- 旧编辑器代码标记为 deprecated
- 保留 2 周观察期

### 阶段 5: 清理（Week 13）

- 删除旧编辑器代码
- 移除 scratch-blocks 依赖
- 清理相关配置和样式

## 回滚预案

**触发条件**：
- 新编辑器错误率 > 5%
- 性能严重下降（加载时间 > 5s）
- 发现严重的 DSL 转换 bug

**回滚步骤**：
1. 立即切换 Feature Flag: `VITE_RULEGO_USE_FREE_LAYOUT=false`
2. 发布热修复版本
3. 通知用户刷新页面
4. 分析问题根因
5. 修复后重新灰度

## 未来扩展

### 短期（3-6个月）

- 节点模板市场（预设常用节点组合）
- 规则链版本管理（Git-like diff/merge）
- 协作编辑（多人同时编辑同一规则链）

### 中期（6-12个月）

- AI 辅助优化规则链（性能、可读性建议）
- 可视化调试（断点、单步执行）
- 规则链测试框架（自动化测试用例）

### 长期（12+个月）

- 规则链市场（社区共享规则模板）
- 低代码平台（非技术人员可视化配置）
- 云端协作与版本控制集成
