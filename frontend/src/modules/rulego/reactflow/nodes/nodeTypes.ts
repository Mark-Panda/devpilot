import type { NodeTypes } from "@xyflow/react";
import { RuleGoNodeCard } from "./RuleGoNodeCard";
import { ContainerNodeCard } from "./ContainerNodeCard";
import { ForLoopNode } from "./ForLoopNode";
import { getAllBlockTypes } from "../../rulego-blocks";
import { CONTAINER_NODE_TYPES } from "../converter/types";

/** blockType → 渲染组件的特殊映射 */
const SPECIAL_NODE_TYPES: Record<string, React.ComponentType<any>> = {
  rulego_for: ForLoopNode,
};

/**
 * 将所有已注册的 blockType 映射为对应的渲染组件：
 * - rulego_for → ForLoopNode（FlowGram Loop 风格）
 * - 其余容器节点（switch/fork/groupAction）→ ContainerNodeCard
 * - 普通节点 → RuleGoNodeCard
 */
export function buildNodeTypes(): NodeTypes {
  const types: NodeTypes = {};
  for (const blockType of getAllBlockTypes()) {
    if (SPECIAL_NODE_TYPES[blockType]) {
      types[blockType] = SPECIAL_NODE_TYPES[blockType];
    } else if (CONTAINER_NODE_TYPES.has(blockType)) {
      types[blockType] = ContainerNodeCard;
    } else {
      types[blockType] = RuleGoNodeCard;
    }
  }
  types["default"] = RuleGoNodeCard;
  return types;
}
