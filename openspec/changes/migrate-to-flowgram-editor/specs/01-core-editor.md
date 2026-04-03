# Spec: 核心编辑器框架

## 概述

定义 Flowgram 编辑器的核心框架，包括主组件、Hooks、插件系统配置。

## 组件规格

### RuleGoFreeEditorPage

**职责**：
- 编辑器页面容器
- 状态管理（规则名、描述、DSL、保存状态）
- 工具栏交互
- 模态框管理

**Props**：
- 无（从 URL params 读取规则 ID）

**State**：
```typescript
interface EditorState {
  // 规则元信息
  ruleName: string;
  description: string;
  enabled: boolean;
  debugMode: boolean;
  root: boolean;
  
  // DSL 状态
  currentDsl: string;
  savedDsl: string;
  unsaved: boolean;
  
  // UI 状态
  importModalOpen: boolean;
  exportModalOpen: boolean;
  agentModalOpen: boolean;
  
  // 错误状态
  error: string | null;
  saveFeedback: { type: 'success' | 'error'; message: string } | null;
}
```

**关键方法**：
```typescript
// 保存规则
async function handleSave(): Promise<void>

// 导入 DSL
function handleImportDsl(dslJson: string): void

// 导出 DSL
function handleExportDsl(): string

// Agent 规划
async function handleAgentPlan(prompt: string): Promise<void>

// 撤销/重做
function handleUndo(): void
function handleRedo(): void
```

**生命周期**：
```typescript
// 1. 组件挂载
useEffect(() => {
  // 如果有 ID，从后端加载规则
  if (id) {
    loadRule(id);
  }
}, [id]);

// 2. 规则加载完成
useEffect(() => {
  if (editingRule) {
    // 解析 DSL
    const dsl = JSON.parse(editingRule.definition);
    // 转换为 Flowgram initialData
    const flowgramData = convertDslToFlowgramData(dsl);
    // 初始化编辑器
    setInitialData(flowgramData);
  }
}, [editingRule]);

// 3. 内容变化（自动保存状态）
editorProps.onContentChange = debounce((ctx) => {
  const dsl = buildRuleGoDsl(ctx, ruleName, { debugMode, root, enabled });
  setCurrentDsl(dsl);
  setUnsaved(dsl !== savedDsl);
}, 1000);
```

---

### useRuleGoEditorProps Hook

**职责**：
- 生成 Flowgram 编辑器的配置对象
- 配置插件系统
- 定义连接规则
- 绑定生命周期钩子

**签名**：
```typescript
function useRuleGoEditorProps(options: {
  initialData: FlowDocumentJSON;
  nodeRegistries: RuleGoNodeRegistry[];
  onInit?: (ctx: EditorContext) => void;
  onContentChange?: (ctx: EditorContext, event: ContentChangeEvent) => void;
}): FreeLayoutProps
```

**返回配置项**：
```typescript
{
  // 基础
  background: true,
  readonly: false,
  initialData: FlowDocumentJSON,
  nodeRegistries: RuleGoNodeRegistry[],
  
  // 画布
  playground: {
    preventGlobalGesture: true,
  },
  
  // 引擎
  nodeEngine: { enable: true },
  variableEngine: { enable: true },
  history: { enable: true, enableChangeNode: true },
  
  // 网格
  grid: {
    spacing: 24,
    snap: true,
    color: 'rgba(148, 163, 184, 0.28)',
  },
  
  // 缩放
  zoom: {
    min: 0.4,
    max: 2.0,
    step: 0.1,
    default: 0.9,
  },
  
  // 规则
  canAddLine: Function,
  canDeleteLine: Function,
  canDeleteNode: Function,
  canDropToNode: Function,
  
  // 插件
  plugins: Function[],
  
  // 钩子
  onInit: Function,
  onContentChange: Function,
  onAllLayersRendered: Function,
}
```

**连接规则详细定义**：
```typescript
// 是否允许创建连线
canAddLine: (ctx, fromPort, toPort) => {
  // 规则 1: 不能连接到自己
  if (fromPort.nodeID === toPort.nodeID) {
    return false;
  }
  
  // 规则 2: 输入端口只能有一条入线
  if (toPort.type === 'input') {
    const existingLines = ctx.lineManager.getLinesToPort(toPort.id);
    if (existingLines.length > 0) {
      return false;
    }
  }
  
  // 规则 3: 不能形成环路
  if (wouldCreateCycle(ctx, fromPort.nodeID, toPort.nodeID)) {
    return false;
  }
  
  // 规则 4: 容器节点的内部端口不能连接到外部
  const fromNode = ctx.nodeManager.getNodeById(fromPort.nodeID);
  const toNode = ctx.nodeManager.getNodeById(toPort.nodeID);
  
  if (isInternalNode(fromNode) && !isInternalNode(toNode)) {
    return false;
  }
  
  return true;
},

// 是否允许删除连线（始终允许）
canDeleteLine: (ctx, line) => true,

// 是否允许删除节点
canDeleteNode: (ctx, node) => {
  // BlockStart/BlockEnd 不可删除（容器内部节点）
  if (node.type === 'block-start' || node.type === 'block-end') {
    return false;
  }
  return true;
},

// 是否允许拖放到容器内
canDropToNode: (ctx, params) => {
  const { dragNode, targetNode } = params;
  
  // 只有容器节点可以接收拖入
  const targetRegistry = getNodeRegistry(targetNode.type);
  if (!targetRegistry?.meta.isContainer) {
    return false;
  }
  
  // BlockStart/BlockEnd 不能拖出
  if (dragNode.type === 'block-start' || dragNode.type === 'block-end') {
    return false;
  }
  
  // 容器不能拖入容器（避免嵌套）
  const dragRegistry = getNodeRegistry(dragNode.type);
  if (dragRegistry?.meta.isContainer) {
    return false;
  }
  
  return true;
},
```

---

## 插件配置规格

### 必需插件

#### 1. FreeLinesPlugin（连线渲染）

```typescript
createFreeLinesPlugin({
  // 连线上的添加按钮
  renderInsideLine: LineAddButton,
  
  // 连线样式
  lineStyle: {
    stroke: 'var(--rulego-line-default)',
    strokeWidth: 2,
    strokeDasharray: '0',  // 实线
  },
  
  // 选中态样式
  selectedLineStyle: {
    stroke: 'var(--rulego-line-selected)',
    strokeWidth: 3,
  },
  
  // 绘制中样式
  drawingLineStyle: {
    stroke: 'var(--rulego-line-drawing)',
    strokeWidth: 2,
    strokeDasharray: '5,5',  // 虚线
  },
  
  // 箭头配置
  arrow: {
    size: 8,
    type: 'triangle',
  },
})
```

#### 2. FreeSnapPlugin（对齐辅助线）

```typescript
createFreeSnapPlugin({
  snapDistance: 10,           // 吸附距离（像素）
  guideLineColor: '#3b82f6',  // 辅助线颜色（蓝色）
  guideLineWidth: 1,
  guideLineStyle: 'dashed',
  
  // 对齐类型
  snapTypes: ['left', 'center', 'right', 'top', 'middle', 'bottom'],
  
  // 启用智能间距
  snapToSpacing: true,
  spacingValues: [20, 40, 60],  // 常用间距
})
```

#### 3. MinimapPlugin（小地图）

```typescript
createMinimapPlugin({
  position: 'bottom-right',
  width: 200,
  height: 150,
  
  // 小地图样式
  backgroundColor: '#fafafa',
  borderColor: 'rgba(6, 7, 9, 0.15)',
  viewportColor: 'rgba(59, 130, 246, 0.3)',
  
  // 节点简化渲染
  nodeRenderer: (node) => ({
    fill: getNodeCategoryColor(node.type),
    stroke: 'none',
  }),
})
```

#### 4. ContainerNodePlugin（容器节点支持）★

```typescript
createContainerNodePlugin({
  // 支持的容器类型
  containerTypes: ['for-loop', 'group-action'],
  
  // 不允许嵌套容器
  allowNested: false,
  
  // 容器内节点的最小间距
  minNodeSpacing: 20,
  
  // 自动布局
  autoLayout: {
    enable: true,
    direction: 'horizontal',  // BlockStart → 子节点 → BlockEnd
    spacing: 40,
  },
})
```

#### 5. PanelManagerPlugin（侧边栏）

```typescript
createPanelManagerPlugin({
  panels: [
    {
      id: 'node-config',
      title: '节点配置',
      position: 'right',
      defaultWidth: 360,
      minWidth: 300,
      maxWidth: 600,
      collapsible: true,
      
      // 渲染函数
      render: ({ selectedNode }) => {
        if (!selectedNode) {
          return <EmptyState message="选择一个节点查看配置" />;
        }
        
        const registry = getNodeRegistry(selectedNode.type);
        return <NodeConfigPanel node={selectedNode} registry={registry} />;
      },
    },
  ],
})
```

### 可选插件

#### 6. ContextMenuPlugin（右键菜单）

```typescript
createContextMenuPlugin({
  menuItems: [
    { id: 'copy', label: '复制', icon: '📋', shortcut: 'Cmd+C' },
    { id: 'paste', label: '粘贴', icon: '📄', shortcut: 'Cmd+V' },
    { id: 'duplicate', label: '复制节点', icon: '📑', shortcut: 'Cmd+D' },
    { id: 'delete', label: '删除', icon: '🗑️', shortcut: 'Delete' },
    'separator',
    { id: 'bring-front', label: '置于顶层', icon: '⬆️' },
    { id: 'send-back', label: '置于底层', icon: '⬇️' },
    'separator',
    { id: 'group', label: '编组', icon: '📦', shortcut: 'Cmd+G' },
    { id: 'ungroup', label: '解组', icon: '📤', shortcut: 'Cmd+Shift+G' },
  ],
  
  // 动态菜单项（根据选中节点类型）
  getDynamicItems: (ctx, node) => {
    const items = [];
    
    if (node.type === 'for-loop') {
      items.push({
        id: 'expand-loop',
        label: '展开循环体',
        icon: '🔍',
      });
    }
    
    return items;
  },
})
```

---

## 性能要求

### 渲染性能

- 100 节点规则链加载时间 < 2s
- 200 节点规则链加载时间 < 5s
- 画布缩放/平移保持 60 FPS
- 节点拖动无明显延迟（< 16ms）

### 内存占用

- 100 节点规则链内存占用 < 50MB
- 200 节点规则链内存占用 < 100MB
- 长时间编辑无内存泄漏

### DSL 构建

- 100 节点规则链 DSL 构建时间 < 100ms
- 使用 debounce 节流（1000ms）
- 只在必要时触发（保存、导出、Agent 规划）

---

## 错误处理

### DSL 转换错误

```typescript
try {
  loadRuleGoDsl(dsl, ctx);
} catch (err) {
  if (err instanceof NodeTypeNotFoundError) {
    // 提示用户：不支持的节点类型
    showError(`不支持的节点类型: ${err.nodeType}`);
  } else if (err instanceof InvalidDslFormatError) {
    // 提示用户：DSL 格式无效
    showError(`DSL 格式无效: ${err.message}`);
  } else {
    // 通用错误
    showError(`加载失败: ${err.message}`);
  }
}
```

### 节点配置验证错误

```typescript
// 在表单提交时验证
const errors = formMeta.validate(node.data);

if (Object.keys(errors).length > 0) {
  // 显示验证错误
  showValidationErrors(errors);
  
  // 阻止保存
  return;
}
```

### 连接规则违规

```typescript
// canAddLine 返回 false 时
if (!canAddLine(ctx, fromPort, toPort)) {
  // 显示提示消息
  showToast('无法创建此连接：违反连接规则');
  
  // 可选：显示具体原因
  const reason = getConnectionErrorReason(fromPort, toPort);
  if (reason) {
    showTooltip(reason);
  }
}
```

---

## 兼容性要求

### 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### 后端 API 兼容

- 所有 API 调用保持不变
- DSL 格式 100% 向后兼容
- 新增字段只在 additionalInfo 中

### 数据迁移

- 现有规则链无需任何迁移即可加载
- additionalInfo 字段向后兼容
- 旧编辑器保存的规则新编辑器可加载
- 新编辑器保存的规则旧编辑器可加载（丢失额外信息但不影响执行）

---

## 测试用例

### 基础功能测试

```typescript
describe('RuleGoFreeEditorPage', () => {
  it('should render empty editor', () => {
    render(<RuleGoFreeEditorPage />);
    expect(screen.getByText('规则链编辑器')).toBeInTheDocument();
  });
  
  it('should load existing rule', async () => {
    const mockRule = createMockRule();
    const { container } = render(<RuleGoFreeEditorPage />);
    
    await waitFor(() => {
      expect(container.querySelector('.rulego-free-editor')).toBeInTheDocument();
    });
  });
  
  it('should handle save', async () => {
    const { getByText } = render(<RuleGoFreeEditorPage />);
    const saveButton = getByText('保存');
    
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockApiCreate).toHaveBeenCalled();
    });
  });
});
```

### 插件集成测试

```typescript
describe('Editor Plugins', () => {
  it('should show minimap', () => {
    const { container } = render(<RuleGoFreeEditorPage />);
    expect(container.querySelector('.minimap')).toBeInTheDocument();
  });
  
  it('should show snap guides on drag', async () => {
    const { container } = render(<RuleGoFreeEditorPage />);
    
    // 模拟拖动节点
    const node = container.querySelector('[data-node-id]');
    fireEvent.mouseDown(node);
    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 });
    
    await waitFor(() => {
      expect(container.querySelector('.snap-guide-line')).toBeInTheDocument();
    });
  });
});
```

---

## 文档要求

### 开发文档

- [ ] 编辑器架构说明
- [ ] 插件系统使用指南
- [ ] 节点开发教程
- [ ] DSL 转换逻辑文档
- [ ] 调试技巧和常见问题

### 用户文档

- [ ] 新旧编辑器对比
- [ ] 功能差异说明
- [ ] 迁移指南（如有必要）
- [ ] 常见操作教程（拖拽、连线、配置）

---

## 验收标准

- [ ] 编辑器能正常显示和操作
- [ ] 所有插件正常工作
- [ ] 能创建、保存、加载规则
- [ ] 性能指标达标
- [ ] 通过所有测试用例
- [ ] 代码 review 通过
- [ ] 文档完整
