/**
 * RuleGo Scratch 块统一入口：注册所有组件块并导出工具箱与 registry。
 * 新增组件时在此处 import 对应块模块即可完成注册。
 */
import "./blocks/jsFilter";
import "./blocks/jsTransform";
import "./blocks/jsSwitch";
import "./blocks/break";
import "./blocks/join";
import "./blocks/for";
import "./blocks/groupAction";
import "./blocks/restApiCall";
import "./blocks/switch";
import "./blocks/endpoint";
import "./blocks/router";

import {
  getBlockDef,
  getNodeType,
  getBlockTypeFromNodeType,
  getAllBlockTypes,
} from "./registry";

export { getBlockDef, getNodeType, getBlockTypeFromNodeType, getAllBlockTypes };
export type { BlockTypeDef, BlockHelpers, ConnectionBranch, RuleGoNode } from "./types";

export function registerAllBlocks(ScratchBlocks: unknown, BlocklyF: unknown, _options?: Record<string, unknown>): void {
  for (const blockType of getAllBlockTypes()) {
    const def = getBlockDef(blockType);
    if (def?.register) def.register(ScratchBlocks, BlocklyF, _options);
  }
}

export const toolbox = {
  kind: "categoryToolbox" as const,
  contents: [
    {
      kind: "category" as const,
      name: "规则链节点",
      categorystyle: "rulego_nodes",
      contents: [
        { kind: "block" as const, type: "rulego_jsFilter" },
        { kind: "block" as const, type: "rulego_jsTransform" },
        { kind: "block" as const, type: "rulego_jsSwitch" },
        { kind: "block" as const, type: "rulego_restApiCall" },
      ],
    },
    {
      kind: "category" as const,
      name: "条件与路由",
      categorystyle: "rulego_routes",
      contents: [
        { kind: "block" as const, type: "rulego_switch" },
        { kind: "block" as const, type: "rulego_break" },
        { kind: "block" as const, type: "rulego_join" },
      ],
    },
    {
      kind: "category" as const,
      name: "数据处理",
      categorystyle: "rulego_data",
      contents: [
        { kind: "block" as const, type: "rulego_for" },
        { kind: "block" as const, type: "rulego_groupAction" },
      ],
    },
    {
      kind: "category" as const,
      name: "Endpoints",
      categorystyle: "rulego_endpoints",
      contents: [{ kind: "block" as const, type: "rulego_endpoint" }],
    },
    {
      kind: "category" as const,
      name: "Routers",
      categorystyle: "rulego_routers",
      contents: [{ kind: "block" as const, type: "rulego_router" }],
    },
  ],
};
