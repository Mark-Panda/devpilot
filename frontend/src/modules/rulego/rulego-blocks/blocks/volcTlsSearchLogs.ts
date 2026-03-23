/**
 * 火山引擎 TLS 日志检索：调用 SearchLogs / SearchLogsV2。
 * 消息 data：可为检索语句字符串，或 JSON：
 * {"query":"*","startTime":毫秒,"endTime":毫秒,"topicId":"可选","context":"","sort":"desc","highLight":false}
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_volcTlsSearchLogs";
const nodeType = "volcTls/searchLogs";
const category = "rulego_action" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("火山 TLS 查日志"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("volc_tls1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "TLS_ENDPOINT");
        config.appendField(new (BlocklyF as any).FieldTextInput("cn-beijing"), "TLS_REGION");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "TLS_AK");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "TLS_SK");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "TLS_SESSION_TOKEN");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "TLS_TOPIC_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("*"), "TLS_DEFAULT_QUERY");
        config.appendField(new (BlocklyF as any).FieldTextInput("100"), "TLS_LIMIT");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "TLS_API_V3");
        config.appendField(new (BlocklyF as any).FieldTextInput("60"), "TLS_TIMEOUT_SEC");
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
    const lim = Math.min(500, Math.max(1, Number(helpers.getFieldValue(block, "TLS_LIMIT") || "100")));
    return {
      endpoint: helpers.getFieldValue(block, "TLS_ENDPOINT") || "",
      region: helpers.getFieldValue(block, "TLS_REGION") || "cn-beijing",
      accessKeyId: helpers.getFieldValue(block, "TLS_AK"),
      secretAccessKey: helpers.getFieldValue(block, "TLS_SK"),
      sessionToken: helpers.getFieldValue(block, "TLS_SESSION_TOKEN"),
      topicId: helpers.getFieldValue(block, "TLS_TOPIC_ID"),
      defaultQuery: helpers.getFieldValue(block, "TLS_DEFAULT_QUERY") || "*",
      limit: lim,
      useApiV3: helpers.getBooleanField(block, "TLS_API_V3"),
      timeoutSec: Number(helpers.getFieldValue(block, "TLS_TIMEOUT_SEC") || "60"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.endpoint ?? ""), "TLS_ENDPOINT");
    block.setFieldValue(String(c.region ?? "cn-beijing"), "TLS_REGION");
    block.setFieldValue(String(c.accessKeyId ?? ""), "TLS_AK");
    block.setFieldValue(String(c.secretAccessKey ?? ""), "TLS_SK");
    block.setFieldValue(String(c.sessionToken ?? ""), "TLS_SESSION_TOKEN");
    block.setFieldValue(String(c.topicId ?? ""), "TLS_TOPIC_ID");
    block.setFieldValue(String(c.defaultQuery ?? "*"), "TLS_DEFAULT_QUERY");
    block.setFieldValue(String(c.limit ?? 100), "TLS_LIMIT");
    block.setFieldValue(c.useApiV3 ? "TRUE" : "FALSE", "TLS_API_V3");
    block.setFieldValue(String(c.timeoutSec ?? 60), "TLS_TIMEOUT_SEC");
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
