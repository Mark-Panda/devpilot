import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_jsSwitch";
const nodeType = "jsSwitch";
const category = "rulego_condition" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("脚本路由"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("s3"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("return ['Success'];"), "JS_SCRIPT");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        (this as Block).appendStatementInput("branch_default").appendField("Default");
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block, helpers) {
    return { jsScript: helpers.getFieldValue(block, "JS_SCRIPT") };
  },
  setConfiguration(block, node) {
    block.setFieldValue(String(node.configuration?.jsScript ?? ""), "JS_SCRIPT");
  },
  getConnectionBranches() {
    return [
      { inputName: "__next__", connectionType: "Success" },
      { inputName: "branch_failure", connectionType: "Failure" },
      { inputName: "branch_default", connectionType: "Default" },
    ];
  },
  getInputNameForConnectionType(type) {
    if (type === "Failure") return "branch_failure";
    if (type === "Default") return "branch_default";
    return undefined;
  },
  getWalkInputs() {
    return ["__next__", "branch_failure", "branch_default"];
  },
};

registerBlockType(def);
export default def;
