/**
 * RuleGo DSL 类型定义
 */

/**
 * RuleGo DSL 完整结构
 */
export interface RuleGoDsl {
  ruleChain: {
    id: string;
    name: string;
    debugMode?: boolean;
    root?: boolean;
    disabled?: boolean;
    configuration?: Record<string, unknown>;
    additionalInfo?: Record<string, unknown>;
  };
  metadata: {
    firstNodeIndex?: number;
    nodes: RuleGoNode[];
    connections: RuleGoConnection[];
    ruleChainConnections?: any[];
    endpoints?: RuleGoEndpoint[];
  };
}

/**
 * RuleGo 节点定义
 */
export interface RuleGoNode {
  id: string;
  type: string;
  name: string;
  debugMode?: boolean;
  configuration?: Record<string, unknown>;
  additionalInfo?: {
    flowgramNodeType?: string;
    position?: { x: number; y: number };
    blockId?: string;
    parentContainer?: string;
    [key: string]: any;
  };
}

/**
 * RuleGo 连接定义
 */
export interface RuleGoConnection {
  fromId: string;
  toId: string;
  type: string;
  label?: string;
}

/**
 * RuleGo Endpoint 定义（与 RuleGo metadata.endpoints 项一致，含 HTTP 的 routers 等）
 */
export interface RuleGoEndpoint {
  id: string;
  /** 如 `endpoint/http`、简写 `http`（视引擎版本） */
  type: string;
  name?: string;
  configuration?: Record<string, unknown>;
  routers?: unknown[];
  additionalInfo?: {
    position?: { x: number; y: number };
    [key: string]: any;
  };
}

/**
 * 连接类型枚举
 */
export enum ConnectionType {
  Success = 'Success',
  Failure = 'Failure',
  Do = 'Do',
  True = 'True',
  False = 'False',
  Default = 'Default',
}

/**
 * DSL 构建选项
 */
export interface BuildDslOptions {
  ruleId?: string;
  debugMode?: boolean;
  root?: boolean;
  enabled?: boolean;
}
