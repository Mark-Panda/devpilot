import dagre from "dagre";
import type { RuleGoFlowNode, RuleGoFlowEdge } from "./types";

const DEFAULT_NODE_WIDTH = 360;
const DEFAULT_NODE_HEIGHT = 80;
const RANK_SEP = 100;  // 节点之间的水平间距
const NODE_SEP = 40;   // 同排节点的垂直间距

/**
 * 对没有 position 信息的节点运行 dagre TB 自动布局。
 * 已有 position（来自 meta.position）的节点保持原样。
 */
export function applyDagreLayout(
  nodes: RuleGoFlowNode[],
  edges: RuleGoFlowEdge[]
): RuleGoFlowNode[] {
  // 分离顶层节点和子节点（有 parentId 的在父容器内单独布局）
  const topNodes = nodes.filter((n) => !n.parentId);
  const childNodes = nodes.filter((n) => n.parentId);

  // 对顶层节点做全局布局
  const laid = layoutGraph(topNodes, edges.filter((e) => {
    // 只包含两端都是顶层节点的边
    const srcTop = topNodes.some((n) => n.id === e.source);
    const tgtTop = topNodes.some((n) => n.id === e.target);
    return srcTop && tgtTop;
  }));

  // 对每个容器节点的子节点做局部布局
  const parentIds = new Set(childNodes.map((n) => n.parentId as string));
  const laidChildren: RuleGoFlowNode[] = [];
  for (const parentId of parentIds) {
    const siblings = childNodes.filter((n) => n.parentId === parentId);
    const siblingEdges = edges.filter((e) =>
      siblings.some((n) => n.id === e.source) &&
      siblings.some((n) => n.id === e.target)
    );
    const laidSiblings = layoutGraph(siblings, siblingEdges, { offsetX: 20, offsetY: 60 });
    laidChildren.push(...laidSiblings);
  }

  return [...laid, ...laidChildren];
}

function layoutGraph(
  nodes: RuleGoFlowNode[],
  edges: RuleGoFlowEdge[],
  offset: { offsetX?: number; offsetY?: number } = {}
): RuleGoFlowNode[] {
  if (nodes.length === 0) return [];

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: RANK_SEP, nodesep: NODE_SEP });

  for (const node of nodes) {
    const w = (node.style?.width as number) ?? DEFAULT_NODE_WIDTH;
    const h = (node.style?.height as number) ?? DEFAULT_NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  return nodes.map((node) => {
    // 已有保存位置的节点跳过布局（子节点的局部坐标在 dslToReactFlow 里已计算好，不再覆盖）
    const hasPos = node.position.x !== 0 || node.position.y !== 0;
    if (hasPos || node.parentId) return node;

    const pos = g.node(node.id);
    if (!pos) return node;

    const w = (node.style?.width as number) ?? DEFAULT_NODE_WIDTH;
    const h = (node.style?.height as number) ?? DEFAULT_NODE_HEIGHT;

    return {
      ...node,
      position: {
        x: pos.x - w / 2 + (offset.offsetX ?? 0),
        y: pos.y - h / 2 + (offset.offsetY ?? 0),
      },
    };
  });
}
