import type { RuleGoFlowEdge, RuleGoFlowNode, RuleGoDsl, RuleGoDslNode, RuleGoNodeData } from "./types";
import { CONTAINER_NODE_TYPES, CONNECTION_TYPE_COLORS } from "./types";
import { getBlockTypeFromNodeType } from "../../rulego-blocks";

/** 普通节点默认尺寸 */
const DEFAULT_NODE_WIDTH = 360;
const DEFAULT_NODE_HEIGHT = 80;

/** for 容器内子节点布局参数（LR 方向：子节点横向排列） */
const FOR_HEADER_H = 36;         // 顶部标签条高度
const FOR_PAD_LEFT = 80;         // 左侧圆形图标区宽度
const FOR_PAD_RIGHT = 80;        // 右侧圆形图标区宽度
const FOR_PAD_TOP = 40;          // 标题下方到子节点的垂直居中间距
const FOR_PAD_BOTTOM = 40;       // 子节点到底部间距
const FOR_CHILD_GAP = 40;        // 子节点之间的水平间距

/** 其他容器节点布局参数 */
const CONTAINER_HEADER_H = 48;
const CONTAINER_PAD_X = 24;
const CONTAINER_PAD_TOP = 20;
const CONTAINER_PAD_BOTTOM = 28;
const CHILD_GAP = 20;

/**
 * 将 RuleGo DSL 转为 ReactFlow nodes + edges。
 *
 * 规则：
 * - 普通节点 1:1 映射
 * - for/switch/fork/groupAction 节点的子链节点全部设 parentId
 * - join 多入边、有向环均正常映射为多条 edges
 * - 若节点有 meta.position，直接使用（跳过 dagre）
 */
export function dslToReactFlow(dsl: RuleGoDsl): {
  nodes: RuleGoFlowNode[];
  edges: RuleGoFlowEdge[];
  hasPositions: boolean;
} {
  const metadata = dsl.metadata;
  const dslNodes = metadata?.nodes ?? [];
  const dslConnections = metadata?.connections ?? [];

  // 建立 id → DSL节点 快速查找
  const nodeById = new Map<string, RuleGoDslNode>(dslNodes.map((n) => [n.id, n]));

  // 遍历 for 节点的整条 Do 子链，返回所有子链节点 id（BFS，按 Success 继续往下）
  function collectForChildChain(forNodeId: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    // 找 Do 直接子节点
    const doConns = dslConnections.filter((c) => c.fromId === forNodeId && c.type === "Do");
    const queue: string[] = doConns.map((c) => c.toId);
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      result.push(id);
      // 沿 Success 链继续收集（子链内部连接）
      const nexts = dslConnections.filter((c) => c.fromId === id && c.type === "Success");
      for (const n of nexts) {
        // 不越出子链：目标节点必须存在于 DSL 节点列表
        if (nodeById.has(n.toId) && !visited.has(n.toId)) {
          queue.push(n.toId);
        }
      }
    }
    return result;
  }

  // 建立 子节点id → parentId 映射（for 子链）
  const childToParent = new Map<string, string>();
  // 按容器类型分别处理
  for (const dslNode of dslNodes) {
    const blockType = getBlockTypeFromNodeType(dslNode.type) || `rulego_${dslNode.type}`;
    if (blockType === "rulego_for") {
      const childIds = collectForChildChain(dslNode.id);
      for (const cid of childIds) {
        if (!childToParent.has(cid)) childToParent.set(cid, dslNode.id);
      }
    }
    // switch: Case* 直接子节点
    if (blockType === "rulego_switch" || blockType === "rulego_jsSwitch") {
      const caseConns = dslConnections.filter((c) => c.fromId === dslNode.id && c.type.startsWith("Case"));
      for (const c of caseConns) {
        if (!childToParent.has(c.toId)) childToParent.set(c.toId, dslNode.id);
      }
    }
    // fork: Success 分支子节点（各分支头节点）
    if (blockType === "rulego_fork") {
      const forkConns = dslConnections.filter((c) => c.fromId === dslNode.id && c.type === "Success");
      for (const c of forkConns) {
        if (!childToParent.has(c.toId)) childToParent.set(c.toId, dslNode.id);
      }
    }
    // groupAction: nodeIds 里的节点
    if (blockType === "rulego_groupAction") {
      const nodeIds = (dslNode.configuration?.nodeIds ?? []) as string[];
      for (const nid of nodeIds) {
        if (!childToParent.has(nid)) childToParent.set(nid, dslNode.id);
      }
    }
  }

  // 计算每个容器节点包含的子节点数量（用于确定容器高度）
  const containerChildCount = new Map<string, number>();
  for (const [, parentId] of childToParent) {
    containerChildCount.set(parentId, (containerChildCount.get(parentId) ?? 0) + 1);
  }

  // 计算 for 容器尺寸（子节点水平排列）
  function forContainerSize(childCount: number) {
    const innerW =
      Math.max(1, childCount) * DEFAULT_NODE_WIDTH +
      Math.max(0, childCount - 1) * FOR_CHILD_GAP;
    return {
      width: FOR_PAD_LEFT + innerW + FOR_PAD_RIGHT,
      height: FOR_HEADER_H + FOR_PAD_TOP + DEFAULT_NODE_HEIGHT + FOR_PAD_BOTTOM,
    };
  }

  // 计算其他容器尺寸（子节点垂直堆叠）
  function containerSize(childCount: number) {
    const innerH =
      Math.max(1, childCount) * DEFAULT_NODE_HEIGHT +
      Math.max(0, childCount - 1) * CHILD_GAP;
    return {
      width: DEFAULT_NODE_WIDTH + CONTAINER_PAD_X * 2,
      height: CONTAINER_HEADER_H + CONTAINER_PAD_TOP + innerH + CONTAINER_PAD_BOTTOM,
    };
  }

  const nodes: RuleGoFlowNode[] = [];
  const edges: RuleGoFlowEdge[] = [];
  let hasPositions = false;

  // 第一遍：创建所有 ReactFlow 节点
  for (const dslNode of dslNodes) {
    const blockType = getBlockTypeFromNodeType(dslNode.type) || `rulego_${dslNode.type}`;
    const isContainer = CONTAINER_NODE_TYPES.has(blockType);
    const parentId = childToParent.get(dslNode.id);

    // 读取已保存的位置
    const savedPos = (dslNode as unknown as { additionalInfo?: { position?: { x: number; y: number } } })
      .additionalInfo?.position;
    if (savedPos?.x !== undefined) hasPositions = true;

    // 计算子节点在容器内的局部位置
    let position = savedPos ?? { x: 0, y: 0 };
    if (parentId && !savedPos) {
      const parentBlockType = getBlockTypeFromNodeType(nodeById.get(parentId)?.type ?? "") || `rulego_${nodeById.get(parentId)?.type ?? ""}`;
      const isForParent = parentBlockType === "rulego_for";

      // 找该节点在父容器子链中的顺序
      const siblings = [...childToParent.entries()]
        .filter(([, pid]) => pid === parentId)
        .map(([cid]) => cid);
      const idx = siblings.indexOf(dslNode.id);

      if (isForParent) {
        // for 子链：水平排列
        position = {
          x: FOR_PAD_LEFT + idx * (DEFAULT_NODE_WIDTH + FOR_CHILD_GAP),
          y: FOR_HEADER_H + FOR_PAD_TOP,
        };
      } else {
        // 其他容器：垂直堆叠
        position = {
          x: CONTAINER_PAD_X,
          y: CONTAINER_HEADER_H + CONTAINER_PAD_TOP + idx * (DEFAULT_NODE_HEIGHT + CHILD_GAP),
        };
      }
    }

    const childCount = containerChildCount.get(dslNode.id) ?? 0;
    const blockType2 = getBlockTypeFromNodeType(dslNode.type) || `rulego_${dslNode.type}`;
    const size = isContainer
      ? blockType2 === "rulego_for"
        ? forContainerSize(childCount)
        : containerSize(childCount)
      : undefined;

    const rfNode: RuleGoFlowNode = {
      id: dslNode.id,
      type: blockType,
      position,
      data: {
        nodeType: dslNode.type,
        name: dslNode.name ?? "",
        debugMode: dslNode.debugMode ?? false,
        configuration: dslNode.configuration ?? {},
        expanded: isContainer ? true : undefined,
      } satisfies RuleGoNodeData,
      ...(parentId ? { parentId, extent: "parent" as const } : {}),
      ...(size ? { style: { width: size.width, height: size.height } } : {}),
    };

    nodes.push(rfNode);
  }

  // 第二遍：创建所有 ReactFlow edges
  const edgeIdSeen = new Set<string>();
  for (const conn of dslConnections) {
    const edgeId = `e-${conn.fromId}-${conn.toId}-${conn.type}`;
    if (edgeIdSeen.has(edgeId)) continue;
    edgeIdSeen.add(edgeId);

    // 容器内部边（父容器 → 子节点的 Do/Case*/fork-Success 边）隐藏
    const isContainerToChild =
      childToParent.get(conn.toId) === conn.fromId &&
      (conn.type === "Do" || conn.type.startsWith("Case") || conn.type === "Success");

    // FlowGram 风格：连线为灰色，Failure 用红色
    const edgeColor = conn.type === "Failure" ? "#ef4444" : "rgba(6,7,9,0.25)";

    edges.push({
      id: edgeId,
      source: conn.fromId,
      target: conn.toId,
      label: conn.type !== "Success" && conn.type !== "Do" ? conn.type : undefined,
      type: "smoothstep",
      style: { stroke: edgeColor, strokeWidth: 1.5 },
      labelStyle: { fontSize: 11, fill: "rgba(6,7,9,0.45)", fontWeight: 500 },
      labelBgStyle: { fill: "#fff", fillOpacity: 0.85 },
      hidden: isContainerToChild,
    });
  }

  return { nodes, edges, hasPositions };
}
