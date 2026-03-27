/**
 * API Route Tracer：Git 与 Sourcegraph 搜索（Router 查询请用 restApiCall + jsTransform 写入 metadata.trace_url）。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const category = "rulego_tracer" as const;

const sourcegraphDef: BlockTypeDef = {
  blockType: "rulego_sourcegraphSearch",
  nodeType: "sourcegraph/search",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[sourcegraphDef.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("Sourcegraph 搜索"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("sg_search1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("https://sourcegraph.com"), "SG_ENDPOINT");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "SG_TOKEN");
        config.appendField(new (BlocklyF as any).FieldTextInput("30"), "SG_TIMEOUT_SEC");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "SG_DEFAULT_QUERY");
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
      endpoint: helpers.getFieldValue(block, "SG_ENDPOINT") || "https://sourcegraph.com",
      accessToken: helpers.getFieldValue(block, "SG_TOKEN"),
      timeoutSec: Number(helpers.getFieldValue(block, "SG_TIMEOUT_SEC") || "30"),
      defaultSearchQuery: helpers.getFieldValue(block, "SG_DEFAULT_QUERY"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.endpoint ?? "https://sourcegraph.com"), "SG_ENDPOINT");
    block.setFieldValue(String(c.accessToken ?? ""), "SG_TOKEN");
    block.setFieldValue(String(c.timeoutSec ?? 30), "SG_TIMEOUT_SEC");
    block.setFieldValue(String(c.defaultSearchQuery ?? ""), "SG_DEFAULT_QUERY");
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

const gitDef: BlockTypeDef = {
  blockType: "rulego_apiRouteTracer_gitPrepare",
  nodeType: "apiRouteTracer/gitPrepare",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[gitDef.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("追踪·Git 工作区"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("trace_git1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "WORK_DIR");
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
      workDir: helpers.getFieldValue(block, "WORK_DIR"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.workDir ?? ""), "WORK_DIR");
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

registerBlockType(sourcegraphDef);
registerBlockType(gitDef);

export default gitDef;
