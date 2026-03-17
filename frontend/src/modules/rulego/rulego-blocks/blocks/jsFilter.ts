import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_jsFilter";
const nodeType = "jsFilter";
const category = "rulego_action" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("Filter"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("s1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("return msg.temperature > 50;"), "JS_SCRIPT");
        (this as Block).appendStatementInput("branch_false").appendField("False");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
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
      { inputName: "__next__", connectionType: "True" },
      { inputName: "branch_false", connectionType: "False" },
      { inputName: "branch_failure", connectionType: "Failure" },
    ];
  },
  getInputNameForConnectionType(type) {
    if (type === "False") return "branch_false";
    if (type === "Failure") return "branch_failure";
    return undefined;
  },
  getWalkInputs() {
    return ["__next__", "branch_false", "branch_failure"];
  },
  defaultConnectionType: "True",
};

registerBlockType(def);
export default def;
