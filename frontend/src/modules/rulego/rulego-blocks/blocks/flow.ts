/**
 * 子规则链（flow）：RuleGo 标准组件，用于规则链嵌套。
 * 文档：https://rulego.cc/pages/sub-rule-chain/
 * - targetId：子规则链 ID（必填）
 * - extend：是否继承子规则输出关系和消息，默认 false
 * - Success：子规则链所有分支执行完后合并结果发送；执行失败：找不到子规则链或某分支失败时发送
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_flow";
const nodeType = "flow";
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
          .appendField(new (BlocklyF as any).FieldTextInput("子规则链"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("flow1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "FLOW_TARGET_ID");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "FLOW_EXTEND");
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
      targetId: helpers.getFieldValue(block, "FLOW_TARGET_ID") ?? "",
      extend: helpers.getBooleanField(block, "FLOW_EXTEND"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    const targetId = typeof c.targetId === "string" ? c.targetId : String(c.targetId ?? "");
    const extend = Boolean(c.extend);
    block.setFieldValue(targetId, "FLOW_TARGET_ID");
    block.setFieldValue(extend ? "TRUE" : "FALSE", "FLOW_EXTEND");
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
