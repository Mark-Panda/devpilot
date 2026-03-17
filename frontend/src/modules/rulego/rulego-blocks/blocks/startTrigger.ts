import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_startTrigger";
const nodeType = "startTrigger";
const category = "rulego_trigger" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block)
          .appendDummyInput("HEAD")
          .appendField(new (BlocklyF as any).FieldTextInput("开始"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("start1"), "NODE_ID");
        if (config.setVisible) config.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block, helpers) {
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
