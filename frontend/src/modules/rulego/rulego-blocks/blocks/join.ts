import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_join";
const nodeType = "join";
const category = "rulego_data" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        const head = (this as Block).appendDummyInput("HEAD");
        head.appendField(new (BlocklyF as any).FieldTextInput("汇聚"), "NODE_NAME");
        head.appendField(new (BlocklyF as any).FieldTextInput(""), "JOIN_ROUTES_LABEL");
        const leftHint = (this as Block).appendDummyInput("LEFT_HINT");
        leftHint.appendField("← 多路汇聚");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("jn1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldNumber("0", 0, 3600, 1), "JOIN_TIMEOUT");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "JOIN_MERGE_TO_MAP");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "JOIN_EXTRA_INCOMINGS");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block, helpers) {
    return {
      timeout: Number(helpers.getFieldValue(block, "JOIN_TIMEOUT") ?? 0) || 0,
      mergeToMap: helpers.getBooleanField(block, "JOIN_MERGE_TO_MAP"),
    };
  },
  setConfiguration(block, node) {
    block.setFieldValue(String(node.configuration?.timeout ?? 0), "JOIN_TIMEOUT");
    block.setFieldValue(node.configuration?.mergeToMap ? "TRUE" : "FALSE", "JOIN_MERGE_TO_MAP");
  },
  getConnectionBranches() {
    return [
      { inputName: "__next__", connectionType: "Success" },
      { inputName: "branch_failure", connectionType: "Failure" },
    ];
  },
  getInputNameForConnectionType(type) {
    return type === "Failure" ? "branch_failure" : undefined;
  },
  getWalkInputs() {
    return ["__next__", "branch_failure"];
  },
};

registerBlockType(def);
export default def;
