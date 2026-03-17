/**
 * 大模型节点（ai/llm）：兼容 RuleGo 官方 LLM 配置，见 https://rulego.cc/pages/llm/
 * 使用 backend/internal/llm（langchaingo），支持 skill_dir、mcp 扩展。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_llm";
const nodeType = "ai/llm";
const category = "rulego_action" as const;

const defaultMessagesJson = "[]";
const defaultParamsJson = "{\"temperature\":0.6,\"topP\":0.75,\"maxTokens\":0,\"responseFormat\":\"text\"}";

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block) {
        (this as Block)
          .appendDummyInput("HEAD")
          .appendField(new (BlocklyF as any).FieldTextInput("大模型 LLM"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("llm1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("https://ai.gitee.com/v1"), "LLM_URL");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "LLM_KEY");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "LLM_MODEL");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "LLM_SYSTEM_PROMPT");
        config.appendField(new (BlocklyF as any).FieldTextInput(defaultMessagesJson), "LLM_MESSAGES_JSON");
        config.appendField(new (BlocklyF as any).FieldTextInput(defaultParamsJson), "LLM_PARAMS_JSON");
        config.appendField(new (BlocklyF as any).FieldTextInput("[]"), "LLM_ENABLED_SKILLS_JSON");
        config.appendField(new (BlocklyF as any).FieldCheckbox(false), "DEBUG");
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
    const url = helpers.getFieldValue(block, "LLM_URL") || "https://ai.gitee.com/v1";
    const key = helpers.getFieldValue(block, "LLM_KEY");
    const model = helpers.getFieldValue(block, "LLM_MODEL");
    const systemPrompt = helpers.getFieldValue(block, "LLM_SYSTEM_PROMPT");
    const messages = helpers.parseJsonValue(helpers.getFieldValue(block, "LLM_MESSAGES_JSON"), []) as Array<{ role?: string; content?: string }>;
    const paramsRaw = helpers.parseJsonValue(helpers.getFieldValue(block, "LLM_PARAMS_JSON"), {}) as Record<string, unknown>;
    const params = {
      temperature: Number(paramsRaw?.temperature ?? 0),
      topP: Number(paramsRaw?.topP ?? 0),
      presencePenalty: Number(paramsRaw?.presencePenalty ?? 0),
      frequencyPenalty: Number(paramsRaw?.frequencyPenalty ?? 0),
      maxTokens: Number(paramsRaw?.maxTokens ?? 0),
      stop: Array.isArray(paramsRaw?.stop) ? (paramsRaw.stop as string[]) : undefined,
      responseFormat: String(paramsRaw?.responseFormat ?? "text"),
      jsonSchema: typeof paramsRaw?.jsonSchema === "string" ? paramsRaw.jsonSchema : undefined,
      keepThink: Boolean(paramsRaw?.keepThink),
    };
    const enabledSkillNamesRaw = helpers.getFieldValue(block, "LLM_ENABLED_SKILLS_JSON") || "[]";
    const enabledSkillNames = helpers.parseJsonValue(enabledSkillNamesRaw, []) as string[];
    return {
      url: url.trim(),
      key: key.trim(),
      model: model.trim(),
      systemPrompt: systemPrompt.trim(),
      messages: Array.isArray(messages) ? messages.map((m) => ({ role: String(m?.role ?? "user"), content: String(m?.content ?? "") })) : [],
      params,
      enabled_skill_names: Array.isArray(enabledSkillNames) ? enabledSkillNames : [],
    };
  },
  setConfiguration(block, node, helpers) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.url ?? "https://ai.gitee.com/v1"), "LLM_URL");
    block.setFieldValue(String(c.key ?? ""), "LLM_KEY");
    block.setFieldValue(String(c.model ?? ""), "LLM_MODEL");
    block.setFieldValue(String(c.systemPrompt ?? ""), "LLM_SYSTEM_PROMPT");
    const messages = (c.messages as Array<{ role?: string; content?: string }>) ?? [];
    block.setFieldValue(JSON.stringify(messages, null, 2), "LLM_MESSAGES_JSON");
    const p = (c.params as Record<string, unknown>) ?? {};
    const paramsJson = JSON.stringify(
      {
        temperature: Number(p.temperature ?? 0),
        topP: Number(p.topP ?? 0.75),
        presencePenalty: Number(p.presencePenalty ?? 0),
        frequencyPenalty: Number(p.frequencyPenalty ?? 0),
        maxTokens: Number(p.maxTokens ?? 0),
        stop: p.stop ?? null,
        responseFormat: String(p.responseFormat ?? "text"),
        jsonSchema: p.jsonSchema ?? "",
        keepThink: Boolean(p.keepThink),
      },
      null,
      2
    );
    block.setFieldValue(paramsJson, "LLM_PARAMS_JSON");
    const enabled = (c.enabled_skill_names as string[] | undefined) ?? [];
    block.setFieldValue(JSON.stringify(Array.isArray(enabled) ? enabled : []), "LLM_ENABLED_SKILLS_JSON");
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
