import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_dbClient";
const nodeType = "dbClient";
const category = "rulego_db" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const Blockly = BlocklyF as {
      FieldTextInput: new (v: string) => { getValue: () => string };
      FieldDropdown: new (opts: [string, string][]) => { getValue: () => string };
      FieldCheckbox: new (v: boolean) => { getValue: () => boolean };
    };
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new Blockly.FieldTextInput("数据库客户端"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new Blockly.FieldTextInput("db1"), "NODE_ID");
        config.appendField(new Blockly.FieldTextInput("mysql"), "DB_DRIVER_NAME");
        config.appendField(new Blockly.FieldTextInput("root:root@tcp(127.0.0.1:3306)/test"), "DB_DSN");
        config.appendField(new Blockly.FieldTextInput("5"), "DB_POOL_SIZE");
        config.appendField(new Blockly.FieldTextInput(""), "DB_OP_TYPE");
        config.appendField(new Blockly.FieldTextInput("select * from users"), "DB_SQL");
        config.appendField(new Blockly.FieldTextInput("[]"), "DB_PARAMS");
        config.appendField(new Blockly.FieldCheckbox(false), "DB_GET_ONE");
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
    const paramsRaw = helpers.getFieldValue(block, "DB_PARAMS");
    let rawList: unknown[] = [];
    try {
      const parsed = helpers.parseJsonValue(paramsRaw, []);
      rawList = Array.isArray(parsed) ? parsed : [];
    } catch {
      rawList = [];
    }
    const params: unknown[] = rawList.map((item) => {
      if (item != null && typeof item === "object" && "type" in item && "value" in item) {
        const { type, value } = item as { type: string; value: string };
        const str = String(value ?? "").trim();
        if (type === "number") {
          if (/^\s*\$\{/.test(str)) return str;
          const n = Number(str);
          return Number.isFinite(n) ? n : str;
        }
        return str;
      }
      if (typeof item === "number") return item;
      return String(item ?? "");
    });
    const cfg: Record<string, unknown> = {
      driverName: helpers.getFieldValue(block, "DB_DRIVER_NAME") || "mysql",
      dsn: helpers.getFieldValue(block, "DB_DSN"),
      sql: helpers.getFieldValue(block, "DB_SQL"),
      params,
      getOne: helpers.getBooleanField(block, "DB_GET_ONE"),
    };
    const poolSize = parseInt(helpers.getFieldValue(block, "DB_POOL_SIZE"), 10);
    if (Number.isFinite(poolSize) && poolSize > 0) cfg.poolSize = poolSize;
    const opType = helpers.getFieldValue(block, "DB_OP_TYPE").trim();
    if (opType) cfg.opType = opType;
    return cfg;
  },
  setConfiguration(block, node, helpers) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.driverName ?? "mysql"), "DB_DRIVER_NAME");
    block.setFieldValue(String(c.dsn ?? ""), "DB_DSN");
    block.setFieldValue(String(c.poolSize ?? ""), "DB_POOL_SIZE");
    block.setFieldValue(String(c.opType ?? ""), "DB_OP_TYPE");
    block.setFieldValue(String(c.sql ?? ""), "DB_SQL");
    const paramList = Array.isArray(c.params) ? c.params : [];
    const stored = paramList.map((x) =>
      typeof x === "number"
        ? { type: "number", value: String(x) }
        : { type: "string", value: String(x ?? "") }
    );
    block.setFieldValue(JSON.stringify(stored), "DB_PARAMS");
    block.setFieldValue(Boolean(c.getOne) ? "TRUE" : "FALSE", "DB_GET_ONE");
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
