/**
 * Sourcegraph 代码搜索：POST `/.api/graphql`，执行 search 查询。
 * 消息 data：纯文本搜索词，或 JSON `{"query":"repo:my/repo foo"}`；可与节点上的默认搜索词配合使用。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_sourcegraphSearch";
const nodeType = "sourcegraph/search";
const category = "rulego_sourcegraph" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("Sourcegraph 搜索"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("sg_search1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("https://sourcegraph.com"), "SG_ENDPOINT");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "SG_TOKEN");
        config.appendField(new (BlocklyF as any).FieldTextInput("30"), "SG_TIMEOUT_SEC");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "SG_DEFAULT_QUERY");
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

registerBlockType(def);
export default def;
