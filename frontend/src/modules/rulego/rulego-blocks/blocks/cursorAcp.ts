/**
 * Cursor ACP：通过 `agent acp` JSON-RPC 执行一次 Prompt。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const category = "rulego_tracer" as const;

/** 可执行文件：与配置模态共用选项 */
export const cursorAcpAgentPresetOptions = [
  { value: "path", label: "agent（系统 PATH）" },
  { value: "local", label: "~/.local/bin/agent（常见安装路径）" },
  { value: "custom", label: "自定义命令或路径…" },
] as const;

export const cursorAcpTimeoutPresetOptions = [
  { value: "300", label: "5 分钟（300 秒）" },
  { value: "900", label: "15 分钟（900 秒）" },
  { value: "1800", label: "30 分钟（1800 秒）" },
  { value: "3600", label: "60 分钟（3600 秒）" },
  { value: "7200", label: "120 分钟（7200 秒）" },
  { value: "custom", label: "自定义秒数…" },
] as const;

export const cursorAcpArgsPresetOptions = [
  { value: "default", label: "默认（仅 acp）" },
  { value: "k_acp", label: "-k + acp（与文档示例一致）" },
  { value: "custom", label: "自定义 JSON 数组…" },
] as const;

export const cursorAcpSessionModeOptions = [
  { value: "agent", label: "Agent（工具全开）" },
  { value: "plan", label: "Plan（只读规划）" },
  { value: "ask", label: "Ask（只读问答）" },
] as const;

export const cursorAcpPermissionOptions = [
  { value: "allow-once", label: "允许一次（allow-once）" },
  { value: "allow-always", label: "始终允许（allow-always）" },
  { value: "reject-once", label: "拒绝一次（reject-once）" },
] as const;

const LOCAL_AGENT_CMD = "~/.local/bin/agent";

function inferAgentPreset(agentCommand: string): string {
  const c = String(agentCommand ?? "").trim();
  if (c === "" || c === "agent") return "path";
  if (c === LOCAL_AGENT_CMD || c.endsWith("/.local/bin/agent")) return "local";
  return "custom";
}

function inferTimeoutPreset(sec: number): string {
  const s = String(sec);
  const known = ["300", "900", "1800", "3600", "7200"];
  return known.includes(s) ? s : "custom";
}

function argsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function inferArgsPreset(args: unknown): string {
  if (!Array.isArray(args)) return "default";
  const strs = args.map((x) => String(x));
  if (strs.length === 0) return "default";
  if (argsEqual(strs, ["-k", "acp"])) return "k_acp";
  return "custom";
}

const cursorAcpDef: BlockTypeDef = {
  blockType: "rulego_cursorAcp",
  nodeType: "cursor/acp",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const B = BlocklyF as any;
    blocks[cursorAcpDef.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new B.FieldTextInput("追踪·Cursor ACP"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new B.FieldTextInput("cursor_acp1"), "NODE_ID");
        config.appendField(
          new B.FieldDropdown(cursorAcpAgentPresetOptions.map((o) => [o.label, o.value] as [string, string])),
          "ACP_AGENT_PRESET",
        );
        config.appendField(new B.FieldTextInput("agent"), "AGENT_CMD");
        config.appendField(
          new B.FieldDropdown(cursorAcpTimeoutPresetOptions.map((o) => [o.label, o.value] as [string, string])),
          "ACP_TIMEOUT_PRESET",
        );
        config.appendField(new B.FieldTextInput("1800"), "TIMEOUT_SEC");
        config.appendField(new B.FieldTextInput(""), "WORK_DIR");
        config.appendField(new B.FieldTextInput(""), "ACP_MODEL");
        config.appendField(
          new B.FieldDropdown(cursorAcpSessionModeOptions.map((o) => [o.label, o.value] as [string, string])),
          "ACP_SESSION_MODE",
        );
        config.appendField(
          new B.FieldDropdown(cursorAcpPermissionOptions.map((o) => [o.label, o.value] as [string, string])),
          "PERM_OPTION",
        );
        config.appendField(
          new B.FieldDropdown(cursorAcpArgsPresetOptions.map((o) => [o.label, o.value] as [string, string])),
          "ACP_ARGS_PRESET",
        );
        config.appendField(new B.FieldTextInput("[]"), "ACP_ARGS_JSON");
        config.appendField(new B.FieldCheckbox(true), "ACP_VERBOSE_LOG");
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
    const preset = String(helpers.getFieldValue(block, "ACP_AGENT_PRESET") ?? "path");
    let agentCommand = "agent";
    if (preset === "local") {
      agentCommand = LOCAL_AGENT_CMD;
    } else if (preset === "custom") {
      agentCommand = String(helpers.getFieldValue(block, "AGENT_CMD") ?? "").trim() || "agent";
    }

    const tp = String(helpers.getFieldValue(block, "ACP_TIMEOUT_PRESET") ?? "1800");
    let timeoutSec = Number(helpers.getFieldValue(block, "TIMEOUT_SEC") || "1800");
    if (tp !== "custom") {
      timeoutSec = Number(tp) || 1800;
    }
    if (timeoutSec <= 0) timeoutSec = 1800;

    let args: string[] = [];
    const ap = String(helpers.getFieldValue(block, "ACP_ARGS_PRESET") ?? "default");
    if (ap === "k_acp") {
      args = ["-k", "acp"];
    } else if (ap === "custom") {
      const raw = String(helpers.getFieldValue(block, "ACP_ARGS_JSON") ?? "").trim() || "[]";
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          args = parsed.map((x) => String(x));
        }
      } catch {
        args = [];
      }
    }

    const sessionMode = String(helpers.getFieldValue(block, "ACP_SESSION_MODE") ?? "agent").trim() || "agent";

    return {
      agentCommand,
      args,
      timeoutSec,
      workDir: helpers.getFieldValue(block, "WORK_DIR"),
      model: String(helpers.getFieldValue(block, "ACP_MODEL") ?? "").trim(),
      sessionMode,
      permissionOptionId: helpers.getFieldValue(block, "PERM_OPTION") || "allow-once",
      verboseLog: helpers.getBooleanField(block, "ACP_VERBOSE_LOG"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    const cmd = String(c.agentCommand ?? "agent");
    const agentPreset = inferAgentPreset(cmd);
    block.setFieldValue(agentPreset, "ACP_AGENT_PRESET");
    block.setFieldValue(agentPreset === "custom" ? cmd : agentPreset === "path" ? "agent" : LOCAL_AGENT_CMD, "AGENT_CMD");

    const ts = Number(c.timeoutSec ?? 1800) || 1800;
    const tp = inferTimeoutPreset(ts);
    block.setFieldValue(tp, "ACP_TIMEOUT_PRESET");
    block.setFieldValue(String(ts), "TIMEOUT_SEC");

    block.setFieldValue(String(c.workDir ?? ""), "WORK_DIR");
    block.setFieldValue(String(c.model ?? ""), "ACP_MODEL");

    const sm = String(c.sessionMode ?? "agent").trim() || "agent";
    block.setFieldValue(["agent", "plan", "ask"].includes(sm) ? sm : "agent", "ACP_SESSION_MODE");

    const perm = String(c.permissionOptionId ?? "allow-once");
    block.setFieldValue(["allow-once", "allow-always", "reject-once"].includes(perm) ? perm : "allow-once", "PERM_OPTION");

    const args = Array.isArray(c.args) ? c.args.map((x: unknown) => String(x)) : [];
    const ap = inferArgsPreset(args);
    block.setFieldValue(ap, "ACP_ARGS_PRESET");
    block.setFieldValue(JSON.stringify(args.length > 0 ? args : []), "ACP_ARGS_JSON");
    block.setFieldValue(c.verboseLog === false ? "FALSE" : "TRUE", "ACP_VERBOSE_LOG");
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

registerBlockType(cursorAcpDef);

export default cursorAcpDef;
