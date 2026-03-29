/**
 * API Route Tracer：Git 工作区准备（Sourcegraph 搜索见 blocks/sourcegraphSearch.ts；查询串拼装见 sourcegraphQueryBuild.ts）。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const category = "rulego_tracer" as const;

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

registerBlockType(gitDef);

export default gitDef;
