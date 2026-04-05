/**
 * 火山引擎 TLS 日志检索：调用 SearchLogs / SearchLogsV2。
 * 消息 data：可为检索语句字符串，或 JSON：
 * {"query":"*","tlsQuery":"与 query 等价","startTime":毫秒,"endTime":毫秒,"topicId":"可选",...}
 * 块配置 defaultQuery 支持 RuleGo 模板，如 ${msg.tlsQuery}、${metadata.xxx}（由后端 el 渲染）。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_volcTlsSearchLogs";
const nodeType = "volcTls/searchLogs";
const category = "rulego_action" as const;

/** 下拉选项：与后端 timeRangePreset 一致 */
export const VOLC_TLS_TIME_PRESET_OPTIONS: [string, string][] = [
  ["最近 15 分钟", "last_15m"],
  ["最近 30 分钟", "last_30m"],
  ["最近 1 小时", "last_1h"],
  ["最近 6 小时", "last_6h"],
  ["最近 24 小时", "last_24h"],
  ["最近 7 天", "last_7d"],
  ["今天 0 点起（本机时区）", "today_local"],
  ["自定义起止时间", "custom"],
];

export const VOLC_TLS_SORT_OPTIONS: [string, string][] = [
  ["时间从新到旧 (desc)", "desc"],
  ["时间从旧到新 (asc)", "asc"],
];

export const VOLC_TLS_LIMIT_OPTIONS: [string, string][] = [
  ["50 条", "50"],
  ["100 条", "100"],
  ["200 条", "200"],
  ["500 条", "500"],
];

/** 常用火山 Region，属性面板可选手动覆盖 */
export const VOLC_TLS_KNOWN_REGIONS: { label: string; value: string }[] = [
  { label: "华北2（北京）cn-beijing", value: "cn-beijing" },
  { label: "华东2（上海）cn-shanghai", value: "cn-shanghai" },
  { label: "华南1（广州）cn-guangzhou", value: "cn-guangzhou" },
  { label: "中国香港 cn-hongkong", value: "cn-hongkong" },
  { label: "亚太东南（柔佛）ap-southeast-1", value: "ap-southeast-1" },
  { label: "亚太东南（雅加达）ap-southeast-3", value: "ap-southeast-3" },
];

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
        config.appendField(new (BlocklyF as any).FieldDropdown(VOLC_TLS_TIME_PRESET_OPTIONS), "TLS_TIME_PRESET");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "TLS_CUSTOM_START_MS");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "TLS_CUSTOM_END_MS");
        config.appendField(new (BlocklyF as any).FieldTextInput("100"), "TLS_LIMIT");
        config.appendField(new (BlocklyF as any).FieldDropdown(VOLC_TLS_SORT_OPTIONS), "TLS_DEFAULT_SORT");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "TLS_HIGHLIGHT");
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
    const startMs = Math.max(0, Math.floor(Number(helpers.getFieldValue(block, "TLS_CUSTOM_START_MS") || "0")));
    const endMs = Math.max(0, Math.floor(Number(helpers.getFieldValue(block, "TLS_CUSTOM_END_MS") || "0")));
    let sort = String(helpers.getFieldValue(block, "TLS_DEFAULT_SORT") || "desc").toLowerCase();
    if (sort !== "asc" && sort !== "desc") sort = "desc";
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
      timeRangePreset: helpers.getFieldValue(block, "TLS_TIME_PRESET") || "last_15m",
      defaultStartTimeMs: startMs,
      defaultEndTimeMs: endMs,
      defaultSort: sort,
      highLight: helpers.getBooleanField(block, "TLS_HIGHLIGHT"),
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
    const preset = String(c.timeRangePreset ?? "last_15m").trim() || "last_15m";
    block.setFieldValue(preset, "TLS_TIME_PRESET");
    block.setFieldValue(
      c.defaultStartTimeMs != null && Number(c.defaultStartTimeMs) > 0 ? String(Math.floor(Number(c.defaultStartTimeMs))) : "",
      "TLS_CUSTOM_START_MS"
    );
    block.setFieldValue(
      c.defaultEndTimeMs != null && Number(c.defaultEndTimeMs) > 0 ? String(Math.floor(Number(c.defaultEndTimeMs))) : "",
      "TLS_CUSTOM_END_MS"
    );
    const lim = c.limit != null ? Number(c.limit) : 100;
    block.setFieldValue(String(Math.min(500, Math.max(1, lim || 100))), "TLS_LIMIT");
    let sort = String(c.defaultSort ?? "desc").toLowerCase();
    if (sort !== "asc" && sort !== "desc") sort = "desc";
    block.setFieldValue(sort, "TLS_DEFAULT_SORT");
    block.setFieldValue(Boolean(c.highLight) ? "TRUE" : "FALSE", "TLS_HIGHLIGHT");
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
