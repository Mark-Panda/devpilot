import type { Block } from "blockly/core";

export type BlockTypeCategory =
  | "rulego_trigger"
  | "rulego_action"
  | "rulego_condition"
  | "rulego_data"
  | "rulego_flow"
  | "rulego_db"
  | "rulego_file"
  | "rulego_tracer";

export interface ConnectionBranch {
  inputName: string;
  connectionType: string;
}

export interface BlockHelpers {
  getFieldValue: (block: Block, name: string) => string;
  getBooleanField: (block: Block, name: string) => boolean;
  parseJsonValue: (value: string, fallback: unknown) => unknown;
}

export interface BlockTypeDef {
  blockType: string;
  nodeType: string;
  category: BlockTypeCategory;
  register(ScratchBlocks: unknown, BlocklyF: unknown, options?: Record<string, unknown>): void;
  getConfiguration(block: Block, helpers: BlockHelpers): Record<string, unknown>;
  setConfiguration?(
    block: Block,
    node: { configuration?: Record<string, unknown> },
    helpers: BlockHelpers
  ): void;
  /** 返回各分支的 inputName 与 connectionType；null 表示使用 nextStatement 链 */
  getConnectionBranches(block: Block, helpers: BlockHelpers): ConnectionBranch[] | null;
  /** 加载 DSL 时根据 connection.type 得到要连接的 input 名称 */
  getInputNameForConnectionType?(connectionType: string, block?: Block): string | undefined;
  /** walkChain 时要递归的 input 名称列表；null 表示走 nextStatement */
  getWalkInputs(block: Block): string[] | null;
  /** 使用 nextStatement 时的默认连接类型 */
  defaultConnectionType?: string;
}

export interface RuleGoNode {
  id: string;
  type: string;
  name: string;
  debugMode: boolean;
  configuration: Record<string, unknown>;
}
