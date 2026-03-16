import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_jsFilter";
const nodeType = "jsFilter";
const category = "rulego_nodes" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    (ScratchBlocks as Record<string, unknown>).Blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("Filter"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("s1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("return msg.temperature > 50;"), "JS_SCRIPT");
        config.appendField(new (BlocklyF as any).FieldCheckbox(true), "DEBUG");
        (this as Block).appendStatementInput("branch_true").appendField("True");
        (this as Block).appendStatementInput("branch_false").appendField("False");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
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
      { inputName: "branch_true", connectionType: "True" },
      { inputName: "branch_false", connectionType: "False" },
      { inputName: "branch_failure", connectionType: "Failure" },
    ];
  },
  getInputNameForConnectionType(type) {
    if (type === "True") return "branch_true";
    if (type === "False") return "branch_false";
    if (type === "Failure") return "branch_failure";
    return undefined;
  },
  getWalkInputs() {
    return ["branch_true", "branch_false", "branch_failure"];
  },
  defaultConnectionType: "True",
};

registerBlockType(def);
export default def;
