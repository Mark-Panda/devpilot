/**
 * 执行本地命令（exec）：RuleGo 内置动作，通过 sh -c 执行整段 shell（如 cd 目录后启动 cursor）。
 * 元数据 metadata.workDir 可设置子进程工作目录（RuleGo 约定）。
 * 脚本中支持 ${metadata.xxx}、${msg.xxx} 模板变量。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_execCommand";
const nodeType = "exec";
const category = "rulego_action" as const;

const defaultShellScript = "cd /path/to/project && cursor a.v";

function parseExecConfig(c: Record<string, unknown>): string {
  const cmd = String(c.cmd ?? "").trim();
  const args = Array.isArray(c.args) ? c.args : [];
  if (cmd === "sh" && args.length >= 2 && String(args[0]) === "-c") {
    return String(args[1] ?? "");
  }
  if (cmd === "/bin/sh" && args.length >= 2 && String(args[0]) === "-c") {
    return String(args[1] ?? "");
  }
  if (cmd && args.length > 0) {
    return [cmd, ...args.map((a) => String(a))].join(" ");
  }
  if (cmd) return cmd;
  return defaultShellScript;
}

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("执行命令"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("exec1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(defaultShellScript), "EXEC_SHELL_SCRIPT");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "EXEC_LOG");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "EXEC_REPLACE_DATA");
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
    const script = (helpers.getFieldValue(block, "EXEC_SHELL_SCRIPT") || defaultShellScript).trim() || defaultShellScript;
    return {
      cmd: "sh",
      args: ["-c", script],
      log: helpers.getBooleanField(block, "EXEC_LOG"),
      replaceData: helpers.getBooleanField(block, "EXEC_REPLACE_DATA"),
    };
  },
  setConfiguration(block, node) {
    const c = (node.configuration ?? {}) as Record<string, unknown>;
    const script = parseExecConfig(c);
    block.setFieldValue(script || defaultShellScript, "EXEC_SHELL_SCRIPT");
    block.setFieldValue(c.log === true ? "TRUE" : "FALSE", "EXEC_LOG");
    block.setFieldValue(c.replaceData === true ? "TRUE" : "FALSE", "EXEC_REPLACE_DATA");
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
