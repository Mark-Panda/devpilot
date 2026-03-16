import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_for";
const nodeType = "for";
const category = "rulego_data" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("遍历"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("for1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("1..3"), "FOR_RANGE");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "FOR_DO");
        config.appendField(
          new (BlocklyF as any).FieldDropdown([["忽略", "0"], ["追加", "1"], ["覆盖", "2"], ["异步", "3"]]),
          "FOR_MODE"
        );
        config.appendField(new (BlocklyF as any).FieldCheckbox(true), "DEBUG");
        (this as Block).appendStatementInput("branch_do").appendField("do 遍历体");
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
    const doBlock = block.getInputTargetBlock("branch_do");
    const doId = doBlock
      ? helpers.getFieldValue(doBlock, "NODE_ID") || doBlock.id
      : helpers.getFieldValue(block, "FOR_DO") || "s3";
    const modeStr = helpers.getFieldValue(block, "FOR_MODE");
    return {
      range: helpers.getFieldValue(block, "FOR_RANGE") || "1..3",
      do: doId,
      mode: modeStr === "" ? 0 : Number(modeStr) || 0,
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.range ?? "1..3"), "FOR_RANGE");
    block.setFieldValue(String(c.do ?? "s3"), "FOR_DO");
    block.setFieldValue(String(c.mode ?? 0), "FOR_MODE");
  },
  getConnectionBranches() {
    return [
      { inputName: "branch_do", connectionType: "Do" },
      { inputName: "__next__", connectionType: "Success" },
      { inputName: "branch_failure", connectionType: "Failure" },
    ];
  },
  getInputNameForConnectionType(type) {
    if (type === "Do") return "branch_do";
    if (type === "Failure") return "branch_failure";
    return undefined;
  },
  getWalkInputs() {
    return ["branch_do", "__next__", "branch_failure"];
  },
};

registerBlockType(def);
export default def;
