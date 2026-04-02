import type { RuleGoFlowEdge, RuleGoFlowNode, RuleGoDslMetadata, RuleGoDslNode, RuleGoDslConnection } from "./types";
import { getNodeType } from "../../rulego-blocks";

/**
 * 将 ReactFlow nodes + edges 还原为 RuleGo DSL metadata。
 * - parentId 子节点同样输出为 metadata.nodes（不丢弃）
 * - meta.position 写回到节点（供下次加载恢复布局）
 */
export function reactFlowToDsl(
  nodes: RuleGoFlowNode[],
  edges: RuleGoFlowEdge[]
): RuleGoDslMetadata {
  const dslNodes: RuleGoDslNode[] = nodes.map((rfNode) => {
    const blockType = rfNode.type ?? "";
    const nodeType = getNodeType(blockType) || rfNode.data.nodeType || blockType;
    const dslNode: RuleGoDslNode = {
      id: rfNode.id,
      type: nodeType,
      name: rfNode.data.name ?? "",
      debugMode: rfNode.data.debugMode ?? false,
      configuration: rfNode.data.configuration ?? {},
    };

    // 写回位置到 additionalInfo（DSL meta 字段）
    if (rfNode.position) {
      (dslNode as unknown as { additionalInfo: Record<string, unknown> }).additionalInfo = {
        position: { x: rfNode.position.x, y: rfNode.position.y },
      };
    }

    return dslNode;
  });

  const dslConnections: RuleGoDslConnection[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (edge.hidden) continue;
    const connType = (edge.label as string) || "Success";
    const key = `${edge.source}-${edge.target}-${connType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    dslConnections.push({
      fromId: edge.source,
      toId: edge.target,
      type: connType,
    });
  }

  return {
    nodes: dslNodes,
    connections: dslConnections,
  };
}
