/**
 * 节点引用（ref）：复用本链或其它规则链中的节点。
 * 文档：https://rulego.cc/pages/ref/#%E9%85%8D%E7%BD%AE
 * - targetId：本链为 {nodeId}，跨链为 {chainId}:{nodeId}
 * - tellChain：true 时从 target 起执行整条子链，否则仅执行该节点
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_ref";
const nodeType = "ref";
const category = "rulego_flow" as const;

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
          .appendField(new (BlocklyF as any).FieldTextInput("节点引用"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("ref1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "REF_TARGET_ID");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "REF_TELL_CHAIN");
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
      targetId: helpers.getFieldValue(block, "REF_TARGET_ID") ?? "",
      tellChain: helpers.getBooleanField(block, "REF_TELL_CHAIN"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    const targetId = typeof c.targetId === "string" ? c.targetId : String(c.targetId ?? "");
    const tellChain = Boolean(c.tellChain);
    block.setFieldValue(targetId, "REF_TARGET_ID");
    block.setFieldValue(tellChain ? "TRUE" : "FALSE", "REF_TELL_CHAIN");
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
  defaultConnectionType: "Success",
};

registerBlockType(def);
export default def;
