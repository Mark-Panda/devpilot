/**
 * LLM 节点数据：与 Blockly `rulego-blocks/blocks/llm.ts` 的 getConfiguration 对齐
 */

export interface LlmMessage {
  role: string;
  content: string;
}

export interface LlmParams {
  temperature: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
  maxTokens: number;
  stop?: string[];
  responseFormat: string;
}

export interface LlmConfig {
  url: string;
  key: string;
  model: string;
  /** 额外表模型（Blockly 中 models 为除主模型外的列表） */
  models: string[];
  systemPrompt: string;
  messages: LlmMessage[];
  params: LlmParams;
  enabled_skill_names: string[];
}
