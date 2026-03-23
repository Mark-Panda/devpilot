/**
 * OpenSearch / Elasticsearch `_search`：POST JSON 检索日志。
 * 消息 data：空则用默认请求体；合法 JSON 对象则作为完整 _search 请求体；否则视为 query_string 的 query 文本。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_opensearchSearch";
const nodeType = "opensearch/search";
const category = "rulego_action" as const;

const defaultSearchBodyJson =
  '{"size":100,"sort":[{"@timestamp":{"order":"desc"}}],"query":{"match_all":{}}}';

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("OpenSearch 查日志"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("os_search1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("https://localhost:9200"), "OS_ENDPOINT");
        config.appendField(new (BlocklyF as any).FieldTextInput("logs-*"), "OS_INDEX");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "OS_USER");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "OS_PASS");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "OS_INSECURE");
        config.appendField(new (BlocklyF as any).FieldTextInput("60"), "OS_TIMEOUT_SEC");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "OS_DEFAULT_BODY");
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
    const raw = (helpers.getFieldValue(block, "OS_DEFAULT_BODY") ?? "").trim();
    const defaultSearchBody = raw && isValidJsonObject(raw) ? raw : defaultSearchBodyJson;
    return {
      endpoint: helpers.getFieldValue(block, "OS_ENDPOINT") || "https://localhost:9200",
      index: helpers.getFieldValue(block, "OS_INDEX") || "logs-*",
      username: helpers.getFieldValue(block, "OS_USER"),
      password: helpers.getFieldValue(block, "OS_PASS"),
      insecureSkipVerify: helpers.getBooleanField(block, "OS_INSECURE"),
      timeoutSec: Number(helpers.getFieldValue(block, "OS_TIMEOUT_SEC") || "60"),
      defaultSearchBody,
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.endpoint ?? "https://localhost:9200"), "OS_ENDPOINT");
    block.setFieldValue(String(c.index ?? "logs-*"), "OS_INDEX");
    block.setFieldValue(String(c.username ?? ""), "OS_USER");
    block.setFieldValue(String(c.password ?? ""), "OS_PASS");
    block.setFieldValue(c.insecureSkipVerify ? "TRUE" : "FALSE", "OS_INSECURE");
    block.setFieldValue(String(c.timeoutSec ?? 60), "OS_TIMEOUT_SEC");
    const body = c.defaultSearchBody != null ? String(c.defaultSearchBody) : "";
    block.setFieldValue(body, "OS_DEFAULT_BODY");
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

function isValidJsonObject(s: string): boolean {
  try {
    const v = JSON.parse(s) as unknown;
    return v !== null && typeof v === "object" && !Array.isArray(v);
  } catch {
    return false;
  }
}

registerBlockType(def);
export default def;
