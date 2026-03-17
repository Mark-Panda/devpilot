import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_jsTransform";
const nodeType = "jsTransform";
const category = "rulego_action" as const;
const defaultScript =
  "metadata['name']='test02';\nmetadata['index']=22;\nmsg['addField']='addValue2';\nreturn {'msg':msg,'metadata':metadata,'msgType':msgType};";

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("脚本转换器"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("s2"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(defaultScript), "JS_SCRIPT");
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
    const script = String(node.configuration?.jsScript ?? "");
    block.setFieldValue(script, "JS_SCRIPT");
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
