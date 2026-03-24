/**
 * 飞书单聊：使用应用 tenant_access_token 调用 im/v1/messages 向指定用户发文本消息。
 * 消息 data：可为纯文本（作为正文），或 JSON：{"receiveId":"…","text":"…"} 覆盖配置/模板。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_feishuImMessage";
const nodeType = "feishu/imMessage";
const category = "rulego_action" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("飞书单聊消息"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("feishu_im1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "FS_APP_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "FS_APP_SECRET");
        config.appendField(
          new (BlocklyF as any).FieldDropdown([
            ["open_id", "open_id"],
            ["union_id", "union_id"],
            ["user_id", "user_id"],
            ["email", "email"],
          ]),
          "FS_RECEIVE_ID_TYPE"
        );
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "FS_RECEIVE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("${data}"), "FS_TEXT");
        config.appendField(new (BlocklyF as any).FieldTextInput("30"), "FS_TIMEOUT_SEC");
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
      appId: helpers.getFieldValue(block, "FS_APP_ID"),
      appSecret: helpers.getFieldValue(block, "FS_APP_SECRET"),
      receiveIdType: helpers.getFieldValue(block, "FS_RECEIVE_ID_TYPE") || "open_id",
      receiveId: helpers.getFieldValue(block, "FS_RECEIVE_ID"),
      text: helpers.getFieldValue(block, "FS_TEXT") || "${data}",
      timeoutSec: Number(helpers.getFieldValue(block, "FS_TIMEOUT_SEC") || "30"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.appId ?? ""), "FS_APP_ID");
    block.setFieldValue(String(c.appSecret ?? ""), "FS_APP_SECRET");
    const rt = String(c.receiveIdType ?? "open_id").toLowerCase();
    const allowed = ["open_id", "union_id", "user_id", "email"];
    block.setFieldValue(allowed.includes(rt) ? rt : "open_id", "FS_RECEIVE_ID_TYPE");
    block.setFieldValue(String(c.receiveId ?? ""), "FS_RECEIVE_ID");
    block.setFieldValue(String(c.text ?? "${data}"), "FS_TEXT");
    block.setFieldValue(String(c.timeoutSec ?? 30), "FS_TIMEOUT_SEC");
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
