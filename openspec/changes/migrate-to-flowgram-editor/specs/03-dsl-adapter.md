# Spec: DSL 适配层

## 概述

定义 Flowgram 内部数据结构与 RuleGo DSL JSON 之间的双向转换逻辑，确保后端 API 和现有规则链 100% 兼容。

## RuleGo DSL 格式

### 完整结构

```json
{
  "ruleChain": {
    "id": "uuid-or-rule01",
    "name": "规则链名称",
    "debugMode": false,
    "root": true,
    "disabled": false,
    "configuration": {},
    "additionalInfo": {}
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      {
        "id": "node_id",
        "type": "backend_node_type",
        "name": "节点名称",
        "debugMode": false,
        "configuration": {
          // 节点特定配置
        },
        "additionalInfo": {
          "flowgramNodeType": "frontend_node_type",
          "position": { "x": 100, "y": 200 },
          "blockId": "legacy_blockly_id"
        }
      }
    ],
    "connections": [
      {
        "fromId": "from_node_id",
        "toId": "to_node_id",
        "type": "Success",
        "label": "optional_label"
      }
    ],
    "ruleChainConnections": [],
    "endpoints": [
      {
        "id": "endpoint_id",
        "type": "http",
        "configuration": {
          "path": "/api/webhook",
          "method": "POST",
          "routers": []
        },
        "additionalInfo": {
          "position": { "x": 50, "y": 50 }
        }
      }
    ]
  }
}
```

### 关键字段说明

**ruleChain**：
- `id`: 规则链 ID（UUID 或 rule01）
- `name`: 规则链名称
- `debugMode`: 是否开启调试模式
- `root`: 是否为根规则链（false 为子规则链）
- `disabled`: 是否停用（true 停用，false 或缺省为启用）

**metadata.nodes**：
- `id`: 节点唯一 ID（推荐 UUID）
- `type`: 后端节点类型（如 `for`, `ai/llm`, `x/fileRead`）
- `configuration`: 节点配置对象（节点特定）
- `additionalInfo.flowgramNodeType`: 前端节点类型（用于回载识别）

**metadata.connections**：
- `fromId`: 起始节点 ID
- `toId`: 目标节点 ID
- `type`: 连接类型（Success/Failure/Do/True/False/Case0/...）
- `label`: 可选标签（显示在连线上）

**metadata.endpoints**：
- 触发器类节点（`type` 以 `endpoint:` 开头的）单独存储
- 不参与 nodes 数组，但在 DSL 加载时需要创建对应节点

---

## 构建 DSL (Flowgram → RuleGo)

### buildRuleGoDsl 函数签名

```typescript
export function buildRuleGoDsl(
  ctx: EditorContext,
  ruleName: string,
  options: BuildDslOptions = {}
): string;

interface BuildDslOptions {
  ruleId?: string;
  debugMode?: boolean;
  root?: boolean;
  enabled?: boolean;
}
```

### 算法流程

```
1. 收集所有节点
   ├─ 遍历 ctx.nodeManager.getAllNodes()
   ├─ 区分容器节点 vs 普通节点
   ├─ 区分 endpoint 节点 vs 普通节点
   └─ 收集容器内的子节点

2. 序列化节点配置
   ├─ 获取 NodeRegistry
   ├─ 调用 registry.serializeConfiguration(node)
   ├─ 或使用默认序列化逻辑
   └─ 映射前端字段 → 后端字段

3. 收集所有连线
   ├─ 遍历 ctx.lineManager.getAllLines()
   ├─ 解析端口 → 节点 ID
   ├─ 调用 registry.getConnectionType(port) 获取类型
   └─ 生成 connection 对象

4. 处理容器节点特殊逻辑
   ├─ For Loop: 找到 Do 分支的第一个子节点
   ├─ GroupAction: 收集 nodeIds 数组
   └─ 生成对应的 connection 记录

5. 生成最终 JSON
   └─ 按 RuleGo DSL 格式组装
```

### 伪代码实现

```typescript
export function buildRuleGoDsl(
  ctx: EditorContext,
  ruleName: string,
  options: BuildDslOptions = {}
): string {
  const nodes: RuleGoNode[] = [];
  const connections: RuleGoConnection[] = [];
  const endpoints: RuleGoEndpoint[] = [];
  const processedNodes = new Set<string>();
  
  // ===== 第 1 步：收集所有节点 =====
  
  const allNodes = ctx.nodeManager.getAllNodes();
  
  allNodes.forEach(node => {
    if (processedNodes.has(node.id)) return;
    
    const registry = getNodeRegistry(node.type) as RuleGoNodeRegistry;
    if (!registry) {
      console.warn(`Unknown node type: ${node.type}`);
      return;
    }
    
    // 2a. Endpoint 节点（触发器类）
    if (registry.isEndpoint) {
      const epData = registry.serializeEndpoint
        ? registry.serializeEndpoint(node)
        : serializeDefaultEndpoint(node, registry);
      
      endpoints.push(epData);
      processedNodes.add(node.id);
      return;
    }
    
    // 2b. 容器内部节点（BlockStart/BlockEnd）跳过
    if (node.type === 'block-start' || node.type === 'block-end') {
      return;
    }
    
    // 2c. 普通节点
    const configuration = registry.serializeConfiguration
      ? registry.serializeConfiguration(node)
      : serializeDefaultConfiguration(node);
    
    nodes.push({
      id: node.id,
      type: registry.backendNodeType,
      name: node.data.title || registry.backendNodeType,
      debugMode: node.data.debugMode || false,
      configuration,
      additionalInfo: {
        flowgramNodeType: node.type,
        position: node.meta.position,
      },
    });
    
    processedNodes.add(node.id);
    
    // 2d. 容器节点的子节点
    if (registry.meta.isContainer && node.blocks?.length) {
      node.blocks.forEach(subNode => {
        if (subNode.type === 'block-start' || subNode.type === 'block-end') {
          return;
        }
        
        const subRegistry = getNodeRegistry(subNode.type) as RuleGoNodeRegistry;
        if (!subRegistry) return;
        
        const subConfig = subRegistry.serializeConfiguration
          ? subRegistry.serializeConfiguration(subNode as any)
          : {};
        
        nodes.push({
          id: subNode.id,
          type: subRegistry.backendNodeType,
          name: subNode.data?.title || subRegistry.backendNodeType,
          debugMode: false,
          configuration: subConfig,
          additionalInfo: {
            flowgramNodeType: subNode.type,
            parentContainer: node.id,
          },
        });
        
        processedNodes.add(subNode.id);
      });
    }
  });
  
  // ===== 第 2 步：收集连线 =====
  
  const allLines = ctx.lineManager.getAllLines();
  
  allLines.forEach(line => {
    const fromPort = ctx.portManager.getPortById(line.fromPortID);
    const toPort = ctx.portManager.getPortById(line.toPortID);
    
    if (!fromPort || !toPort) return;
    
    const fromNode = ctx.nodeManager.getNodeById(fromPort.nodeID);
    const toNode = ctx.nodeManager.getNodeById(toPort.nodeID);
    
    if (!fromNode || !toNode) return;
    
    // 跳过内部节点的连线（容器会单独处理）
    if (fromNode.type === 'block-start' || toNode.type === 'block-end') {
      return;
    }
    
    const registry = getNodeRegistry(fromNode.type) as RuleGoNodeRegistry;
    const connectionType = registry.getConnectionType
      ? registry.getConnectionType(fromPort, fromNode)
      : 'Success';
    
    connections.push({
      fromId: fromNode.id,
      toId: toNode.id,
      type: connectionType,
    });
  });
  
  // ===== 第 3 步：处理容器节点的 Do 分支 =====
  
  allNodes
    .filter(n => {
      const reg = getNodeRegistry(n.type);
      return reg?.meta.isContainer;
    })
    .forEach(containerNode => {
      // For Loop: 找到 Do 端口连接的第一个子节点
      if (containerNode.type === 'for-loop') {
        const doPort = containerNode.getAllPorts().find(p => p.portID === 'do');
        if (!doPort) return;
        
        const doLines = ctx.lineManager.getLinesFromPort(doPort.id);
        if (doLines.length === 0) return;
        
        const firstLine = doLines[0];
        const toPort = ctx.portManager.getPortById(firstLine.toPortID);
        if (!toPort) return;
        
        connections.push({
          fromId: containerNode.id,
          toId: toPort.nodeID,
          type: 'Do',
        });
      }
      
      // GroupAction: 收集所有分支节点
      if (containerNode.type === 'group-action') {
        const nodeIds = containerNode.data.nodeIds || [];
        nodeIds.forEach(nodeId => {
          connections.push({
            fromId: containerNode.id,
            toId: nodeId,
            type: 'Success',  // GroupAction 的分支都是 Success
          });
        });
      }
    });
  
  // ===== 第 4 步：生成最终 DSL =====
  
  const dsl = {
    ruleChain: {
      id: options.ruleId || 'rule01',
      name: ruleName,
      debugMode: options.debugMode || false,
      root: options.root !== false,
      disabled: !(options.enabled !== false),
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
```

---

## 加载 DSL (RuleGo → Flowgram)

### loadRuleGoDsl 函数签名

```typescript
export function loadRuleGoDsl(
  dslJson: RuleGoDsl,
  ctx: EditorContext
): void;

interface RuleGoDsl {
  ruleChain: {
    id: string;
    name: string;
    debugMode?: boolean;
    root?: boolean;
    disabled?: boolean;
  };
  metadata: {
    nodes: RuleGoNode[];
    connections: RuleGoConnection[];
    endpoints?: RuleGoEndpoint[];
    ruleChainConnections: any[];
  };
}
```

### 算法流程

```
1. 清空画布
   └─ ctx.nodeManager.clear()

2. 创建 Endpoint 节点
   ├─ 遍历 metadata.endpoints
   ├─ 查找对应的 NodeRegistry
   └─ 调用 registry.deserializeEndpoint

3. 创建普通节点
   ├─ 遍历 metadata.nodes
   ├─ 查找对应的 NodeRegistry (by backendNodeType)
   ├─ 调用 registry.deserializeConfiguration
   ├─ 创建 Flowgram 节点
   └─ 如果是容器节点，创建 BlockStart/BlockEnd

4. 建立连线
   ├─ 遍历 metadata.connections
   ├─ 区分普通连线 vs Do 分支连线
   ├─ 普通连线：找端口 → 创建 Line
   └─ Do 连线：将目标节点放入容器 blocks

5. 处理特殊节点
   ├─ Join: 收集多个输入连线到 extraIncomings
   ├─ Fork: 设置分支数量
   └─ Switch: 设置 case 数量
```

### 伪代码实现

```typescript
export function loadRuleGoDsl(
  dslJson: RuleGoDsl,
  ctx: EditorContext
): void {
  if (!dslJson?.metadata) {
    throw new InvalidDslFormatError('Missing metadata');
  }
  
  const { nodes = [], connections = [], endpoints = [] } = dslJson.metadata;
  
  // ===== 第 1 步：清空画布 =====
  
  ctx.nodeManager.clear();
  const nodeIdMap = new Map<string, FlowNodeEntity>();
  
  // ===== 第 2 步：创建 Endpoint 节点 =====
  
  endpoints.forEach(epData => {
    const registry = getNodeRegistryByBackendType(epData.type);
    if (!registry || !registry.isEndpoint) {
      console.warn(`Unknown endpoint type: ${epData.type}`);
      return;
    }
    
    const nodeData = registry.deserializeEndpoint
      ? registry.deserializeEndpoint(epData)
      : { ...epData.configuration };
    
    const node = ctx.nodeManager.addNode({
      id: epData.id || `ep_${nanoid(5)}`,
      type: registry.type,
      data: {
        title: epData.type,
        ...nodeData,
      },
      meta: {
        position: epData.additionalInfo?.position || { x: 50, y: 50 },
      },
    });
    
    nodeIdMap.set(epData.id, node);
  });
  
  // ===== 第 3 步：创建普通节点 =====
  
  // 3a. 先创建所有非容器子节点
  nodes.forEach(nodeData => {
    // 跳过容器内部节点（后面单独处理）
    if (nodeData.additionalInfo?.parentContainer) {
      return;
    }
    
    const registry = getNodeRegistryByBackendType(nodeData.type);
    if (!registry) {
      throw new NodeTypeNotFoundError(`Unsupported node type: ${nodeData.type}`);
    }
    
    // 反序列化配置
    const config = registry.deserializeConfiguration
      ? registry.deserializeConfiguration(nodeData.configuration || {})
      : { ...nodeData.configuration };
    
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
    
    // 容器节点需要初始化 blocks
    if (registry.meta.isContainer) {
      nodeConfig.blocks = [
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
      ];
    }
    
    const node = ctx.nodeManager.addNode(nodeConfig);
    nodeIdMap.set(nodeData.id, node);
  });
  
  // 3b. 创建容器内的子节点
  nodes
    .filter(n => n.additionalInfo?.parentContainer)
    .forEach(subNodeData => {
      const containerId = subNodeData.additionalInfo.parentContainer;
      const containerNode = nodeIdMap.get(containerId);
      
      if (!containerNode || !containerNode.blocks) {
        console.warn(`Container node not found: ${containerId}`);
        return;
      }
      
      const registry = getNodeRegistryByBackendType(subNodeData.type);
      if (!registry) return;
      
      const config = registry.deserializeConfiguration
        ? registry.deserializeConfiguration(subNodeData.configuration || {})
        : {};
      
      // 子节点需要特殊创建方式（在容器内）
      const subNode = createSubNode(ctx, containerNode, {
        id: subNodeData.id,
        type: registry.type,
        data: {
          title: subNodeData.name,
          ...config,
        },
      });
      
      nodeIdMap.set(subNodeData.id, subNode);
    });
  
  // ===== 第 4 步：建立连线 =====
  
  // 4a. 普通连线
  connections
    .filter(conn => conn.type !== 'Do')
    .forEach(conn => {
      const fromNode = nodeIdMap.get(conn.fromId);
      const toNode = nodeIdMap.get(conn.toId);
      
      if (!fromNode || !toNode) {
        console.warn(`Connection references missing nodes: ${conn.fromId} → ${conn.toId}`);
        return;
      }
      
      // 找到对应的端口
      const fromPort = findOutputPortByConnectionType(fromNode, conn.type);
      const toPort = findInputPort(toNode);
      
      if (!fromPort || !toPort) {
        console.warn(`Ports not found for connection: ${conn.type}`);
        return;
      }
      
      // 特殊处理：Join 节点的多输入
      if (toNode.type === 'join' && toPort.isConnected) {
        // 已经有一条入线，将额外的输入保存到 extraIncomings
        const existing = toNode.data.extraIncomings || [];
        toNode.data.extraIncomings = [...existing, conn.fromId];
        return;
      }
      
      // 创建连线
      ctx.lineManager.addLine({
        fromPortID: fromPort.id,
        toPortID: toPort.id,
      });
    });
  
  // 4b. Do 分支连线（容器节点）
  connections
    .filter(conn => conn.type === 'Do')
    .forEach(conn => {
      const containerNode = nodeIdMap.get(conn.fromId);
      const firstSubNode = nodeIdMap.get(conn.toId);
      
      if (!containerNode || !firstSubNode) return;
      
      if (containerNode.blocks) {
        // 找到 BlockStart
        const blockStart = containerNode.blocks.find(b => b.type === 'block-start');
        if (blockStart) {
          // 在容器内创建 BlockStart → firstSubNode 的连线
          const blockStartPorts = blockStart.getAllPorts?.();
          const firstSubPorts = firstSubNode.getAllPorts?.();
          
          if (blockStartPorts && firstSubPorts) {
            const startOutput = blockStartPorts.find(p => p.type === 'output');
            const subInput = firstSubPorts.find(p => p.type === 'input');
            
            if (startOutput && subInput) {
              ctx.lineManager.addLine({
                fromPortID: startOutput.id,
                toPortID: subInput.id,
              });
            }
          }
        }
      }
    });
  
  // ===== 第 5 步：后处理特殊节点 =====
  
  // Fork: 根据连线数量设置分支数
  nodes
    .filter(n => n.type === 'fork')
    .forEach(forkNodeData => {
      const forkNode = nodeIdMap.get(forkNodeData.id);
      if (!forkNode) return;
      
      const outgoingConns = connections.filter(c => 
        c.fromId === forkNodeData.id && c.type === 'Success'
      );
      
      forkNode.data.branchCount = Math.max(1, Math.min(8, outgoingConns.length));
    });
  
  // Switch: 根据 cases 设置分支数
  nodes
    .filter(n => n.type === 'switch')
    .forEach(switchNodeData => {
      const switchNode = nodeIdMap.get(switchNodeData.id);
      if (!switchNode || !switchNode.data.cases) return;
      
      // cases 数量已在 deserializeConfiguration 中设置
      // 这里只需确保端口数量匹配
      const registry = getNodeRegistry(switchNode.type);
      if (registry?.meta.getPortsConfig) {
        // 触发端口重新生成
        switchNode.meta.ports = registry.meta.getPortsConfig(switchNode);
      }
    });
}
```

---

## 辅助函数规格

### findOutputPortByConnectionType

```typescript
/**
 * 根据连接类型找到对应的输出端口
 */
export function findOutputPortByConnectionType(
  node: FlowNodeEntity,
  connectionType: string
): PortEntity | undefined {
  const ports = node.getAllPorts?.() || [];
  
  // 映射连接类型 → 端口 ID
  const portMapping: Record<string, string> = {
    'Success': 'output',
    'Failure': 'failure',
    'Do': 'do',
    'True': 'true',
    'False': 'false',
    'Case0': 'case_0',
    'Case1': 'case_1',
    'Case2': 'case_2',
    // ... 可扩展
  };
  
  const portId = portMapping[connectionType] || 'output';
  
  return ports.find(p => 
    p.type === 'output' && p.portID === portId
  );
}
```

### findInputPort

```typescript
/**
 * 找到节点的输入端口（通常只有一个）
 */
export function findInputPort(
  node: FlowNodeEntity
): PortEntity | undefined {
  const ports = node.getAllPorts?.() || [];
  return ports.find(p => p.type === 'input');
}
```

### serializeDefaultConfiguration

```typescript
/**
 * 默认的配置序列化（当节点没有自定义序列化时）
 */
export function serializeDefaultConfiguration(
  node: FlowNodeEntity
): Record<string, unknown> {
  const { title, debugMode, ...rest } = node.data;
  
  // 移除前端特有字段
  const filtered = { ...rest };
  delete filtered.status;          // 运行时状态
  delete filtered.form;             // 表单实例
  delete filtered._internal;        // 内部字段
  
  return filtered;
}
```

### wouldCreateCycle

```typescript
/**
 * 检查添加连线是否会形成环路
 */
export function wouldCreateCycle(
  ctx: EditorContext,
  fromNodeId: string,
  toNodeId: string
): boolean {
  // BFS 从 toNode 开始，看能否到达 fromNode
  const queue = [toNodeId];
  const visited = new Set<string>();
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current === fromNodeId) {
      return true;  // 会形成环路
    }
    
    if (visited.has(current)) continue;
    visited.add(current);
    
    // 获取所有出线
    const currentNode = ctx.nodeManager.getNodeById(current);
    if (!currentNode) continue;
    
    const outPorts = currentNode.getAllPorts?.().filter(p => p.type === 'output') || [];
    outPorts.forEach(port => {
      const lines = ctx.lineManager.getLinesFromPort(port.id);
      lines.forEach(line => {
        const toPort = ctx.portManager.getPortById(line.toPortID);
        if (toPort) {
          queue.push(toPort.nodeID);
        }
      });
    });
  }
  
  return false;
}
```

---

## 容器节点特殊处理

### For Loop 的 Do 分支

**Blockly 表示**：
```
For 块
├─ branch_do (statementInput)
│   └─ 第一个子块
│       └─ 第二个子块
│           └─ ...
└─ branch_failure (statementInput)
```

**RuleGo DSL 表示**：
```json
{
  "nodes": [
    { "id": "for1", "type": "for", "configuration": { "do": "sub1" } },
    { "id": "sub1", "type": "llm" },
    { "id": "sub2", "type": "jsTransform" }
  ],
  "connections": [
    { "fromId": "for1", "toId": "sub1", "type": "Do" },
    { "fromId": "sub1", "toId": "sub2", "type": "Success" }
  ]
}
```

**Flowgram 表示**：
```typescript
{
  id: 'for1',
  type: 'for-loop',
  blocks: [
    { id: 'block_start', type: 'block-start' },
    { id: 'sub1', type: 'llm' },  // Do 分支的第一个节点
    { id: 'block_end', type: 'block-end' },
  ],
}

// 连线：
// block_start → sub1 (容器内部连线)
// sub1 → sub2 (容器内部连线)
// for1 (Do端口) → sub1 (DSL 层面的连线，不在 Flowgram 内部显示)
```

**转换逻辑**：

```typescript
// 保存时：Flowgram → DSL
function serializeForLoop(loopNode: FlowNodeEntity): {
  nodes: RuleGoNode[];
  connections: RuleGoConnection[];
} {
  const nodes: RuleGoNode[] = [
    {
      id: loopNode.id,
      type: 'for',
      configuration: {
        range: loopNode.data.range,
        do: findFirstSubNodeId(loopNode),  // 关键：找到 Do 分支的第一个节点
        mode: loopNode.data.mode,
      },
    },
  ];
  
  const connections: RuleGoConnection[] = [];
  
  // 收集容器内的子节点
  if (loopNode.blocks) {
    loopNode.blocks.forEach(subNode => {
      if (subNode.type === 'block-start' || subNode.type === 'block-end') {
        return;
      }
      
      const subRegistry = getNodeRegistry(subNode.type);
      const subConfig = subRegistry?.serializeConfiguration?.(subNode) || {};
      
      nodes.push({
        id: subNode.id,
        type: subRegistry.backendNodeType,
        name: subNode.data.title,
        configuration: subConfig,
        additionalInfo: {
          parentContainer: loopNode.id,
        },
      });
    });
    
    // 收集容器内的连线
    const internalLines = getInternalLines(ctx, loopNode);
    internalLines.forEach(line => {
      const fromPort = ctx.portManager.getPortById(line.fromPortID);
      const toPort = ctx.portManager.getPortById(line.toPortID);
      
      if (fromPort?.nodeID === 'block_start') {
        // BlockStart → 第一个子节点，生成 Do 连接
        connections.push({
          fromId: loopNode.id,
          toId: toPort.nodeID,
          type: 'Do',
        });
      } else {
        // 子节点之间的连线
        connections.push({
          fromId: fromPort.nodeID,
          toId: toPort.nodeID,
          type: 'Success',
        });
      }
    });
  }
  
  return { nodes, connections };
}

// 加载时：DSL → Flowgram
function deserializeForLoop(
  loopNodeData: RuleGoNode,
  allNodes: RuleGoNode[],
  connections: RuleGoConnection[],
  ctx: EditorContext
): void {
  // 1. 创建 Loop 容器节点
  const loopNode = ctx.nodeManager.addNode({
    id: loopNodeData.id,
    type: 'for-loop',
    data: {
      title: loopNodeData.name,
      range: loopNodeData.configuration.range,
      mode: loopNodeData.configuration.mode,
    },
    blocks: [
      { id: 'block_start', type: 'block-start' },
      { id: 'block_end', type: 'block-end' },
    ],
  });
  
  // 2. 找到 Do 连接的第一个子节点
  const doConnection = connections.find(c => 
    c.fromId === loopNodeData.id && c.type === 'Do'
  );
  
  if (!doConnection) return;
  
  // 3. 找到所有应该在容器内的子节点
  const subNodeIds = findAllNodesInDoChain(doConnection.toId, allNodes, connections);
  
  // 4. 将子节点添加到容器
  subNodeIds.forEach(subId => {
    const subNodeData = allNodes.find(n => n.id === subId);
    if (!subNodeData) return;
    
    const subNode = createSubNodeInContainer(ctx, loopNode, subNodeData);
    
    // 在容器内建立连线
    // BlockStart → 第一个子节点
    // 子节点之间的连线
  });
}
```

---

## 连接类型映射

### 标准连接类型

```typescript
export enum ConnectionType {
  Success = 'Success',      // 成功分支（默认）
  Failure = 'Failure',      // 失败分支
  Do = 'Do',                // 循环体
  True = 'True',            // 条件为真
  False = 'False',          // 条件为假
  Default = 'Default',      // 默认分支
}
```

### 动态连接类型

**Switch 节点**：
- `Case0`, `Case1`, `Case2`, ... (根据 case 数量)
- `Default`

**Fork 节点**：
- 所有分支都是 `Success`（后端通过顺序区分）

**GroupAction 节点**：
- 所有分支都是 `Success`（后端通过 nodeIds 数组区分）

### 端口 ID 与连接类型映射

```typescript
export const PORT_ID_TO_CONNECTION_TYPE: Record<string, string> = {
  'output': 'Success',
  'failure': 'Failure',
  'do': 'Do',
  'true': 'True',
  'false': 'False',
  'case_0': 'Case0',
  'case_1': 'Case1',
  'case_2': 'Case2',
  'case_3': 'Case3',
  'case_4': 'Case4',
  'case_5': 'Case5',
  'case_6': 'Case6',
  'case_7': 'Case7',
  'default': 'Default',
};

export const CONNECTION_TYPE_TO_PORT_ID = Object.fromEntries(
  Object.entries(PORT_ID_TO_CONNECTION_TYPE).map(([k, v]) => [v, k])
);
```

---

## 数据验证

### DSL 格式验证

```typescript
export function validateRuleGoDsl(dsl: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // 检查必需字段
  if (!dsl) {
    errors.push('DSL 不能为空');
    return { valid: false, errors };
  }
  
  if (!dsl.ruleChain) {
    errors.push('缺少 ruleChain 字段');
  } else {
    if (!dsl.ruleChain.id) errors.push('ruleChain.id 不能为空');
    if (!dsl.ruleChain.name) errors.push('ruleChain.name 不能为空');
  }
  
  if (!dsl.metadata) {
    errors.push('缺少 metadata 字段');
  } else {
    if (!Array.isArray(dsl.metadata.nodes)) {
      errors.push('metadata.nodes 必须是数组');
    }
    if (!Array.isArray(dsl.metadata.connections)) {
      errors.push('metadata.connections 必须是数组');
    }
  }
  
  // 检查节点引用完整性
  if (Array.isArray(dsl.metadata?.nodes) && Array.isArray(dsl.metadata?.connections)) {
    const nodeIds = new Set(dsl.metadata.nodes.map(n => n.id));
    
    dsl.metadata.connections.forEach((conn, idx) => {
      if (!nodeIds.has(conn.fromId)) {
        errors.push(`Connection[${idx}] 引用了不存在的节点: ${conn.fromId}`);
      }
      if (!nodeIds.has(conn.toId)) {
        errors.push(`Connection[${idx}] 引用了不存在的节点: ${conn.toId}`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### 触发器布局验证

```typescript
/**
 * 验证规则链至少有一个触发器
 */
export function validateTriggerLayout(ctx: EditorContext): string | null {
  const allNodes = ctx.nodeManager.getAllNodes();
  
  const hasTrigger = allNodes.some(node => {
    const registry = getNodeRegistry(node.type) as RuleGoNodeRegistry;
    return registry?.category === 'trigger';
  });
  
  if (!hasTrigger) {
    return '规则链必须至少包含一个触发器节点（手动触发或 Endpoint 触发）';
  }
  
  return null;
}
```

---

## 错误类型定义

```typescript
// dsl/errors.ts

export class DslAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DslAdapterError';
  }
}

export class NodeTypeNotFoundError extends DslAdapterError {
  constructor(public nodeType: string) {
    super(`Unsupported node type: ${nodeType}`);
    this.name = 'NodeTypeNotFoundError';
  }
}

export class InvalidDslFormatError extends DslAdapterError {
  constructor(message: string) {
    super(`Invalid DSL format: ${message}`);
    this.name = 'InvalidDslFormatError';
  }
}

export class ConnectionError extends DslAdapterError {
  constructor(
    public fromId: string,
    public toId: string,
    message: string
  ) {
    super(`Connection error (${fromId} → ${toId}): ${message}`);
    this.name = 'ConnectionError';
  }
}
```

---

## 测试用例

### DSL 构建测试

```typescript
describe('buildRuleGoDsl', () => {
  it('should build simple linear flow', () => {
    const ctx = createTestEditor();
    
    const start = addNode(ctx, { type: 'start-trigger' });
    const api = addNode(ctx, { type: 'rest-api-call', data: { url: 'https://api.example.com' } });
    connectNodes(ctx, start, api);
    
    const dsl = buildRuleGoDsl(ctx, 'test');
    const parsed = JSON.parse(dsl);
    
    expect(parsed.metadata.nodes).toHaveLength(2);
    expect(parsed.metadata.nodes[1].type).toBe('restApiCall');
    expect(parsed.metadata.nodes[1].configuration.url).toBe('https://api.example.com');
    
    expect(parsed.metadata.connections).toHaveLength(1);
    expect(parsed.metadata.connections[0].type).toBe('Success');
  });
  
  it('should handle for-loop container', () => {
    const ctx = createTestEditor();
    
    const loop = addNode(ctx, {
      type: 'for-loop',
      data: { range: '1..5', mode: 1 },
    });
    
    const llm = addNodeToContainer(ctx, loop, {
      type: 'llm',
      data: { model: 'gpt-4' },
    });
    
    const dsl = buildRuleGoDsl(ctx, 'test');
    const parsed = JSON.parse(dsl);
    
    // 应该有 2 个节点
    expect(parsed.metadata.nodes).toHaveLength(2);
    
    // Loop 节点的 configuration.do 应指向子节点
    const loopNode = parsed.metadata.nodes.find(n => n.id === loop.id);
    expect(loopNode.configuration.do).toBe(llm.id);
    
    // 应该有一条 Do 连接
    const doConn = parsed.metadata.connections.find(c => c.type === 'Do');
    expect(doConn).toBeDefined();
    expect(doConn.fromId).toBe(loop.id);
    expect(doConn.toId).toBe(llm.id);
  });
  
  it('should handle switch multi-branch', () => {
    const ctx = createTestEditor();
    
    const sw = addNode(ctx, {
      type: 'switch',
      data: {
        cases: [
          { expression: 'value > 10' },
          { expression: 'value > 5' },
        ],
      },
    });
    
    const node1 = addNode(ctx, { type: 'llm' });
    const node2 = addNode(ctx, { type: 'delay' });
    const nodeDef = addNode(ctx, { type: 'rest-api-call' });
    
    // 连接各分支
    connectNodes(ctx, sw, node1, 'case_0');
    connectNodes(ctx, sw, node2, 'case_1');
    connectNodes(ctx, sw, nodeDef, 'default');
    
    const dsl = buildRuleGoDsl(ctx, 'test');
    const parsed = JSON.parse(dsl);
    
    // 应该有 4 条连接（3 个 Case + 1 个 Default）
    const switchConns = parsed.metadata.connections.filter(c => c.fromId === sw.id);
    expect(switchConns).toHaveLength(3);
    
    expect(switchConns.some(c => c.type === 'Case0')).toBe(true);
    expect(switchConns.some(c => c.type === 'Case1')).toBe(true);
    expect(switchConns.some(c => c.type === 'Default')).toBe(true);
  });
});
```

### DSL 加载测试

```typescript
describe('loadRuleGoDsl', () => {
  it('should load and restore nodes', () => {
    const dsl = {
      ruleChain: { id: 'test', name: 'Test' },
      metadata: {
        nodes: [
          { id: 'n1', type: 'startTrigger', name: 'Start', configuration: {} },
          { id: 'n2', type: 'for', name: 'Loop', configuration: { range: '1..3', do: 'n3', mode: 0 } },
          { id: 'n3', type: 'ai/llm', name: 'LLM', configuration: { model: 'gpt-4' } },
        ],
        connections: [
          { fromId: 'n1', toId: 'n2', type: 'Success' },
          { fromId: 'n2', toId: 'n3', type: 'Do' },
        ],
      },
    };
    
    const ctx = createTestEditor();
    loadRuleGoDsl(dsl, ctx);
    
    // 验证节点数量
    expect(ctx.nodeManager.getAllNodes()).toHaveLength(2);  // start + for（n3 在容器内）
    
    // 验证 Loop 容器
    const loopNode = ctx.nodeManager.getNodeById('n2');
    expect(loopNode.type).toBe('for-loop');
    expect(loopNode.blocks).toBeDefined();
    expect(loopNode.blocks.length).toBeGreaterThan(2);  // BlockStart + n3 + BlockEnd
    
    // 验证连线
    const lines = ctx.lineManager.getAllLines();
    expect(lines.length).toBeGreaterThan(0);
  });
  
  it('should handle endpoints', () => {
    const dsl = {
      ruleChain: { id: 'test', name: 'Test' },
      metadata: {
        nodes: [
          { id: 'n1', type: 'ai/llm', name: 'LLM', configuration: {} },
        ],
        endpoints: [
          { id: 'ep1', type: 'http', configuration: { path: '/webhook', method: 'POST' } },
        ],
        connections: [
          { fromId: 'ep1', toId: 'n1', type: 'Success' },
        ],
      },
    };
    
    const ctx = createTestEditor();
    loadRuleGoDsl(dsl, ctx);
    
    // 应该创建 endpoint 节点
    const epNode = ctx.nodeManager.getNodeById('ep1');
    expect(epNode).toBeDefined();
    expect(epNode.type).toBe('http-trigger');
    
    // 应该有连线
    const lines = ctx.lineManager.getAllLines();
    expect(lines).toHaveLength(1);
  });
});
```

### Round-trip 测试

```typescript
describe('DSL Round-trip', () => {
  const testCases = [
    'simple-linear-flow',
    'for-loop-with-sub-nodes',
    'switch-multi-branch',
    'fork-join-parallel',
    'nested-containers',  // 未来支持
    'complex-workflow',
  ];
  
  testCases.forEach(caseName => {
    it(`should maintain integrity: ${caseName}`, () => {
      const originalDsl = loadSampleDsl(`${caseName}.json`);
      
      // Load
      const ctx = createTestEditor();
      loadRuleGoDsl(originalDsl, ctx);
      
      // Build
      const rebuiltDslStr = buildRuleGoDsl(ctx, originalDsl.ruleChain.name, {
        ruleId: originalDsl.ruleChain.id,
        debugMode: originalDsl.ruleChain.debugMode,
        root: originalDsl.ruleChain.root,
        enabled: !originalDsl.ruleChain.disabled,
      });
      
      const rebuiltDsl = JSON.parse(rebuiltDslStr);
      
      // Compare (ignore additionalInfo differences)
      const normalized = (dsl: any) => {
        const copy = JSON.parse(JSON.stringify(dsl));
        // 移除 additionalInfo 中的前端特有字段
        copy.metadata.nodes.forEach(n => {
          if (n.additionalInfo) {
            delete n.additionalInfo.flowgramNodeType;
            delete n.additionalInfo.blockId;
          }
        });
        return copy;
      };
      
      expect(normalized(rebuiltDsl)).toEqual(normalized(originalDsl));
    });
  });
});
```

---

## 性能优化

### 1. DSL 构建节流

```typescript
// 避免频繁构建 DSL
const debouncedBuildDsl = debounce((ctx: EditorContext) => {
  const dsl = buildRuleGoDsl(ctx, ruleName, options);
  setCurrentDsl(dsl);
}, 1000);

// 在 onContentChange 中调用
editorProps.onContentChange = (ctx, event) => {
  debouncedBuildDsl(ctx);
};
```

### 2. 缓存节点注册表查找

```typescript
const registryCache = new Map<string, RuleGoNodeRegistry>();

export function getNodeRegistry(type: string): RuleGoNodeRegistry | undefined {
  if (registryCache.has(type)) {
    return registryCache.get(type);
  }
  
  const registry = rulegoNodeRegistries.find(r => r.type === type);
  if (registry) {
    registryCache.set(type, registry);
  }
  
  return registry;
}
```

### 3. 增量 DSL 更新

```typescript
// 只在必要时完整构建 DSL
// 大部分情况下只更新变化的部分

interface DslUpdateEvent {
  type: 'node-added' | 'node-updated' | 'node-removed' | 'line-added' | 'line-removed';
  data: any;
}

function incrementalUpdateDsl(
  currentDsl: RuleGoDsl,
  event: DslUpdateEvent
): RuleGoDsl {
  switch (event.type) {
    case 'node-added':
      return {
        ...currentDsl,
        metadata: {
          ...currentDsl.metadata,
          nodes: [...currentDsl.metadata.nodes, serializeNode(event.data.node)],
        },
      };
    
    case 'line-added':
      return {
        ...currentDsl,
        metadata: {
          ...currentDsl.metadata,
          connections: [...currentDsl.metadata.connections, serializeConnection(event.data.line)],
        },
      };
    
    // ... 其他事件类型
  }
}
```

---

## 验收标准

- [ ] buildRuleGoDsl 函数实现并通过所有测试
- [ ] loadRuleGoDsl 函数实现并通过所有测试
- [ ] 所有 33 个节点类型都能正确序列化/反序列化
- [ ] 容器节点（For/GroupAction）的特殊逻辑正确
- [ ] 多分支节点（Switch/Fork）的动态端口正确
- [ ] Round-trip 测试覆盖所有典型场景
- [ ] 性能测试达标（100 节点 < 100ms）
- [ ] 错误处理完善，所有边界情况都有测试
- [ ] 代码 review 通过
