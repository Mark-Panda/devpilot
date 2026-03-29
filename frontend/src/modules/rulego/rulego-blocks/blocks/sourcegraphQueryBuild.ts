/**
 * Sourcegraph 查询串构建（API Route Tracer）：按前后端仓库范围拼接与 Python trace 脚本一致的查询，供下游 sourcegraph/search 使用。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";
import {
  DEFAULT_SOURCEGRAPH_REPO_BACKEND,
  DEFAULT_SOURCEGRAPH_REPO_FRONTEND,
} from "../../sourcegraph/buildTracerSourcegraphQuery";

const blockType = "rulego_sourcegraphQueryBuild";
const nodeType = "sourcegraph/queryBuild";
const category = "rulego_tracer" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("Sourcegraph·查询构建"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("sg_query_build1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("literal"), "SGQB_DEFAULT_PATTERN_TYPE");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "SGQB_DEFAULT_PATTERNS");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "SGQB_REPO_SCOPE");
        config.appendField(new (BlocklyF as any).FieldTextInput(DEFAULT_SOURCEGRAPH_REPO_FRONTEND), "SGQB_REPO_FRONTEND");
        config.appendField(new (BlocklyF as any).FieldTextInput(DEFAULT_SOURCEGRAPH_REPO_BACKEND), "SGQB_REPO_BACKEND");
        config.appendField(new (BlocklyF as any).FieldTextInput("TRUE"), "SGQB_CONTEXT_GLOBAL");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "SGQB_TYPE_FILTER");
        config.appendField(new (BlocklyF as any).FieldTextInput("TRUE"), "SGQB_INCLUDE_FORKED");
        config.appendField(new (BlocklyF as any).FieldTextInput("1500"), "SGQB_DISPLAY_LIMIT");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block, helpers: BlockHelpers) {
    const ctx = helpers.getBooleanField(block, "SGQB_CONTEXT_GLOBAL");
    const fork = helpers.getBooleanField(block, "SGQB_INCLUDE_FORKED");
    return {
      defaultPatternType: helpers.getFieldValue(block, "SGQB_DEFAULT_PATTERN_TYPE") || "literal",
      defaultPatterns: helpers.getFieldValue(block, "SGQB_DEFAULT_PATTERNS"),
      repoScope: helpers.getFieldValue(block, "SGQB_REPO_SCOPE"),
      repoFrontend: helpers.getFieldValue(block, "SGQB_REPO_FRONTEND"),
      repoBackend: helpers.getFieldValue(block, "SGQB_REPO_BACKEND"),
      contextGlobal: ctx ? "true" : "false",
      typeFilter: helpers.getFieldValue(block, "SGQB_TYPE_FILTER"),
      includeForked: fork ? "true" : "false",
      displayLimit: helpers.getFieldValue(block, "SGQB_DISPLAY_LIMIT") || "1500",
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    const dpt = String(c.defaultPatternType ?? "literal").trim().toLowerCase();
    block.setFieldValue(dpt === "regexp" ? "regexp" : "literal", "SGQB_DEFAULT_PATTERN_TYPE");
    block.setFieldValue(String(c.defaultPatterns ?? ""), "SGQB_DEFAULT_PATTERNS");
    const scope = String(c.repoScope ?? "").trim();
    block.setFieldValue(scope, "SGQB_REPO_SCOPE");
    block.setFieldValue(String(c.repoFrontend ?? DEFAULT_SOURCEGRAPH_REPO_FRONTEND), "SGQB_REPO_FRONTEND");
    block.setFieldValue(String(c.repoBackend ?? DEFAULT_SOURCEGRAPH_REPO_BACKEND), "SGQB_REPO_BACKEND");
    const cg = String(c.contextGlobal ?? "true").toLowerCase();
    block.setFieldValue(cg === "false" || cg === "0" ? "FALSE" : "TRUE", "SGQB_CONTEXT_GLOBAL");
    block.setFieldValue(String(c.typeFilter ?? ""), "SGQB_TYPE_FILTER");
    const inc = String(c.includeForked ?? "true").toLowerCase();
    block.setFieldValue(inc === "false" || inc === "0" ? "FALSE" : "TRUE", "SGQB_INCLUDE_FORKED");
    block.setFieldValue(String(c.displayLimit ?? "1500"), "SGQB_DISPLAY_LIMIT");
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
