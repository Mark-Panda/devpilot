# Spec: 测试策略与质量保证

## 概述

定义完整的测试策略，确保迁移后的编辑器功能完整、性能达标、与现有系统 100% 兼容。

## 测试金字塔

```
          ┌────────────┐
          │  E2E 测试   │  10%  - 关键用户流程
          │  (10 cases) │
        ┌─┴────────────┴─┐
        │  集成测试       │  30%  - 模块间交互
        │  (50 cases)    │
      ┌─┴────────────────┴─┐
      │  单元测试           │  60%  - 核心逻辑
      │  (200+ cases)      │
    ┌─┴────────────────────┴─┐
    │  静态检查                │  - TypeScript + ESLint
    └─────────────────────────┘
```

---

## 单元测试

### DSL 转换测试

#### buildRuleGoDsl 测试套件

```typescript
// __tests__/dsl/buildRuleGoDsl.test.ts

describe('buildRuleGoDsl', () => {
  let ctx: EditorContext;
  
  beforeEach(() => {
    ctx = createTestEditor();
  });
  
  describe('Basic Nodes', () => {
    it('should serialize start-trigger node', () => {
      addNode(ctx, {
        id: 'start',
        type: 'start-trigger',
        data: { title: '开始' },
      });
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      expect(parsed.metadata.nodes).toHaveLength(1);
      expect(parsed.metadata.nodes[0]).toMatchObject({
        id: 'start',
        type: 'startTrigger',
        name: '开始',
      });
    });
    
    it('should serialize rest-api-call with configuration', () => {
      addNode(ctx, {
        id: 'api1',
        type: 'rest-api-call',
        data: {
          title: 'Call API',
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"key": "value"}',
          timeout: 30,
        },
      });
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      const apiNode = parsed.metadata.nodes[0];
      expect(apiNode.type).toBe('restApiCall');
      expect(apiNode.configuration).toMatchObject({
        url: 'https://api.example.com/data',
        method: 'POST',
        timeout: 30,
      });
    });
  });
  
  describe('Connections', () => {
    it('should create Success connection', () => {
      const n1 = addNode(ctx, { type: 'start-trigger' });
      const n2 = addNode(ctx, { type: 'llm' });
      connectNodes(ctx, n1, n2);
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      expect(parsed.metadata.connections).toHaveLength(1);
      expect(parsed.metadata.connections[0]).toMatchObject({
        fromId: n1.id,
        toId: n2.id,
        type: 'Success',
      });
    });
    
    it('should create Failure connection', () => {
      const n1 = addNode(ctx, { type: 'rest-api-call' });
      const n2 = addNode(ctx, { type: 'delay' });
      connectNodes(ctx, n1, n2, 'failure'); // 连接到 failure 端口
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      const failureConn = parsed.metadata.connections.find(c => c.type === 'Failure');
      expect(failureConn).toBeDefined();
      expect(failureConn.toId).toBe(n2.id);
    });
  });
  
  describe('Container Nodes', () => {
    it('should serialize for-loop with sub-nodes', () => {
      const loop = addNode(ctx, {
        type: 'for-loop',
        data: {
          title: 'Loop',
          range: '1..5',
          mode: 1,
        },
      });
      
      const llm = addNodeToContainer(ctx, loop, {
        id: 'llm1',
        type: 'llm',
        data: { model: 'gpt-4' },
      });
      
      const transform = addNodeToContainer(ctx, loop, {
        id: 'trans1',
        type: 'js-transform',
        data: { script: 'return data;' },
      });
      
      // 容器内连线：llm → transform
      connectNodesInContainer(ctx, loop, llm, transform);
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      // 应该有 3 个节点：loop + llm + transform
      expect(parsed.metadata.nodes).toHaveLength(3);
      
      // Loop 的 configuration.do 应指向第一个子节点
      const loopNode = parsed.metadata.nodes.find(n => n.id === loop.id);
      expect(loopNode.configuration.do).toBe('llm1');
      
      // 应该有 Do 连接
      const doConn = parsed.metadata.connections.find(c => 
        c.fromId === loop.id && c.type === 'Do'
      );
      expect(doConn).toBeDefined();
      expect(doConn.toId).toBe('llm1');
      
      // 容器内连线
      const internalConn = parsed.metadata.connections.find(c =>
        c.fromId === 'llm1' && c.toId === 'trans1'
      );
      expect(internalConn).toBeDefined();
    });
  });
  
  describe('Multi-branch Nodes', () => {
    it('should serialize switch with multiple cases', () => {
      const sw = addNode(ctx, {
        type: 'switch',
        data: {
          cases: [
            { expression: '${value} > 10', label: 'High' },
            { expression: '${value} > 5', label: 'Medium' },
          ],
        },
      });
      
      const high = addNode(ctx, { type: 'llm' });
      const medium = addNode(ctx, { type: 'delay' });
      const low = addNode(ctx, { type: 'rest-api-call' });
      
      connectNodes(ctx, sw, high, 'case_0');
      connectNodes(ctx, sw, medium, 'case_1');
      connectNodes(ctx, sw, low, 'default');
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      // Switch 配置
      const swNode = parsed.metadata.nodes.find(n => n.id === sw.id);
      expect(swNode.configuration.cases).toHaveLength(2);
      expect(swNode.configuration.cases[0].expression).toBe('${value} > 10');
      
      // 连接
      const swConns = parsed.metadata.connections.filter(c => c.fromId === sw.id);
      expect(swConns).toHaveLength(3);
      expect(swConns.map(c => c.type).sort()).toEqual(['Case0', 'Case1', 'Default'].sort());
    });
    
    it('should serialize fork with parallel branches', () => {
      const fork = addNode(ctx, {
        type: 'fork',
        data: { branchCount: 3 },
      });
      
      const b1 = addNode(ctx, { type: 'llm' });
      const b2 = addNode(ctx, { type: 'rest-api-call' });
      const b3 = addNode(ctx, { type: 'delay' });
      
      connectNodes(ctx, fork, b1, 'branch_0');
      connectNodes(ctx, fork, b2, 'branch_1');
      connectNodes(ctx, fork, b3, 'branch_2');
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      // Fork 的所有分支都是 Success 类型
      const forkConns = parsed.metadata.connections.filter(c => c.fromId === fork.id);
      expect(forkConns).toHaveLength(3);
      expect(forkConns.every(c => c.type === 'Success')).toBe(true);
    });
  });
  
  describe('Endpoints', () => {
    it('should put http-trigger in endpoints', () => {
      addNode(ctx, {
        id: 'ep1',
        type: 'http-trigger',
        data: {
          path: '/webhook',
          method: 'POST',
        },
      });
      
      const dsl = buildRuleGoDsl(ctx, 'test');
      const parsed = JSON.parse(dsl);
      
      // 不应该在 nodes 中
      expect(parsed.metadata.nodes).toHaveLength(0);
      
      // 应该在 endpoints 中
      expect(parsed.metadata.endpoints).toHaveLength(1);
      expect(parsed.metadata.endpoints[0]).toMatchObject({
        id: 'ep1',
        type: 'http',
        configuration: {
          path: '/webhook',
          method: 'POST',
        },
      });
    });
  });
});
```

#### loadRuleGoDsl 测试套件

```typescript
// __tests__/dsl/loadRuleGoDsl.test.ts

describe('loadRuleGoDsl', () => {
  let ctx: EditorContext;
  
  beforeEach(() => {
    ctx = createTestEditor();
  });
  
  it('should create nodes from DSL', () => {
    const dsl = {
      ruleChain: { id: 'test', name: 'Test' },
      metadata: {
        nodes: [
          {
            id: 'n1',
            type: 'startTrigger',
            name: 'Start',
            configuration: {},
          },
          {
            id: 'n2',
            type: 'ai/llm',
            name: 'LLM',
            configuration: {
              model: 'gpt-4',
              temperature: 0.7,
            },
          },
        ],
        connections: [],
      },
    };
    
    loadRuleGoDsl(dsl, ctx);
    
    expect(ctx.nodeManager.getAllNodes()).toHaveLength(2);
    
    const llmNode = ctx.nodeManager.getNodeById('n2');
    expect(llmNode.type).toBe('llm');
    expect(llmNode.data.model).toBe('gpt-4');
    expect(llmNode.data.temperature).toBe(0.7);
  });
  
  it('should create connections', () => {
    const dsl = {
      ruleChain: { id: 'test', name: 'Test' },
      metadata: {
        nodes: [
          { id: 'n1', type: 'startTrigger', name: 'Start', configuration: {} },
          { id: 'n2', type: 'ai/llm', name: 'LLM', configuration: {} },
        ],
        connections: [
          { fromId: 'n1', toId: 'n2', type: 'Success' },
        ],
      },
    };
    
    loadRuleGoDsl(dsl, ctx);
    
    const lines = ctx.lineManager.getAllLines();
    expect(lines).toHaveLength(1);
    
    const fromPort = ctx.portManager.getPortById(lines[0].fromPortID);
    const toPort = ctx.portManager.getPortById(lines[0].toPortID);
    
    expect(fromPort.nodeID).toBe('n1');
    expect(toPort.nodeID).toBe('n2');
  });
  
  it('should handle for-loop container', () => {
    const dsl = {
      ruleChain: { id: 'test', name: 'Test' },
      metadata: {
        nodes: [
          {
            id: 'loop1',
            type: 'for',
            name: 'Loop',
            configuration: { range: '1..3', do: 'llm1', mode: 0 },
          },
          {
            id: 'llm1',
            type: 'ai/llm',
            name: 'LLM',
            configuration: { model: 'gpt-4' },
            additionalInfo: { parentContainer: 'loop1' },
          },
        ],
        connections: [
          { fromId: 'loop1', toId: 'llm1', type: 'Do' },
        ],
      },
    };
    
    loadRuleGoDsl(dsl, ctx);
    
    // 主画布应该只有 loop 节点
    const mainNodes = ctx.nodeManager.getAllNodes().filter(n => 
      !n.meta.parentContainer
    );
    expect(mainNodes).toHaveLength(1);
    
    // Loop 节点应该有 blocks
    const loopNode = ctx.nodeManager.getNodeById('loop1');
    expect(loopNode.blocks).toBeDefined();
    expect(loopNode.blocks.length).toBeGreaterThan(0);
    
    // llm1 应该在容器内
    const llmInContainer = loopNode.blocks.some(b => b.id === 'llm1');
    expect(llmInContainer).toBe(true);
  });
  
  it('should throw error for unknown node type', () => {
    const dsl = {
      ruleChain: { id: 'test', name: 'Test' },
      metadata: {
        nodes: [
          { id: 'n1', type: 'unknown-type', name: 'Unknown', configuration: {} },
        ],
        connections: [],
      },
    };
    
    expect(() => {
      loadRuleGoDsl(dsl, ctx);
    }).toThrow(NodeTypeNotFoundError);
  });
});
```

### 节点注册表测试

```typescript
// __tests__/nodes/node-registry.test.ts

describe('Node Registries', () => {
  const allRegistries = rulegoNodeRegistries;
  
  it('should have all 33 node types', () => {
    expect(allRegistries).toHaveLength(33);
  });
  
  it('should have unique node types', () => {
    const types = allRegistries.map(r => r.type);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBe(types.length);
  });
  
  it('should have backend type mapping for all nodes', () => {
    allRegistries.forEach(registry => {
      expect(registry.backendNodeType).toBeDefined();
      expect(typeof registry.backendNodeType).toBe('string');
      expect(registry.backendNodeType.length).toBeGreaterThan(0);
    });
  });
  
  describe('ForLoopNodeRegistry', () => {
    const registry = allRegistries.find(r => r.type === 'for-loop')!;
    
    it('should be defined', () => {
      expect(registry).toBeDefined();
    });
    
    it('should be a container node', () => {
      expect(registry.meta.isContainer).toBe(true);
    });
    
    it('should create blocks on add', () => {
      const nodeData = registry.onAdd!();
      expect(nodeData.blocks).toBeDefined();
      expect(nodeData.blocks.length).toBe(2);  // BlockStart + BlockEnd
      expect(nodeData.blocks.some(b => b.type === 'block-start')).toBe(true);
      expect(nodeData.blocks.some(b => b.type === 'block-end')).toBe(true);
    });
    
    it('should serialize configuration', () => {
      const node = createMockNode({
        type: 'for-loop',
        data: {
          range: '1..10',
          mode: 1,
        },
      });
      
      const config = registry.serializeConfiguration!(node);
      expect(config).toMatchObject({
        range: '1..10',
        mode: 1,
      });
      expect(config.do).toBeDefined();  // 应该有 do 字段
    });
    
    it('should deserialize configuration', () => {
      const config = {
        range: '${items}',
        do: 's3',
        mode: 2,
      };
      
      const nodeData = registry.deserializeConfiguration!(config);
      expect(nodeData).toMatchObject({
        range: '${items}',
        mode: 2,
      });
    });
  });
  
  describe('SwitchNodeRegistry', () => {
    const registry = allRegistries.find(r => r.type === 'switch')!;
    
    it('should have dynamic ports based on cases', () => {
      const node = createMockNode({
        type: 'switch',
        data: {
          cases: [
            { expression: 'a > 1' },
            { expression: 'a > 2' },
            { expression: 'a > 3' },
          ],
        },
      });
      
      const ports = registry.meta.getPortsConfig!(node);
      
      // 1 input + 3 case outputs + 1 default output
      expect(ports).toHaveLength(5);
      expect(ports.filter(p => p.type === 'output')).toHaveLength(4);
    });
  });
});
```

---

## 集成测试

### 编辑器生命周期测试

```typescript
// __tests__/integration/editor-lifecycle.test.tsx

describe('Editor Lifecycle', () => {
  it('should initialize empty editor', () => {
    const { container } = render(<RuleGoFreeEditorPage />);
    
    expect(container.querySelector('.rulego-free-editor')).toBeInTheDocument();
    expect(container.querySelector('.rulego-node-panel')).toBeInTheDocument();
  });
  
  it('should load existing rule', async () => {
    const mockRule = createMockRule({
      id: 'rule123',
      name: 'Test Rule',
      definition: JSON.stringify({
        ruleChain: { id: 'rule123', name: 'Test Rule' },
        metadata: {
          nodes: [
            { id: 'n1', type: 'startTrigger', name: 'Start', configuration: {} },
          ],
          connections: [],
        },
      }),
    });
    
    mockApiGetRule.mockResolvedValue(mockRule);
    
    render(<RuleGoFreeEditorPage />, {
      initialEntries: ['/rulego/editor/rule123'],
    });
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Rule')).toBeInTheDocument();
    });
  });
  
  it('should save new rule', async () => {
    const { getByText, getByPlaceholderText } = render(<RuleGoFreeEditorPage />);
    
    // 输入规则名
    const nameInput = getByPlaceholderText('规则链名称');
    fireEvent.change(nameInput, { target: { value: 'New Rule' } });
    
    // 添加节点（模拟）
    // ...
    
    // 点击保存
    const saveButton = getByText('保存');
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockApiCreateRule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Rule',
          definition: expect.any(String),
        })
      );
    });
  });
});
```

### DSL Round-trip 测试

```typescript
// __tests__/integration/dsl-roundtrip.test.ts

describe('DSL Round-trip', () => {
  const testCases = [
    {
      name: 'simple-linear-flow',
      dsl: {
        ruleChain: { id: 'test', name: 'Linear' },
        metadata: {
          nodes: [
            { id: 'n1', type: 'startTrigger', name: 'Start', configuration: {} },
            { id: 'n2', type: 'restApiCall', name: 'API', configuration: { url: 'https://api.com' } },
            { id: 'n3', type: 'ai/llm', name: 'LLM', configuration: { model: 'gpt-4' } },
          ],
          connections: [
            { fromId: 'n1', toId: 'n2', type: 'Success' },
            { fromId: 'n2', toId: 'n3', type: 'Success' },
          ],
        },
      },
    },
    {
      name: 'for-loop-with-sub-nodes',
      dsl: {
        ruleChain: { id: 'test', name: 'Loop' },
        metadata: {
          nodes: [
            { id: 'for1', type: 'for', name: 'Loop', configuration: { range: '1..5', do: 'llm1', mode: 1 } },
            { id: 'llm1', type: 'ai/llm', name: 'LLM', configuration: { model: 'gpt-4' } },
            { id: 'trans1', type: 'jsTransform', name: 'Transform', configuration: { script: 'return data;' } },
          ],
          connections: [
            { fromId: 'for1', toId: 'llm1', type: 'Do' },
            { fromId: 'llm1', toId: 'trans1', type: 'Success' },
          ],
        },
      },
    },
    {
      name: 'switch-multi-branch',
      dsl: {
        ruleChain: { id: 'test', name: 'Switch' },
        metadata: {
          nodes: [
            {
              id: 'sw1',
              type: 'switch',
              name: 'Switch',
              configuration: {
                cases: [
                  { expression: 'a > 10' },
                  { expression: 'a > 5' },
                ],
              },
            },
            { id: 'n1', type: 'ai/llm', name: 'High', configuration: {} },
            { id: 'n2', type: 'delay', name: 'Medium', configuration: { seconds: 5 } },
            { id: 'n3', type: 'restApiCall', name: 'Low', configuration: { url: 'https://api.com' } },
          ],
          connections: [
            { fromId: 'sw1', toId: 'n1', type: 'Case0' },
            { fromId: 'sw1', toId: 'n2', type: 'Case1' },
            { fromId: 'sw1', toId: 'n3', type: 'Default' },
          ],
        },
      },
    },
    {
      name: 'fork-join-parallel',
      dsl: {
        ruleChain: { id: 'test', name: 'Parallel' },
        metadata: {
          nodes: [
            { id: 'fork1', type: 'fork', name: 'Fork', configuration: {} },
            { id: 'n1', type: 'ai/llm', name: 'Branch 1', configuration: {} },
            { id: 'n2', type: 'ai/llm', name: 'Branch 2', configuration: {} },
            { id: 'join1', type: 'join', name: 'Join', configuration: {} },
          ],
          connections: [
            { fromId: 'fork1', toId: 'n1', type: 'Success' },
            { fromId: 'fork1', toId: 'n2', type: 'Success' },
            { fromId: 'n1', toId: 'join1', type: 'Success' },
            { fromId: 'n2', toId: 'join1', type: 'Success' },
          ],
        },
      },
    },
  ];
  
  testCases.forEach(({ name, dsl }) => {
    describe(name, () => {
      it('should load without error', () => {
        expect(() => {
          loadRuleGoDsl(dsl, ctx);
        }).not.toThrow();
      });
      
      it('should maintain DSL integrity', () => {
        // Load
        loadRuleGoDsl(dsl, ctx);
        
        // Build
        const rebuiltDslStr = buildRuleGoDsl(ctx, dsl.ruleChain.name);
        const rebuiltDsl = JSON.parse(rebuiltDslStr);
        
        // Compare (normalize for comparison)
        const normalize = (d: any) => {
          const copy = JSON.parse(JSON.stringify(d));
          // 移除 additionalInfo
          copy.metadata.nodes.forEach(n => {
            delete n.additionalInfo;
          });
          // 排序以便比较
          copy.metadata.nodes.sort((a, b) => a.id.localeCompare(b.id));
          copy.metadata.connections.sort((a, b) => 
            `${a.fromId}${a.toId}`.localeCompare(`${b.fromId}${b.toId}`)
          );
          return copy;
        };
        
        expect(normalize(rebuiltDsl)).toEqual(normalize(dsl));
      });
    });
  });
});
```

---

## 回归测试

### 生产规则兼容性测试

```typescript
// __tests__/regression/production-rules.test.ts

describe('Production Rules Compatibility', () => {
  // 从数据库加载所有生产规则
  const productionRules = loadProductionRules();
  
  productionRules.forEach(rule => {
    describe(`Rule: ${rule.name} (${rule.id})`, () => {
      let ctx: EditorContext;
      
      beforeEach(() => {
        ctx = createTestEditor();
      });
      
      it('should load without error', () => {
        const dsl = JSON.parse(rule.definition);
        
        expect(() => {
          loadRuleGoDsl(dsl, ctx);
        }).not.toThrow();
      });
      
      it('should create all nodes', () => {
        const dsl = JSON.parse(rule.definition);
        loadRuleGoDsl(dsl, ctx);
        
        const expectedNodeCount = dsl.metadata.nodes.length;
        const actualNodeCount = ctx.nodeManager.getAllNodes().length;
        
        // 容器节点会多出内部节点，所以实际数量可能更多
        expect(actualNodeCount).toBeGreaterThanOrEqual(expectedNodeCount);
      });
      
      it('should maintain DSL after round-trip', () => {
        const originalDsl = JSON.parse(rule.definition);
        
        loadRuleGoDsl(originalDsl, ctx);
        const rebuiltDslStr = buildRuleGoDsl(ctx, rule.name, {
          ruleId: rule.id,
          debugMode: originalDsl.ruleChain.debugMode,
          root: originalDsl.ruleChain.root,
          enabled: !originalDsl.ruleChain.disabled,
        });
        const rebuiltDsl = JSON.parse(rebuiltDslStr);
        
        // 核心字段必须一致
        expect(rebuiltDsl.metadata.nodes.length).toBe(originalDsl.metadata.nodes.length);
        expect(rebuiltDsl.metadata.connections.length).toBe(originalDsl.metadata.connections.length);
        
        // 节点 ID 和类型必须一致
        const originalNodeIds = originalDsl.metadata.nodes.map(n => n.id).sort();
        const rebuiltNodeIds = rebuiltDsl.metadata.nodes.map(n => n.id).sort();
        expect(rebuiltNodeIds).toEqual(originalNodeIds);
      });
    });
  });
  
  it('should generate summary report', () => {
    const results = productionRules.map(rule => {
      try {
        const ctx = createTestEditor();
        const dsl = JSON.parse(rule.definition);
        loadRuleGoDsl(dsl, ctx);
        const rebuilt = buildRuleGoDsl(ctx, rule.name);
        
        return {
          id: rule.id,
          name: rule.name,
          success: true,
          nodeCount: dsl.metadata.nodes.length,
        };
      } catch (err) {
        return {
          id: rule.id,
          name: rule.name,
          success: false,
          error: err.message,
        };
      }
    });
    
    const failures = results.filter(r => !r.success);
    const successRate = ((results.length - failures.length) / results.length * 100).toFixed(1);
    
    console.log(`\n=== Production Rules Compatibility Report ===`);
    console.log(`Total: ${results.length}`);
    console.log(`Success: ${results.length - failures.length}`);
    console.log(`Failures: ${failures.length}`);
    console.log(`Success Rate: ${successRate}%`);
    
    if (failures.length > 0) {
      console.log(`\nFailed Rules:`);
      failures.forEach(f => {
        console.log(`  - ${f.name} (${f.id}): ${f.error}`);
      });
    }
    
    expect(failures).toHaveLength(0);
  });
});
```

---

## 性能测试

### 加载性能测试

```typescript
// __tests__/performance/load-performance.test.ts

describe('Load Performance', () => {
  const testScales = [
    { nodes: 10, name: 'small' },
    { nodes: 50, name: 'medium' },
    { nodes: 100, name: 'large' },
    { nodes: 200, name: 'very-large' },
  ];
  
  testScales.forEach(({ nodes, name }) => {
    it(`should load ${nodes}-node rule in reasonable time (${name})`, async () => {
      const dsl = generateLargeDsl(nodes);
      const ctx = createTestEditor();
      
      const startTime = performance.now();
      loadRuleGoDsl(dsl, ctx);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      console.log(`Load ${nodes} nodes: ${duration.toFixed(2)}ms`);
      
      // 性能要求
      if (nodes <= 100) {
        expect(duration).toBeLessThan(2000);  // < 2s
      } else if (nodes <= 200) {
        expect(duration).toBeLessThan(5000);  // < 5s
      }
    });
  });
});
```

### DSL 构建性能测试

```typescript
describe('Build DSL Performance', () => {
  it('should build DSL quickly', () => {
    const ctx = createTestEditor();
    
    // 创建 100 个节点
    for (let i = 0; i < 100; i++) {
      addNode(ctx, {
        type: i % 2 === 0 ? 'rest-api-call' : 'llm',
        data: { title: `Node ${i}` },
      });
    }
    
    // 创建连线（线性链）
    const nodes = ctx.nodeManager.getAllNodes();
    for (let i = 0; i < nodes.length - 1; i++) {
      connectNodes(ctx, nodes[i], nodes[i + 1]);
    }
    
    // 测试构建时间
    const startTime = performance.now();
    const dsl = buildRuleGoDsl(ctx, 'test');
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    console.log(`Build 100 nodes DSL: ${duration.toFixed(2)}ms`);
    
    expect(duration).toBeLessThan(100);  // < 100ms
    expect(dsl.length).toBeGreaterThan(0);
  });
});
```

### 内存泄漏测试

```typescript
describe('Memory Leak Test', () => {
  it('should not leak memory on repeated load/unload', () => {
    const iterations = 50;
    const dsl = generateLargeDsl(100);
    
    // 记录初始内存（如果可用）
    const initialMemory = (performance as any).memory?.usedJSHeapSize;
    
    for (let i = 0; i < iterations; i++) {
      const ctx = createTestEditor();
      loadRuleGoDsl(dsl, ctx);
      ctx.nodeManager.clear();  // 清理
    }
    
    // 强制 GC（测试环境）
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = (performance as any).memory?.usedJSHeapSize;
    
    if (initialMemory && finalMemory) {
      const growth = finalMemory - initialMemory;
      const growthMB = growth / 1024 / 1024;
      
      console.log(`Memory growth after ${iterations} iterations: ${growthMB.toFixed(2)} MB`);
      
      // 内存增长应该 < 10MB（允许一定的缓存）
      expect(growthMB).toBeLessThan(10);
    }
  });
});
```

---

## E2E 测试

### 关键用户流程

```typescript
// __tests__/e2e/user-workflows.test.ts

describe('User Workflows', () => {
  it('should complete full creation workflow', async () => {
    // 1. 打开新建页面
    await page.goto('http://localhost:5173/rulego/editor');
    
    // 2. 输入规则名
    await page.fill('input[placeholder="规则链名称"]', 'E2E Test Rule');
    
    // 3. 从节点面板拖拽节点到画布
    await page.dragAndDrop(
      '[data-node-type="http-trigger"]',
      '.rulego-free-editor',
      { targetPosition: { x: 200, y: 100 } }
    );
    
    await page.dragAndDrop(
      '[data-node-type="llm"]',
      '.rulego-free-editor',
      { targetPosition: { x: 400, y: 100 } }
    );
    
    // 4. 连接节点
    await page.click('[data-port-id="output"]');  // HTTP 的输出端口
    await page.click('[data-port-id="input"]');   // LLM 的输入端口
    
    // 5. 配置 HTTP 触发器
    await page.click('[data-node-id^="http"]');
    await page.fill('[name="path"]', '/api/webhook');
    await page.selectOption('[name="method"]', 'POST');
    
    // 6. 配置 LLM 节点
    await page.click('[data-node-id^="llm"]');
    await page.fill('[name="model"]', 'gpt-4');
    await page.fill('[name="temperature"]', '0.7');
    
    // 7. 保存
    await page.click('text=保存');
    
    // 8. 验证保存成功
    await expect(page.locator('text=已保存')).toBeVisible({ timeout: 3000 });
    
    // 9. 验证 URL 跳转到规则详情页
    await expect(page).toHaveURL(/\/rulego\/editor\/[a-f0-9-]+/);
  });
  
  it('should complete edit workflow', async () => {
    // 1. 打开已有规则
    await page.goto('http://localhost:5173/rulego/editor/rule123');
    
    // 2. 等待加载
    await page.waitForSelector('.rulego-free-editor');
    
    // 3. 添加新节点
    await page.dragAndDrop(
      '[data-node-type="delay"]',
      '.rulego-free-editor',
      { targetPosition: { x: 600, y: 100 } }
    );
    
    // 4. 连接到现有节点
    // ...
    
    // 5. 保存
    await page.click('text=保存');
    
    // 6. 验证未保存标记消失
    await expect(page.locator('.unsaved-badge')).not.toBeVisible();
  });
  
  it('should complete loop container workflow', async () => {
    await page.goto('http://localhost:5173/rulego/editor');
    
    // 1. 拖入 For Loop 节点
    await page.dragAndDrop(
      '[data-node-type="for-loop"]',
      '.rulego-free-editor',
      { targetPosition: { x: 300, y: 200 } }
    );
    
    // 2. 配置 Loop
    await page.click('[data-node-id^="for"]');
    await page.fill('[name="range"]', '1..10');
    await page.selectOption('[name="mode"]', '1');  // 追加模式
    
    // 3. 拖入子节点到容器内
    await page.dragAndDrop(
      '[data-node-type="llm"]',
      '[data-container-id^="for"] .loop-body',
      { targetPosition: { x: 100, y: 50 } }
    );
    
    // 4. 验证子节点在容器内
    const subNode = await page.locator('[data-container-id^="for"] [data-node-id^="llm"]');
    await expect(subNode).toBeVisible();
    
    // 5. 保存并验证
    await page.click('text=保存');
    await expect(page.locator('text=已保存')).toBeVisible();
  });
});
```

---

## 测试工具函数

### 测试编辑器工厂

```typescript
// __tests__/utils/testEditorFactory.ts

export function createTestEditor(): EditorContext {
  const container = document.createElement('div');
  document.body.appendChild(container);
  
  const editorProps = useRuleGoEditorProps({
    initialData: createEmptyFlowgramData(),
    nodeRegistries: rulegoNodeRegistries,
  });
  
  // 创建测试用的 EditorContext
  const ctx = new EditorContext(editorProps);
  
  return ctx;
}

export function addNode(
  ctx: EditorContext,
  config: Partial<NodeCreateData>
): FlowNodeEntity {
  return ctx.nodeManager.addNode({
    id: config.id || `node_${nanoid(5)}`,
    type: config.type || 'start-trigger',
    data: config.data || {},
    meta: config.meta || { position: { x: 100, y: 100 } },
  });
}

export function connectNodes(
  ctx: EditorContext,
  fromNode: FlowNodeEntity,
  toNode: FlowNodeEntity,
  fromPortId: string = 'output',
  toPortId: string = 'input'
): void {
  const fromPort = fromNode.getAllPorts().find(p => p.portID === fromPortId);
  const toPort = toNode.getAllPorts().find(p => p.portID === toPortId);
  
  if (!fromPort || !toPort) {
    throw new Error(`Port not found: ${fromPortId} or ${toPortId}`);
  }
  
  ctx.lineManager.addLine({
    fromPortID: fromPort.id,
    toPortID: toPort.id,
  });
}

export function addNodeToContainer(
  ctx: EditorContext,
  container: FlowNodeEntity,
  nodeConfig: Partial<NodeCreateData>
): FlowNodeEntity {
  const node = addNode(ctx, nodeConfig);
  
  if (!container.blocks) {
    container.blocks = [];
  }
  
  container.blocks.push(node as any);
  
  return node;
}
```

### Mock 数据生成

```typescript
// __tests__/utils/mockData.ts

export function createMockRule(overrides?: Partial<RuleGoRule>): RuleGoRule {
  return {
    id: 'rule_' + nanoid(8),
    name: 'Mock Rule',
    description: 'Test rule',
    definition: JSON.stringify({
      ruleChain: { id: 'rule01', name: 'Mock Rule' },
      metadata: { nodes: [], connections: [] },
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function generateLargeDsl(nodeCount: number): RuleGoDsl {
  const nodes: RuleGoNode[] = [];
  const connections: RuleGoConnection[] = [];
  
  // 生成线性链
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `n${i}`,
      type: i === 0 ? 'startTrigger' : (i % 3 === 0 ? 'for' : 'ai/llm'),
      name: `Node ${i}`,
      debugMode: false,
      configuration: {},
    });
    
    if (i > 0) {
      connections.push({
        fromId: `n${i - 1}`,
        toId: `n${i}`,
        type: 'Success',
      });
    }
  }
  
  return {
    ruleChain: { id: 'large-rule', name: 'Large Rule' },
    metadata: { firstNodeIndex: 0, nodes, connections, ruleChainConnections: [] },
  };
}
```

---

## CI/CD 集成

### GitHub Actions 配置

```yaml
# .github/workflows/test-flowgram-editor.yml

name: Test Flowgram Editor

on:
  push:
    branches: [feat/migrate-to-flowgram]
    paths:
      - 'frontend/src/modules/rulego-free/**'
      - 'frontend/package.json'
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        working-directory: frontend
        run: npm ci
      
      - name: Run unit tests
        working-directory: frontend
        run: npm run test:unit
      
      - name: Run integration tests
        working-directory: frontend
        run: npm run test:integration
      
      - name: Run regression tests
        working-directory: frontend
        run: npm run test:regression
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
      
      - name: Check test coverage
        working-directory: frontend
        run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./frontend/coverage/coverage-final.json
  
  e2e:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd frontend && npm ci
          npx playwright install --with-deps
      
      - name: Build frontend
        working-directory: frontend
        run: npm run build
      
      - name: Start backend
        run: |
          cd backend
          go run . &
          sleep 5
      
      - name: Run E2E tests
        working-directory: frontend
        run: npx playwright test
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

---

## 测试覆盖率要求

### 代码覆盖率目标

| 模块 | 行覆盖率 | 分支覆盖率 | 函数覆盖率 |
|-----|---------|----------|----------|
| DSL 适配层 | ≥ 95% | ≥ 90% | 100% |
| 节点注册表 | ≥ 90% | ≥ 85% | ≥ 95% |
| UI 组件 | ≥ 80% | ≥ 75% | ≥ 85% |
| Hooks | ≥ 85% | ≥ 80% | ≥ 90% |
| 工具函数 | ≥ 95% | ≥ 90% | 100% |
| **总体** | **≥ 85%** | **≥ 80%** | **≥ 90%** |

### 关键路径 100% 覆盖

必须 100% 测试覆盖的关键函数：
- `buildRuleGoDsl`
- `loadRuleGoDsl`
- `serializeConfiguration` (所有节点)
- `deserializeConfiguration` (所有节点)
- `wouldCreateCycle`
- `findOutputPortByConnectionType`

---

## 测试数据

### 示例 DSL 文件

```
__tests__/fixtures/
├─ simple-linear-flow.json         # 3 节点线性流
├─ for-loop-basic.json             # 基础循环
├─ for-loop-nested-nodes.json      # 循环内多个节点
├─ switch-multi-branch.json        # Switch 多分支
├─ fork-join-parallel.json         # Fork-Join 并行
├─ complex-workflow.json           # 综合复杂流程
├─ all-node-types.json             # 包含所有 33 种节点
└─ production-samples/             # 生产规则示例
   ├─ rule-001.json
   ├─ rule-002.json
   └─ ...
```

### 生产规则采样

```typescript
// scripts/sampleProductionRules.ts

/**
 * 从生产数据库采样规则，用于回归测试
 */
async function sampleProductionRules() {
  const db = await connectDatabase();
  
  // 采样策略
  const samples = await db.query(`
    SELECT * FROM rulego_rules
    WHERE enabled = true
    ORDER BY RANDOM()
    LIMIT 20
  `);
  
  // 匿名化敏感信息
  const anonymized = samples.map(rule => ({
    ...rule,
    name: `Sample ${rule.id}`,
    description: '',
    definition: anonymizeConfiguration(rule.definition),
  }));
  
  // 保存到 fixtures
  anonymized.forEach((rule, i) => {
    fs.writeFileSync(
      `__tests__/fixtures/production-samples/rule-${String(i + 1).padStart(3, '0')}.json`,
      rule.definition,
      'utf-8'
    );
  });
}
```

---

## 质量门禁

### 合并前必须通过

- [ ] 所有单元测试通过（100%）
- [ ] 所有集成测试通过（100%）
- [ ] 代码覆盖率达标（≥ 85%）
- [ ] 性能测试通过（100 节点 < 2s）
- [ ] 回归测试通过（至少 90% 生产规则兼容）
- [ ] E2E 测试通过（关键流程 100%）
- [ ] TypeScript 编译无错误
- [ ] ESLint 无 error（warning 可接受）
- [ ] Code review 批准

### 发布前必须完成

- [ ] 完整回归测试（所有生产规则）
- [ ] 性能基准测试（与旧编辑器对比）
- [ ] 浏览器兼容性测试（Chrome/Firefox/Safari/Edge）
- [ ] 长时间稳定性测试（编辑 1 小时无崩溃）
- [ ] 内存泄漏测试通过
- [ ] 安全扫描通过
- [ ] 可访问性测试（WCAG 2.1 AA 级）

---

## 测试执行计划

### Phase 1: 单元测试（持续进行）

- 每完成一个模块立即编写单元测试
- 目标：开发同步，测试覆盖率实时监控
- 工具：Vitest + Testing Library

### Phase 2: 集成测试（Week 6-7）

- 在主要模块完成后开始
- 重点测试模块间交互
- 工具：Vitest + Mock Service Worker

### Phase 3: 回归测试（Week 7）

- 使用生产规则样本
- 自动化测试所有规则的加载/保存
- 生成兼容性报告

### Phase 4: E2E 测试（Week 8）

- 模拟真实用户操作
- 覆盖所有关键流程
- 工具：Playwright

### Phase 5: 性能测试（Week 8）

- 大规则链加载性能
- 内存占用测试
- 长时间运行稳定性
- 工具：Chrome DevTools + 自定义脚本

---

## 验收标准

### 功能完整性（100%）

- [ ] 所有 33 个节点类型都能创建、配置、保存、加载
- [ ] 所有节点的表单验证正常工作
- [ ] DSL 双向转换准确无误
- [ ] 容器节点（For/GroupAction）正常工作
- [ ] 多分支节点（Switch/Fork）动态端口正常
- [ ] 连接规则正确（环路检测、端口限制等）
- [ ] 撤销/重做功能正常
- [ ] 导入/导出功能正常
- [ ] Agent 规划功能正常

### 兼容性（≥ 95%）

- [ ] 至少 95% 的生产规则能正确加载
- [ ] 所有测试用例的 Round-trip 通过
- [ ] 与旧编辑器保存的规则互相兼容

### 性能（达标）

- [ ] 100 节点加载 < 2s
- [ ] 200 节点加载 < 5s
- [ ] DSL 构建 < 100ms (100 nodes)
- [ ] 画布操作 60 FPS
- [ ] 内存增长 < 10MB (50 次加载/卸载)

### 质量（无严重缺陷）

- [ ] 无 P0/P1 级别 bug
- [ ] P2 bug < 5 个
- [ ] 代码覆盖率 ≥ 85%
- [ ] TypeScript 类型完整
- [ ] ESLint 无 error

---

## 测试环境

### 本地开发

```bash
# 运行所有测试
npm run test

# 运行特定测试
npm run test:unit
npm run test:integration
npm run test:e2e

# 生成覆盖率报告
npm run test:coverage

# 监听模式（开发时）
npm run test:watch
```

### CI 环境

- GitHub Actions
- 每次 push 到 feat/migrate-to-flowgram 分支自动触发
- PR 必须通过所有测试才能合并
- 测试结果在 PR 页面显示

### 测试数据库

- 使用独立的测试数据库
- 包含生产规则的匿名化样本
- 每次测试前重置到初始状态

---

## Bug 追踪

### 严重性分级

- **P0 (Blocker)**: 核心功能完全无法使用，阻塞发布
  - 例：无法保存规则、DSL 转换完全失败
  
- **P1 (Critical)**: 重要功能异常，严重影响使用
  - 例：Loop 容器无法正常工作、某类节点无法加载
  
- **P2 (Major)**: 功能缺陷，有替代方案
  - 例：某个节点的表单验证不准确、样式显示异常
  
- **P3 (Minor)**: 小问题，不影响核心功能
  - 例：工具提示文字错误、图标显示偏移

### 发布门禁

- **Alpha 版本**：P0 = 0
- **Beta 版本**：P0 = 0, P1 ≤ 3
- **RC 版本**：P0 = 0, P1 = 0, P2 ≤ 5
- **正式版本**：P0 = 0, P1 = 0, P2 ≤ 2
