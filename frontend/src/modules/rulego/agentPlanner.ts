export type AgentPlanNode = {
  id?: string;
  node_type: string;
  name?: string;
  configuration?: Record<string, unknown>;
  confidence?: number;
  reason?: string;
};

export type AgentPlanEdge = {
  from_id: string;
  to_id: string;
  type?: string;
  confidence?: number;
  reason?: string;
};

export type AgentPlanResult = {
  nodes: AgentPlanNode[];
  edges: AgentPlanEdge[];
  warnings?: string[];
  overall_confidence?: number;
  raw_response?: string;
};

export type AgentPreviewItem = {
  id: string;
  kind: "node" | "edge";
  title: string;
  detail: string;
  confidence: number;
  reason: string;
  valid: boolean;
  validationError?: string;
  node?: AgentPlanNode;
  edge?: AgentPlanEdge;
};

type RuleDsl = {
  ruleChain?: Record<string, unknown>;
  metadata?: {
    nodes?: Array<Record<string, unknown>>;
    connections?: Array<Record<string, unknown>>;
  };
};

function toConfidence(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n)) return 0.6;
  return Math.max(0, Math.min(1, n));
}

function safeParseDsl(definition: string): RuleDsl {
  if (!definition.trim()) return {};
  try {
    const parsed = JSON.parse(definition);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as RuleDsl;
  } catch {
    return {};
  }
}

function normalizeNodeId(raw: string | undefined, index: number, exists: Set<string>): string {
  const seed = String(raw ?? "").trim() || `agent_node_${index + 1}`;
  let candidate = seed;
  let i = 1;
  while (exists.has(candidate)) {
    candidate = `${seed}_${i}`;
    i += 1;
  }
  return candidate;
}

export function buildAgentPreviewItems(plan: AgentPlanResult, supportedNodeTypes: Set<string>): AgentPreviewItem[] {
  const nodeItems: AgentPreviewItem[] = (plan.nodes ?? []).map((node, idx) => {
    const nodeType = String(node.node_type ?? "").trim();
    const valid = !!nodeType && supportedNodeTypes.has(nodeType);
    return {
      id: `node:${idx}`,
      kind: "node",
      title: `新增节点 · ${node.name || nodeType || "未命名"}`,
      detail: `类型: ${nodeType || "-"}`,
      confidence: toConfidence(node.confidence),
      reason: String(node.reason ?? "").trim(),
      valid,
      validationError: valid ? undefined : `不支持的节点类型: ${nodeType || "-"}`,
      node,
    };
  });
  const edgeItems: AgentPreviewItem[] = (plan.edges ?? []).map((edge, idx) => {
    const fromId = String(edge.from_id ?? "").trim();
    const toId = String(edge.to_id ?? "").trim();
    const valid = !!fromId && !!toId;
    return {
      id: `edge:${idx}`,
      kind: "edge",
      title: `新增连线 · ${fromId || "?"} -> ${toId || "?"}`,
      detail: `类型: ${String(edge.type ?? "Success")}`,
      confidence: toConfidence(edge.confidence),
      reason: String(edge.reason ?? "").trim(),
      valid,
      validationError: valid ? undefined : "连线必须包含 from_id 与 to_id",
      edge,
    };
  });
  return [...nodeItems, ...edgeItems];
}

export function applyAgentSelectionsToDsl(
  currentDslText: string,
  previewItems: AgentPreviewItem[],
  selectedIds: Set<string>
): RuleDsl {
  const dsl = safeParseDsl(currentDslText);
  if (!dsl.ruleChain) dsl.ruleChain = {};
  if (!dsl.metadata) dsl.metadata = {};
  if (!Array.isArray(dsl.metadata.nodes)) dsl.metadata.nodes = [];
  if (!Array.isArray(dsl.metadata.connections)) dsl.metadata.connections = [];

  const nodes = dsl.metadata.nodes as Array<Record<string, unknown>>;
  const connections = dsl.metadata.connections as Array<Record<string, unknown>>;
  const nodeIdSet = new Set(nodes.map((n) => String(n.id ?? "").trim()).filter(Boolean));

  const selectedNodes = previewItems.filter((i) => i.kind === "node" && i.valid && selectedIds.has(i.id) && i.node);
  const selectedEdges = previewItems.filter((i) => i.kind === "edge" && i.valid && selectedIds.has(i.id) && i.edge);

  const newNodeIdByInput = new Map<string, string>();
  selectedNodes.forEach((item, idx) => {
    const n = item.node!;
    const assignedId = normalizeNodeId(n.id, idx, nodeIdSet);
    nodeIdSet.add(assignedId);
    if (String(n.id ?? "").trim()) {
      newNodeIdByInput.set(String(n.id).trim(), assignedId);
    }
    nodes.push({
      id: assignedId,
      type: n.node_type,
      name: n.name || n.node_type,
      debugMode: false,
      configuration: n.configuration ?? {},
      additionalInfo: { position: { x: 120 + idx * 30, y: 120 + idx * 20 } },
    });
  });

  const connSet = new Set(
    connections.map((c) => `${String(c.fromId ?? "")}|${String(c.toId ?? "")}|${String(c.type ?? "Success")}`)
  );
  selectedEdges.forEach((item) => {
    const e = item.edge!;
    const fromId = newNodeIdByInput.get(e.from_id) ?? e.from_id;
    const toId = newNodeIdByInput.get(e.to_id) ?? e.to_id;
    if (!nodeIdSet.has(fromId) || !nodeIdSet.has(toId)) return;
    const type = String(e.type ?? "Success");
    const key = `${fromId}|${toId}|${type}`;
    if (connSet.has(key)) return;
    connSet.add(key);
    connections.push({ fromId, toId, type });
  });

  return dsl;
}
