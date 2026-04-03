/**
 * RuleGo DSL → Flowgram WorkflowJSON（纯逻辑，不依赖 nodes/registry，便于单测）
 */

import { nanoid } from 'nanoid';

import type { RuleGoConnection, RuleGoDsl, RuleGoEndpoint, RuleGoNode } from '../types/dsl';
import type { RuleGoNodeRegistry } from '../types';

import { NodeTypeNotFoundError } from './dslErrors';

/** 与 WorkflowJSON 对齐 */
export interface WorkflowEdgeJson {
  sourceNodeID: string;
  targetNodeID: string;
  sourcePortID?: string | number;
  targetPortID?: string | number;
}

export interface WorkflowNodeJson {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  meta?: { position?: { x: number; y: number }; [key: string]: unknown };
  blocks?: WorkflowNodeJson[];
  edges?: WorkflowEdgeJson[];
}

export interface WorkflowJson {
  nodes: WorkflowNodeJson[];
  edges: WorkflowEdgeJson[];
}

function pickPosition(
  n: RuleGoNode | RuleGoEndpoint,
  gridIndex: number
): { x: number; y: number } {
  const p =
    (n as RuleGoNode).additionalInfo?.position ??
    (n as RuleGoEndpoint).additionalInfo?.position;
  if (p && typeof p.x === 'number' && typeof p.y === 'number') {
    return { x: p.x, y: p.y };
  }
  return {
    x: 120 + (gridIndex % 4) * 280,
    y: 120 + Math.floor(gridIndex / 4) * 180,
  };
}

function getBackendTypeForId(
  id: string,
  dslNodes: RuleGoNode[],
  eps: RuleGoEndpoint[]
): string | undefined {
  const n = dslNodes.find((x) => x.id === id);
  if (n) return n.type;
  const e = eps.find((x) => String(x.id) === id);
  return e?.type;
}

export type GetRegistryFn = (backendType: string) => RuleGoNodeRegistry | undefined;

function findWorkflowNodeById(list: WorkflowNodeJson[], id: string): WorkflowNodeJson | undefined {
  for (const n of list) {
    if (n.id === id) return n;
    if (n.blocks?.length) {
      const inner = findWorkflowNodeById(n.blocks, id);
      if (inner) return inner;
    }
  }
  return undefined;
}

function patchJoinExtraIncomingsOnWorkflowNodes(
  workflowNodes: WorkflowNodeJson[],
  dslNodes: RuleGoNode[],
  connections: RuleGoConnection[]
): void {
  const joinIds = new Set(dslNodes.filter((n) => n.type === 'join').map((n) => n.id));
  const incomingByJoin = new Map<string, string[]>();
  for (const c of connections) {
    if (c.type !== 'Success') continue;
    if (!joinIds.has(c.toId)) continue;
    const list = incomingByJoin.get(c.toId) ?? [];
    list.push(c.fromId);
    incomingByJoin.set(c.toId, list);
  }
  for (const [joinId, fromList] of incomingByJoin) {
    if (fromList.length <= 1) continue;
    const wn = findWorkflowNodeById(workflowNodes, joinId);
    if (wn) {
      wn.data = { ...(wn.data ?? {}), extraIncomings: fromList.slice(1) };
    }
  }
}

function patchForkBranchCountOnWorkflowNodes(
  workflowNodes: WorkflowNodeJson[],
  dslNodes: RuleGoNode[],
  connections: RuleGoConnection[]
): void {
  for (const n of dslNodes) {
    if (n.type !== 'fork') continue;
    const outgoing = connections.filter((c) => c.fromId === n.id && c.type === 'Success');
    const count = outgoing.length;
    if (count <= 0) continue;
    const wn = findWorkflowNodeById(workflowNodes, n.id);
    if (wn) {
      const bc = Math.max(1, Math.min(8, count));
      wn.data = { ...(wn.data ?? {}), branchCount: bc };
    }
  }
}

/**
 * 可注入注册表解析，便于单元测试（不加载 React 节点包）
 */
export function ruleGoDslToWorkflowJsonWithRegistry(
  dsl: RuleGoDsl,
  getRegistry: GetRegistryFn
): WorkflowJson {
  function getSourcePortId(fromBackendType: string, connType: string): string {
    const reg = getRegistry(fromBackendType);
    if (connType === 'True') return 'true';
    if (connType === 'False') return 'false';
    if (connType === 'Failure') return 'failure';
    if (connType === 'Default') return 'default';
    const caseM = /^Case(\d+)$/.exec(connType);
    if (caseM) return `case_${caseM[1]}`;
    if (!reg) return 'success';
    if (connType === 'Success') {
      if (reg.backendNodeType === 'startTrigger') return 'output';
      if (reg?.isEndpoint) return 'output';
      return 'success';
    }
    return 'success';
  }

  function orderChildrenChain(
    childIds: Set<string>,
    connections: RuleGoConnection[],
    startId: string
  ): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    let current: string | undefined = startId;

    while (current && childIds.has(current) && !visited.has(current)) {
      visited.add(current);
      order.push(current);
      const next = connections.find(
        (c) =>
          c.fromId === current &&
          c.type === 'Success' &&
          childIds.has(c.toId)
      );
      current = next?.toId;
    }

    for (const id of childIds) {
      if (!visited.has(id)) {
        order.push(id);
      }
    }
    return order;
  }

  function dslNodeToWorkflowNode(
    n: RuleGoNode,
    position: { x: number; y: number }
  ): WorkflowNodeJson {
    const reg = getRegistry(n.type);
    if (!reg) {
      throw new NodeTypeNotFoundError(`不支持的 DSL 节点类型: ${n.type}`);
    }
    const config = reg.deserializeConfiguration
      ? reg.deserializeConfiguration(n.configuration ?? {})
      : { ...(n.configuration ?? {}) };

    return {
      id: n.id,
      type: reg.type,
      meta: { position },
      data: {
        title: n.name,
        ...(typeof n.debugMode === 'boolean' ? { debugMode: n.debugMode } : {}),
        ...config,
      },
    };
  }

  function buildForLoopContainer(
    loop: RuleGoNode,
    allNodes: RuleGoNode[],
    connections: RuleGoConnection[],
    position: { x: number; y: number }
  ): WorkflowNodeJson {
    const reg = getRegistry(loop.type);
    if (!reg || reg.type !== 'for-loop') {
      return dslNodeToWorkflowNode(loop, position);
    }

    const childDsl = allNodes.filter(
      (x) =>
        x.additionalInfo &&
        (x.additionalInfo as { parentContainer?: string }).parentContainer === loop.id
    );
    const childIds = new Set(childDsl.map((c) => c.id));

    const doConn = connections.find((c) => c.fromId === loop.id && c.type === 'Do');
    const startFromConfig = String((loop.configuration as { do?: string })?.do ?? '').trim();
    const startId =
      (doConn && childIds.has(doConn.toId) ? doConn.toId : undefined) ||
      (startFromConfig && childIds.has(startFromConfig) ? startFromConfig : undefined) ||
      [...childIds][0];

    const orderedIds =
      startId && childIds.size > 0
        ? orderChildrenChain(childIds, connections, startId)
        : [...childIds];

    const bs = `bs_${nanoid(8)}`;
    const be = `be_${nanoid(8)}`;

    const childJsons = orderedIds.map((cid, idx) => {
      const dn = allNodes.find((x) => x.id === cid);
      if (!dn) {
        throw new Error(`容器子节点缺失: ${cid}`);
      }
      return dslNodeToWorkflowNode(dn, { x: 80 + idx * 40, y: 100 + idx * 24 });
    });

    const blocks: WorkflowNodeJson[] = [
      { id: bs, type: 'block-start', meta: { position: { x: 32, y: 72 } }, data: {} },
      ...childJsons,
      { id: be, type: 'block-end', meta: { position: { x: 32, y: 420 } }, data: {} },
    ];

    const internalEdges: WorkflowEdgeJson[] = [];

    if (childJsons.length > 0) {
      internalEdges.push({
        sourceNodeID: bs,
        targetNodeID: childJsons[0].id,
        sourcePortID: 'output',
        targetPortID: 'input',
      });
      for (let i = 0; i < childJsons.length - 1; i++) {
        internalEdges.push({
          sourceNodeID: childJsons[i].id,
          targetNodeID: childJsons[i + 1].id,
          sourcePortID: 'success',
          targetPortID: 'input',
        });
      }
      internalEdges.push({
        sourceNodeID: childJsons[childJsons.length - 1].id,
        targetNodeID: be,
        sourcePortID: 'success',
        targetPortID: 'input',
      });
    } else {
      internalEdges.push({
        sourceNodeID: bs,
        targetNodeID: be,
        sourcePortID: 'output',
        targetPortID: 'input',
      });
    }

    const base = dslNodeToWorkflowNode(loop, position);
    return {
      ...base,
      blocks,
      edges: internalEdges,
    };
  }

  function endpointToWorkflowNode(
    ep: RuleGoEndpoint,
    position: { x: number; y: number }
  ): WorkflowNodeJson {
    const reg = getRegistry(ep.type);
    if (!reg || !reg.deserializeEndpoint) {
      throw new NodeTypeNotFoundError(`不支持的 endpoint 类型: ${ep.type}`);
    }
    const raw = reg.deserializeEndpoint(ep as unknown as Record<string, unknown>) as {
      data?: Record<string, unknown>;
    };
    const data = raw.data ?? {};
    return {
      id: String(ep.id),
      type: reg.type,
      meta: { position },
      data: { ...data },
    };
  }

  const nodes = dsl.metadata?.nodes ?? [];
  const connections = dsl.metadata?.connections ?? [];
  const endpoints = dsl.metadata?.endpoints ?? [];

  const rootIds = new Set<string>();
  for (const n of nodes) {
    if (!(n.additionalInfo as { parentContainer?: string } | undefined)?.parentContainer) {
      rootIds.add(n.id);
    }
  }
  for (const ep of endpoints) {
    rootIds.add(String(ep.id));
  }

  const workflowNodes: WorkflowNodeJson[] = [];

  let gridIndex = 0;
  for (const ep of endpoints) {
    workflowNodes.push(endpointToWorkflowNode(ep, pickPosition(ep, gridIndex)));
    gridIndex += 1;
  }

  for (const n of nodes) {
    if ((n.additionalInfo as { parentContainer?: string } | undefined)?.parentContainer) {
      continue;
    }
    const pos = pickPosition(n, gridIndex);
    gridIndex += 1;
    const reg = getRegistry(n.type);
    if (reg?.meta?.isContainer && reg.type === 'for-loop') {
      workflowNodes.push(buildForLoopContainer(n, nodes, connections, pos));
    } else {
      workflowNodes.push(dslNodeToWorkflowNode(n, pos));
    }
  }

  patchJoinExtraIncomingsOnWorkflowNodes(workflowNodes, nodes, connections);
  patchForkBranchCountOnWorkflowNodes(workflowNodes, nodes, connections);

  const rootEdges: WorkflowEdgeJson[] = [];

  const joinSuccessEmitted = new Set<string>();
  const forkSuccessBranch = new Map<string, number>();

  for (const c of connections) {
    if (c.type === 'Do') continue;
    if (!rootIds.has(c.fromId) || !rootIds.has(c.toId)) continue;

    const fromType = getBackendTypeForId(c.fromId, nodes, endpoints);
    const toType = getBackendTypeForId(c.toId, nodes, endpoints);
    if (!fromType) continue;

    if (toType === 'join' && c.type === 'Success') {
      if (joinSuccessEmitted.has(c.toId)) continue;
      joinSuccessEmitted.add(c.toId);
    }

    let sourcePortID = getSourcePortId(fromType, c.type);
    if (fromType === 'fork' && c.type === 'Success') {
      const idx = forkSuccessBranch.get(c.fromId) ?? 0;
      forkSuccessBranch.set(c.fromId, idx + 1);
      sourcePortID = `branch_${idx}`;
    }

    let targetPortID: string | number = 'input';
    if (toType === 'join' && c.type === 'Failure') {
      targetPortID = 'failure';
    }

    rootEdges.push({
      sourceNodeID: c.fromId,
      targetNodeID: c.toId,
      sourcePortID,
      targetPortID,
    });
  }

  return { nodes: workflowNodes, edges: rootEdges };
}
