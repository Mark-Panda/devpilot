/**
 * Cursor Agent CLI（--print）：一次性非交互执行，不经 ACP。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";
import {
  cursorAcpAgentPresetOptions,
  cursorAcpTimeoutPresetOptions,
} from "./cursorAcp";

const category = "rulego_tracer" as const;

const LOCAL_AGENT_CMD = "~/.local/bin/agent";

const outputFormatOptions = [
  { value: "text", label: "text（纯文本）" },
  { value: "json", label: "json" },
  { value: "stream-json", label: "stream-json" },
] as const;

const cliModeOptions = [
  { value: "agent", label: "Agent（默认，可改代码）" },
  { value: "plan", label: "Plan（只读规划）" },
  { value: "ask", label: "Ask（只读问答）" },
] as const;

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

const cursorCliDef: BlockTypeDef = {
  blockType: "rulego_cursorCli",
  nodeType: "cursor/cli",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const B = BlocklyF as any;
    blocks[cursorCliDef.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new B.FieldTextInput("追踪·Cursor CLI"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new B.FieldTextInput("cursor_cli1"), "NODE_ID");
        config.appendField(
          new B.FieldDropdown(cursorAcpAgentPresetOptions.map((o) => [o.label, o.value] as [string, string])),
          "CLI_AGENT_PRESET",
        );
        config.appendField(new B.FieldTextInput("agent"), "CLI_AGENT_CMD");
        config.appendField(
          new B.FieldDropdown(cursorAcpTimeoutPresetOptions.map((o) => [o.label, o.value] as [string, string])),
          "CLI_TIMEOUT_PRESET",
        );
        config.appendField(new B.FieldTextInput("1800"), "TIMEOUT_SEC");
        config.appendField(new B.FieldTextInput(""), "WORK_DIR");
        config.appendField(new B.FieldTextInput(""), "CLI_MODEL");
        config.appendField(
          new B.FieldDropdown(cliModeOptions.map((o) => [o.label, o.value] as [string, string])),
          "CLI_MODE",
        );
        config.appendField(
          new B.FieldDropdown(outputFormatOptions.map((o) => [o.label, o.value] as [string, string])),
          "CLI_OUTPUT_FORMAT",
        );
        config.appendField(new B.FieldCheckbox(true), "CLI_TRUST");
        config.appendField(new B.FieldCheckbox(false), "CLI_FORCE");
        config.appendField(new B.FieldCheckbox(false), "CLI_STREAM_PARTIAL");
        config.appendField(new B.FieldTextInput("[]"), "CLI_EXTRA_ARGS_JSON");
        config.appendField(new B.FieldTextInput(""), "CLI_PROMPT_TEMPLATE");
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
    const preset = String(helpers.getFieldValue(block, "CLI_AGENT_PRESET") ?? "path");
    let agentCommand = "agent";
    if (preset === "local") {
      agentCommand = LOCAL_AGENT_CMD;
    } else if (preset === "custom") {
      agentCommand = String(helpers.getFieldValue(block, "CLI_AGENT_CMD") ?? "").trim() || "agent";
    }

    const tp = String(helpers.getFieldValue(block, "CLI_TIMEOUT_PRESET") ?? "1800");
    let timeoutSec = Number(helpers.getFieldValue(block, "TIMEOUT_SEC") || "1800");
    if (tp !== "custom") {
      timeoutSec = Number(tp) || 1800;
    }
    if (timeoutSec <= 0) timeoutSec = 1800;

    let extraArgs: string[] = [];
    const raw = String(helpers.getFieldValue(block, "CLI_EXTRA_ARGS_JSON") ?? "").trim() || "[]";
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        extraArgs = parsed.map((x) => String(x));
      }
    } catch {
      extraArgs = [];
    }

    const mode = String(helpers.getFieldValue(block, "CLI_MODE") ?? "agent").trim() || "agent";
    const outFmt = String(helpers.getFieldValue(block, "CLI_OUTPUT_FORMAT") ?? "text").trim() || "text";

    return {
      agentCommand,
      timeoutSec,
      workDir: helpers.getFieldValue(block, "WORK_DIR"),
      model: String(helpers.getFieldValue(block, "CLI_MODEL") ?? "").trim(),
      mode: ["agent", "plan", "ask"].includes(mode) ? mode : "agent",
      outputFormat: ["text", "json", "stream-json"].includes(outFmt) ? outFmt : "text",
      trust: helpers.getBooleanField(block, "CLI_TRUST"),
      force: helpers.getBooleanField(block, "CLI_FORCE"),
      streamPartialOutput: helpers.getBooleanField(block, "CLI_STREAM_PARTIAL"),
      extraArgs,
      promptTemplate: String(helpers.getFieldValue(block, "CLI_PROMPT_TEMPLATE") ?? ""),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    const cmd = String(c.agentCommand ?? "agent");
    const agentPreset = inferAgentPreset(cmd);
    block.setFieldValue(agentPreset, "CLI_AGENT_PRESET");
    block.setFieldValue(
      agentPreset === "custom" ? cmd : agentPreset === "path" ? "agent" : LOCAL_AGENT_CMD,
      "CLI_AGENT_CMD",
    );

    const ts = Number(c.timeoutSec ?? 1800) || 1800;
    const tp = inferTimeoutPreset(ts);
    block.setFieldValue(tp, "CLI_TIMEOUT_PRESET");
    block.setFieldValue(String(ts), "TIMEOUT_SEC");

    block.setFieldValue(String(c.workDir ?? ""), "WORK_DIR");
    block.setFieldValue(String(c.model ?? ""), "CLI_MODEL");

    const mode = String(c.mode ?? "agent").trim() || "agent";
    block.setFieldValue(["agent", "plan", "ask"].includes(mode) ? mode : "agent", "CLI_MODE");

    const of = String(c.outputFormat ?? "text").trim() || "text";
    block.setFieldValue(["text", "json", "stream-json"].includes(of) ? of : "text", "CLI_OUTPUT_FORMAT");

    block.setFieldValue(c.trust === false ? "FALSE" : "TRUE", "CLI_TRUST");
    block.setFieldValue(c.force === true ? "TRUE" : "FALSE", "CLI_FORCE");
    block.setFieldValue(c.streamPartialOutput === true ? "TRUE" : "FALSE", "CLI_STREAM_PARTIAL");

    const args = Array.isArray(c.extraArgs) ? c.extraArgs.map((x: unknown) => String(x)) : [];
    block.setFieldValue(JSON.stringify(args.length > 0 ? args : []), "CLI_EXTRA_ARGS_JSON");
    block.setFieldValue(String(c.promptTemplate ?? ""), "CLI_PROMPT_TEMPLATE");
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

registerBlockType(cursorCliDef);

export default cursorCliDef;
