import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_router";
const nodeType = "router";
const category = "rulego_trigger" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("Router"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("rt1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("/api"), "ROUTER_PATH");
        config.appendField(
          new (BlocklyF as any).FieldDropdown([["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"], ["DELETE", "DELETE"]]),
          "ROUTER_METHOD"
        );
        config.appendField(new (BlocklyF as any).FieldTextInput("[]"), "ROUTER_PROCESSORS");
        if (config.setVisible) config.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block, helpers) {
    return {
      path: helpers.getFieldValue(block, "ROUTER_PATH"),
      method: helpers.getFieldValue(block, "ROUTER_METHOD"),
      processors: helpers.parseJsonValue(helpers.getFieldValue(block, "ROUTER_PROCESSORS"), []),
    };
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
