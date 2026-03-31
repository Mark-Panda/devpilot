/**
 * Cursor ACP Agent Step：单次 session/prompt，供规则链多节点串联（与 cursor/acp_agent_step 对应）。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";
import {
  cursorAcpAgentPresetOptions,
  cursorAcpArgsPresetOptions,
  cursorAcpPermissionOptions,
  cursorAcpSessionModeOptions,
  cursorAcpTimeoutPresetOptions,
} from "./cursorAcp";
import { cursorAcpElicitationUrlOptions } from "./cursorAcpAgent";

const category = "rulego_tracer" as const;

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

const cursorAcpAgentStepDef: BlockTypeDef = {
  blockType: "rulego_cursorAcpAgentStep",
  nodeType: "cursor/acp_agent_step",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const B = BlocklyF as any;
    blocks[cursorAcpAgentStepDef.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new B.FieldTextInput("追踪·ACP Agent 单步"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new B.FieldTextInput("cursor_acp_agent_step1"), "NODE_ID");
        config.appendField(
          new B.FieldDropdown(cursorAcpAgentPresetOptions.map((o) => [o.label, o.value] as [string, string])),
          "ACP_AGENT_PRESET",
        );
        config.appendField(new B.FieldTextInput("agent"), "AGENT_CMD");
        config.appendField(
          new B.FieldDropdown(cursorAcpTimeoutPresetOptions.map((o) => [o.label, o.value] as [string, string])),
          "ACP_TIMEOUT_PRESET",
        );
        config.appendField(new B.FieldTextInput("3600"), "TIMEOUT_SEC");
        config.appendField(new B.FieldTextInput(""), "WORK_DIR");
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
        config.appendField(new B.FieldCheckbox(false), "USE_ASK_QUESTION_DIALOG");
        config.appendField(new B.FieldTextInput("approve"), "AUTO_PLAN_OPTION_ID");
        config.appendField(new B.FieldTextInput("0"), "AUTO_ASK_OPTION_INDEX");
        config.appendField(
          new B.FieldDropdown(cursorAcpElicitationUrlOptions.map((o) => [o.label, o.value] as [string, string])),
          "ELICIT_URL_ACTION",
        );
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

    const tp = String(helpers.getFieldValue(block, "ACP_TIMEOUT_PRESET") ?? "3600");
    let timeoutSec = Number(helpers.getFieldValue(block, "TIMEOUT_SEC") || "3600");
    if (tp !== "custom") {
      timeoutSec = Number(tp) || 3600;
    }
    if (timeoutSec <= 0) timeoutSec = 3600;

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

    const askIdx = parseInt(String(helpers.getFieldValue(block, "AUTO_ASK_OPTION_INDEX") ?? "0"), 10);
    const elicitUrl = String(helpers.getFieldValue(block, "ELICIT_URL_ACTION") ?? "decline").trim() || "decline";

    return {
      agentCommand,
      args,
      timeoutSec,
      workDir: helpers.getFieldValue(block, "WORK_DIR"),
      sessionMode,
      permissionOptionId: helpers.getFieldValue(block, "PERM_OPTION") || "allow-once",
      useAskQuestionDialog: helpers.getBooleanField(block, "USE_ASK_QUESTION_DIALOG"),
      autoPlanOptionId: helpers.getFieldValue(block, "AUTO_PLAN_OPTION_ID") || "approve",
      autoAskQuestionOptionIndex: Number.isFinite(askIdx) ? askIdx : 0,
      elicitationUrlAction: elicitUrl,
      verboseLog: helpers.getBooleanField(block, "ACP_VERBOSE_LOG"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    const cmd = String(c.agentCommand ?? "agent");
    const agentPreset = inferAgentPreset(cmd);
    block.setFieldValue(agentPreset, "ACP_AGENT_PRESET");
    block.setFieldValue(agentPreset === "custom" ? cmd : agentPreset === "path" ? "agent" : LOCAL_AGENT_CMD, "AGENT_CMD");

    const ts = Number(c.timeoutSec ?? 3600) || 3600;
    const tp = inferTimeoutPreset(ts);
    block.setFieldValue(tp, "ACP_TIMEOUT_PRESET");
    block.setFieldValue(String(ts), "TIMEOUT_SEC");

    block.setFieldValue(String(c.workDir ?? ""), "WORK_DIR");

    const sm = String(c.sessionMode ?? "agent").trim() || "agent";
    block.setFieldValue(["agent", "plan", "ask"].includes(sm) ? sm : "agent", "ACP_SESSION_MODE");

    const perm = String(c.permissionOptionId ?? "allow-once");
    block.setFieldValue(["allow-once", "allow-always", "reject-once"].includes(perm) ? perm : "allow-once", "PERM_OPTION");
    block.setFieldValue(c.useAskQuestionDialog === true ? "TRUE" : "FALSE", "USE_ASK_QUESTION_DIALOG");

    const args = Array.isArray(c.args) ? c.args.map((x: unknown) => String(x)) : [];
    const ap = inferArgsPreset(args);
    block.setFieldValue(ap, "ACP_ARGS_PRESET");
    block.setFieldValue(JSON.stringify(args.length > 0 ? args : []), "ACP_ARGS_JSON");

    block.setFieldValue(String(c.autoPlanOptionId ?? "approve"), "AUTO_PLAN_OPTION_ID");
    const aidx = Number(c.autoAskQuestionOptionIndex ?? 0);
    block.setFieldValue(String(Number.isFinite(aidx) ? aidx : 0), "AUTO_ASK_OPTION_INDEX");
    const eu = String(c.elicitationUrlAction ?? "decline");
    block.setFieldValue(["decline", "accept", "cancel"].includes(eu) ? eu : "decline", "ELICIT_URL_ACTION");
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

registerBlockType(cursorAcpAgentStepDef);

export default cursorAcpAgentStepDef;
