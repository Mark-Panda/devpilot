import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { buildMinimalNodeInit } from "./shared";

const blockType = "rulego_break";
const nodeType = "break";
const category = "rulego_flow" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: buildMinimalNodeInit(BlocklyF as any, {
        defaultId: "br1",
        defaultName: "终止循环",
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
