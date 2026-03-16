/**
 * 延迟组件（delay）：RuleGo 标准组件，用于消息延迟处理、定时任务、流量削峰等。
 * 文档：https://rulego.cc/pages/delay/
 * - delayMs：延迟时间（毫秒），支持数字或动态表达式如 ${metadata.delay}，默认 60000
 * - overwrite：周期内是否覆盖为单条消息，默认 false
 * - Success：延迟结束后转发；Failure：队列超限时转发
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_delay";
const nodeType = "delay";
const category = "rulego_action" as const;

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
          .appendField(new (BlocklyF as any).FieldTextInput("延迟"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("delay1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("60000"), "DELAY_MS");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "DELAY_OVERWRITE");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "DEBUG");
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
    return {
      delayMs: helpers.getFieldValue(block, "DELAY_MS") || "60000",
      overwrite: helpers.getBooleanField(block, "DELAY_OVERWRITE"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    const delayMs = typeof c.delayMs === "string" ? c.delayMs : String(c.delayMs ?? "60000");
    const overwrite = Boolean(c.overwrite);
    block.setFieldValue(delayMs, "DELAY_MS");
    block.setFieldValue(overwrite ? "TRUE" : "FALSE", "DELAY_OVERWRITE");
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
