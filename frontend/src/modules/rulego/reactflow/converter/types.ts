import type { Node, Edge } from "@xyflow/react";

/** RuleGo DSL 节点 */
export interface RuleGoDslNode {
  id: string;
  type: string;
  name: string;
  debugMode?: boolean;
  configuration?: Record<string, unknown>;
  additionalInfo?: Record<string, unknown>;
}

/** RuleGo DSL 连接 */
export interface RuleGoDslConnection {
  fromId: string;
  toId: string;
  type: string;
}

/** RuleGo DSL metadata */
export interface RuleGoDslMetadata {
  nodes: RuleGoDslNode[];
  connections: RuleGoDslConnection[];
}

/** RuleGo DSL 根结构 */
export interface RuleGoDsl {
  ruleChain?: {
    id?: string;
    name?: string;
    root?: boolean;
    disabled?: boolean;
    additionalInfo?: Record<string, unknown>;
  };
  metadata: RuleGoDslMetadata;
}

/** ReactFlow 节点的 data 字段 */
export interface RuleGoNodeData {
  nodeType: string;
  name: string;
  debugMode: boolean;
  configuration: Record<string, unknown>;
  /** 分支/容器节点的展开状态 */
  expanded?: boolean;
  [key: string]: unknown;
}

export type RuleGoFlowNode = Node<RuleGoNodeData>;
export type RuleGoFlowEdge = Edge;

/** 含子节点的父节点类型 */
export const CONTAINER_NODE_TYPES = new Set([
  "rulego_for",
  "rulego_switch",
  "rulego_fork",
  "rulego_groupAction",
]);

/** 连接类型对应的边颜色 */
export const CONNECTION_TYPE_COLORS: Record<string, string> = {
  Success: "#22c55e",
  Failure: "#ef4444",
  True: "#22c55e",
  False: "#ef4444",
  Do: "#8b5cf6",
  Default: "#94a3b8",
};
