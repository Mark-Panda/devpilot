/**
 * RuleGo Scratch 块统一入口：注册所有组件块并导出工具箱与 registry。
 * 新增组件时在此处 import 对应块模块即可完成注册。
 */
import "./blocks/jsFilter";
import "./blocks/jsTransform";
import "./blocks/jsSwitch";
import "./blocks/break";
import "./blocks/join";
import "./blocks/flow";
import "./blocks/fork";
import "./blocks/for";
import "./blocks/groupAction";
import "./blocks/restApiCall";
import "./blocks/llm";
import "./blocks/delay";
import "./blocks/switch";
import "./blocks/startTrigger";
import "./blocks/dbClient";
import "./blocks/apiRouteTracer";

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

/** 分类工具箱：每类可折叠/展开，点击分类名展开显示该组积木，再次点击或切换分类可折叠 */
export const toolbox = {
  kind: "categoryToolbox" as const,
  contents: [
    {
      kind: "category" as const,
      name: "触发器",
      categorystyle: "rulego_trigger",
      contents: [
        { kind: "block" as const, type: "rulego_startTrigger" },
      ],
    },
    {
      kind: "category" as const,
      name: "动作",
      categorystyle: "rulego_action",
      contents: [
        { kind: "block" as const, type: "rulego_restApiCall" },
        { kind: "block" as const, type: "rulego_llm" },
        { kind: "block" as const, type: "rulego_delay" },
        { kind: "block" as const, type: "rulego_jsTransform" },
        { kind: "block" as const, type: "rulego_jsFilter" },
      ],
    },
    {
      kind: "category" as const,
      name: "条件判断",
      categorystyle: "rulego_condition",
      contents: [
        { kind: "block" as const, type: "rulego_switch" },
        { kind: "block" as const, type: "rulego_jsSwitch" },
      ],
    },
    {
      kind: "category" as const,
      name: "数据处理",
      categorystyle: "rulego_data",
      contents: [
        { kind: "block" as const, type: "rulego_for" },
        { kind: "block" as const, type: "rulego_join" },
        { kind: "block" as const, type: "rulego_groupAction" },
      ],
    },
    {
      kind: "category" as const,
      name: "流程控制",
      categorystyle: "rulego_flow",
      contents: [
        { kind: "block" as const, type: "rulego_flow" },
        { kind: "block" as const, type: "rulego_fork" },
        { kind: "block" as const, type: "rulego_break" },
      ],
    },
    {
      kind: "category" as const,
      name: "数据库",
      categorystyle: "rulego_db",
      contents: [{ kind: "block" as const, type: "rulego_dbClient" }],
    },
    {
      kind: "category" as const,
      name: "API 路由追踪",
      categorystyle: "rulego_tracer",
      contents: [
        { kind: "block" as const, type: "rulego_sourcegraphSearch" },
        { kind: "block" as const, type: "rulego_apiRouteTracer_gitPrepare" },
        { kind: "block" as const, type: "rulego_apiRouteTracer_agentAnalyze" },
      ],
    },
  ],
};
