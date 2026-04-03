/**
 * buildRuleGoDsl 纯逻辑（可注入 getRegistry，供单测）
 */

import type { RuleGoNodeRegistry } from '../types';
import type { BuildDslOptions, RuleGoConnection, RuleGoDsl, RuleGoEndpoint, RuleGoNode } from '../types/dsl';

import { ConnectionError } from './dslErrors';

interface WorkflowNodeJson {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  meta?: { position?: { x: number; y: number }; [key: string]: unknown };
  blocks?: WorkflowNodeJson[];
  edges?: WorkflowEdgeJson[];
}

interface WorkflowEdgeJson {
  sourceNodeID: string;
  targetNodeID: string;
  sourcePortID?: string | number;
  targetPortID?: string | number;
}

function isInternalBlockType(t: string): boolean {
  return t === 'block-start' || t === 'block-end';
}

function walkAllWorkflowNodes(list: WorkflowNodeJson[], visit: (n: WorkflowNodeJson) => void): void {
  for (const n of list) {
    visit(n);
    if (n.blocks?.length) walkAllWorkflowNodes(n.blocks, visit);
  }
}

/** Join：除首条入线外，其余 Success 来源记在 data.extraIncomings，在此补成 metadata.connections */
function appendJoinConnectionsFromExtraIncomings(
  nodesJson: WorkflowNodeJson[],
  connections: RuleGoConnection[]
): void {
  walkAllWorkflowNodes(nodesJson, (n) => {
    if (n.type !== 'join') return;
    const extra = (n.data as Record<string, unknown>)?.extraIncomings;
    if (!Array.isArray(extra)) return;
    for (const fromId of extra) {
      const fid = String(fromId);
      const dup = connections.some(
        (x) => x.fromId === fid && x.toId === n.id && x.type === 'Success'
      );
      if (dup) continue;
      connections.push({
        fromId: fid,
        toId: n.id,
        type: 'Success',
      });
    }
  });
}

function indexNodeTypes(nodes: WorkflowNodeJson[], out: Map<string, string>): void {
  for (const n of nodes) {
    out.set(n.id, n.type);
    if (n.blocks?.length) {
      indexNodeTypes(n.blocks, out);
    }
  }
}

function inferDoTarget(container: WorkflowNodeJson): string | undefined {
  const blocks = container.blocks ?? [];
  const edges = container.edges ?? [];
  const byId = new Map(blocks.map((b) => [b.id, b]));

  for (const e of edges) {
    const src = byId.get(e.sourceNodeID);
    if (src?.type === 'block-start') {
      return e.targetNodeID;
    }
  }
  for (const b of blocks) {
    if (!isInternalBlockType(b.type)) {
      return b.id;
    }
  }
  return undefined;
}

export type GetNodeRegistryFn = (frontendType: string) => RuleGoNodeRegistry | undefined;

/**
 * Fork 多条出边在 DSL 中均为 Success，DSL→Workflow 时按 connections 顺序分配 branch_0、branch_1…
 * Switch 出边为 CaseN/Default/Failure，按 case_N → default → failure 排序，使导出顺序稳定、与端口语义一致。
 */
function forkEdgeSortKey(edge: WorkflowEdgeJson): number {
  const p = String(edge.sourcePortID ?? '');
  if (p === 'failure') return 1_000_000;
  const m = /^branch_(\d+)$/.exec(p);
  return m ? parseInt(m[1], 10) : 0;
}

function switchEdgeSortKey(edge: WorkflowEdgeJson): number {
  const p = String(edge.sourcePortID ?? '');
  if (p === 'failure') return 1_000_000;
  if (p === 'default') return 100_000;
  const m = /^case_(\d+)$/.exec(p);
  return m ? parseInt(m[1], 10) : 0;
}

function sortWorkflowEdgesForForkAndSwitch(
  edges: WorkflowEdgeJson[],
  typeIndex: Map<string, string>,
  getRegistry: GetNodeRegistryFn
): WorkflowEdgeJson[] {
  if (edges.length <= 1) return edges;
  return edges
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const sa = a.e.sourceNodeID;
      const sb = b.e.sourceNodeID;
      if (sa !== sb) return a.i - b.i;
      const ft = typeIndex.get(sa);
      if (!ft) return a.i - b.i;
      const reg = getRegistry(ft);
      const bt = reg?.backendNodeType;
      if (bt === 'fork') return forkEdgeSortKey(a.e) - forkEdgeSortKey(b.e);
      if (bt === 'switch') return switchEdgeSortKey(a.e) - switchEdgeSortKey(b.e);
      return a.i - b.i;
    })
    .map((x) => x.e);
}

/**
 * 从 Flowgram `document.toJSON()` 结构构建 RuleGo DSL（对象）
 */
export function buildRuleGoDslFromDocument(
  doc: { nodes?: WorkflowNodeJson[]; edges?: WorkflowEdgeJson[] },
  ruleName: string,
  options: BuildDslOptions,
  getRegistry: GetNodeRegistryFn
): RuleGoDsl {
  const nodesJson: WorkflowNodeJson[] = doc.nodes ?? [];
  const edgesJson: WorkflowEdgeJson[] = doc.edges ?? [];

  function connectionTypeFromEdge(
    sourceNodeId: string,
    sourcePortId: string | undefined,
    typeIndex: Map<string, string>
  ): string {
    const fromType = typeIndex.get(sourceNodeId);
    const from = fromType ? { type: fromType } : undefined;
    const reg = from ? getRegistry(from.type) : undefined;
    if (!reg?.getConnectionType) return 'Success';
    const fakePort = {
      portID: sourcePortId,
      id: sourcePortId,
      type: 'output',
    };
    return reg.getConnectionType(fakePort as any, {}) ?? 'Success';
  }

  function collectRuleGoNodes(
    list: WorkflowNodeJson[],
    parentContainerId: string | undefined,
    endpoints: RuleGoEndpoint[],
    nodes: RuleGoNode[],
    forLoopContainers: Map<string, WorkflowNodeJson>
  ): void {
    for (const n of list) {
      if (isInternalBlockType(n.type)) {
        continue;
      }

      const reg = getRegistry(n.type);
      if (!reg) {
        continue;
      }

      const stub = { id: n.id, data: n.data ?? {}, meta: n.meta ?? {}, type: n.type };

      if (reg.isEndpoint && reg.serializeEndpoint) {
        if (!parentContainerId) {
          endpoints.push(reg.serializeEndpoint(stub) as unknown as RuleGoEndpoint);
        }
        continue;
      }

      const configuration = reg.serializeConfiguration
        ? reg.serializeConfiguration(n.data ?? {})
        : {};

      const name =
        String((n.data as Record<string, unknown>)?.name ?? '') ||
        String((n.data as Record<string, unknown>)?.title ?? '') ||
        reg.backendNodeType;

      const additional: Record<string, unknown> = {
        flowgramNodeType: n.type,
        position: n.meta?.position,
      };
      if (parentContainerId) {
        additional.parentContainer = parentContainerId;
      }

      nodes.push({
        id: n.id,
        type: reg.backendNodeType,
        name,
        debugMode: Boolean((n.data as Record<string, unknown>)?.debugMode),
        configuration: configuration as Record<string, unknown>,
        additionalInfo: additional,
      });

      if (n.type === 'for-loop') {
        forLoopContainers.set(n.id, n);
      }

      if (reg.meta?.isContainer && n.blocks?.length) {
        collectRuleGoNodes(n.blocks, n.id, endpoints, nodes, forLoopContainers);
      }
    }
  }

  function emitConnectionsFromEdges(
    edges: WorkflowEdgeJson[],
    containerId: string | undefined,
    typeIndex: Map<string, string>,
    connections: RuleGoConnection[]
  ): void {
    const ordered = sortWorkflowEdgesForForkAndSwitch(edges, typeIndex, getRegistry);
    for (const e of ordered) {
      if (!typeIndex.has(e.sourceNodeID) || !typeIndex.has(e.targetNodeID)) {
        throw new ConnectionError(
          `连线引用未知节点: ${e.sourceNodeID} → ${e.targetNodeID}`
        );
      }
      const fromType = typeIndex.get(e.sourceNodeID);
      const toType = typeIndex.get(e.targetNodeID);

      if (fromType === 'block-start' && containerId) {
        connections.push({
          fromId: containerId,
          toId: e.targetNodeID,
          type: 'Do',
        });
        continue;
      }

      if (
        fromType === 'block-end' ||
        toType === 'block-end' ||
        toType === 'block-start' ||
        fromType === 'block-start'
      ) {
        continue;
      }

      const type = connectionTypeFromEdge(
        e.sourceNodeID,
        e.sourcePortID as string | undefined,
        typeIndex
      );
      connections.push({
        fromId: e.sourceNodeID,
        toId: e.targetNodeID,
        type,
      });
    }
  }

  function collectEdgesRecursive(
    rootNodes: WorkflowNodeJson[],
    rootEdges: WorkflowEdgeJson[],
    connections: RuleGoConnection[],
    typeIndex: Map<string, string>
  ): void {
    emitConnectionsFromEdges(rootEdges, undefined, typeIndex, connections);

    function walk(nodeList: WorkflowNodeJson[]): void {
      for (const n of nodeList) {
        const reg = getRegistry(n.type);
        if (reg?.meta?.isContainer && n.blocks?.length) {
          if (n.edges?.length) {
            emitConnectionsFromEdges(n.edges, n.id, typeIndex, connections);
          }
          walk(n.blocks);
        }
      }
    }

    walk(rootNodes);
  }

  function applyForLoopDoConfiguration(
    nodes: RuleGoNode[],
    forLoopContainers: Map<string, WorkflowNodeJson>
  ): void {
    for (const rn of nodes) {
      if (rn.type !== 'for') continue;
      const w = forLoopContainers.get(rn.id);
      if (!w) continue;
      const inferred = inferDoTarget(w);
      if (inferred) {
        rn.configuration = {
          ...(rn.configuration ?? {}),
          do: inferred,
        };
      }
    }
  }

  const nodes: RuleGoNode[] = [];
  const endpoints: RuleGoEndpoint[] = [];
  const forLoopContainers = new Map<string, WorkflowNodeJson>();

  collectRuleGoNodes(nodesJson, undefined, endpoints, nodes, forLoopContainers);

  applyForLoopDoConfiguration(nodes, forLoopContainers);

  const typeIndex = new Map<string, string>();
  indexNodeTypes(nodesJson, typeIndex);

  const connections: RuleGoConnection[] = [];
  collectEdgesRecursive(nodesJson, edgesJson, connections, typeIndex);
  appendJoinConnectionsFromExtraIncomings(nodesJson, connections);

  const dsl: RuleGoDsl = {
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
      ...(endpoints.length > 0 ? { endpoints } : {}),
    },
  };

  return dsl;
}
