import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { buildMinimalNodeInit } from "./shared";

const blockType = "rulego_break";
const nodeType = "break";
const category = "rulego_routes" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    (ScratchBlocks as Record<string, unknown>).Blocks[blockType] = {
      init: buildMinimalNodeInit(BlocklyF as any, {
        defaultId: "br1",
        defaultName: "Break",
        category,
      }),
    };
  },
  getConfiguration() {
    return {};
  },
  getConnectionBranches() {
    return null;
  },
  getWalkInputs() {
    return null;
  },
  defaultConnectionType: "Success",
};

registerBlockType(def);
export default def;
