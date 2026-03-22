/**
 * RuleGo 文件组件（rulego-components x/file*）：读/写/删/列目录。
 * 路径支持模板；相对路径相对规则链 context 中的 workDir；安全依赖节点 properties.filePathWhitelist。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const category = "rulego_file" as const;

const branchFailure = {
  getConnectionBranches() {
    return [
      { inputName: "__next__", connectionType: "Success" },
      { inputName: "branch_failure", connectionType: "Failure" },
    ];
  },
  getInputNameForConnectionType(type: string) {
    return type === "Failure" ? "branch_failure" : undefined;
  },
  getWalkInputs() {
    return ["__next__", "branch_failure"];
  },
  defaultConnectionType: "Success" as const,
};

const fileRead: BlockTypeDef = {
  blockType: "rulego_fileRead",
  nodeType: "x/fileRead",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as {
      FieldTextInput: new (v: string) => unknown;
      FieldDropdown: new (opts: [string, string][]) => unknown;
      FieldCheckbox: new (v: boolean) => unknown;
    };
    blocks[fileRead.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("读文件"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("fileRead1"), "NODE_ID");
        config.appendField(new F.FieldTextInput("/tmp/data.txt"), "FILE_PATH");
        config.appendField(new F.FieldDropdown([["文本", "text"], ["Base64", "base64"]]), "FILE_DATA_TYPE");
        config.appendField(new F.FieldCheckbox(false), "FILE_RECURSIVE");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      path: helpers.getFieldValue(block, "FILE_PATH"),
      dataType: helpers.getFieldValue(block, "FILE_DATA_TYPE") || "text",
      recursive: helpers.getBooleanField(block, "FILE_RECURSIVE"),
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.path ?? "/tmp/data.txt"), "FILE_PATH");
    block.setFieldValue(String(c.dataType ?? "text"), "FILE_DATA_TYPE");
    block.setFieldValue(Boolean(c.recursive) ? "TRUE" : "FALSE", "FILE_RECURSIVE");
  },
  ...branchFailure,
};

const fileWrite: BlockTypeDef = {
  blockType: "rulego_fileWrite",
  nodeType: "x/fileWrite",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as {
      FieldTextInput: new (v: string) => unknown;
      FieldCheckbox: new (v: boolean) => unknown;
    };
    blocks[fileWrite.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("写文件"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("fileWrite1"), "NODE_ID");
        config.appendField(new F.FieldTextInput("/tmp/out.txt"), "FILE_PATH");
        config.appendField(new F.FieldTextInput("${data}"), "FILE_CONTENT");
        config.appendField(new F.FieldCheckbox(false), "FILE_APPEND");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      path: helpers.getFieldValue(block, "FILE_PATH"),
      content: helpers.getFieldValue(block, "FILE_CONTENT"),
      append: helpers.getBooleanField(block, "FILE_APPEND"),
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.path ?? "/tmp/out.txt"), "FILE_PATH");
    block.setFieldValue(String(c.content ?? "${data}"), "FILE_CONTENT");
    block.setFieldValue(Boolean(c.append) ? "TRUE" : "FALSE", "FILE_APPEND");
  },
  ...branchFailure,
};

const fileDelete: BlockTypeDef = {
  blockType: "rulego_fileDelete",
  nodeType: "x/fileDelete",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as { FieldTextInput: new (v: string) => unknown };
    blocks[fileDelete.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("删文件"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("fileDel1"), "NODE_ID");
        config.appendField(new F.FieldTextInput("/tmp/data.txt"), "FILE_PATH");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return { path: helpers.getFieldValue(block, "FILE_PATH") };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.path ?? "/tmp/data.txt"), "FILE_PATH");
  },
  ...branchFailure,
};

const fileList: BlockTypeDef = {
  blockType: "rulego_fileList",
  nodeType: "x/fileList",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as {
      FieldTextInput: new (v: string) => unknown;
      FieldCheckbox: new (v: boolean) => unknown;
    };
    blocks[fileList.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("列文件"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("fileList1"), "NODE_ID");
        config.appendField(new F.FieldTextInput("/tmp/*.txt"), "FILE_PATH");
        config.appendField(new F.FieldCheckbox(false), "FILE_RECURSIVE");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      path: helpers.getFieldValue(block, "FILE_PATH"),
      recursive: helpers.getBooleanField(block, "FILE_RECURSIVE"),
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.path ?? "/tmp/*.txt"), "FILE_PATH");
    block.setFieldValue(Boolean(c.recursive) ? "TRUE" : "FALSE", "FILE_RECURSIVE");
  },
  ...branchFailure,
};

registerBlockType(fileRead);
registerBlockType(fileWrite);
registerBlockType(fileDelete);
registerBlockType(fileList);

export default { fileRead, fileWrite, fileDelete, fileList };
