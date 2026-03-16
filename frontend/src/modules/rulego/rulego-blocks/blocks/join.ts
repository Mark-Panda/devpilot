import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_join";
const nodeType = "join";
const category = "rulego_routes" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    (ScratchBlocks as Record<string, unknown>).Blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("汇聚"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("jn1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldNumber("0", 0, 3600, 1), "JOIN_TIMEOUT");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "JOIN_MERGE_TO_MAP");
        config.appendField(new (BlocklyF as any).FieldCheckbox(true), "DEBUG");
        (this as Block).appendStatementInput("branch_success").appendField("Success");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
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
      { inputName: "branch_success", connectionType: "Success" },
      { inputName: "branch_failure", connectionType: "Failure" },
    ];
  },
  getInputNameForConnectionType(type) {
    return type === "Failure" ? "branch_failure" : "branch_success";
  },
  getWalkInputs() {
    return ["branch_success", "branch_failure"];
  },
};

registerBlockType(def);
export default def;
