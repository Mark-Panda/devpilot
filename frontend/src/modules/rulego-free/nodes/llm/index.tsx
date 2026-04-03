/**
 * LLM 节点（后端类型 ai/llm）
 */

import React from 'react';
import type { RuleGoNodeRegistry } from '../../types';
import { ActionNodeType } from '../constants';
import { LlmConfigForm } from './LlmConfigForm';
import { LlmNodeRender } from './LlmNodeRender';
import type { LlmConfig } from './types';

export type { LlmConfig } from './types';

const defaultParams: LlmConfig['params'] = {
  temperature: 0.6,
  topP: 0.75,
  presencePenalty: 0,
  frequencyPenalty: 0,
  maxTokens: 2048,
  stop: [],
  responseFormat: 'text',
};

const formMeta = {
  render: () => <LlmNodeRender />,
};

/**
 * 与 Blockly getConfiguration 输出字段一致，便于后续 buildRuleGoDsl
 */
function toBackendConfiguration(data: LlmConfig): Record<string, unknown> {
  const models = Array.isArray(data.models) ? data.models.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  const primary = String(data.model ?? '').trim();
  const chain: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    if (!s || seen.has(s)) return;
    seen.add(s);
    chain.push(s);
  };
  add(primary);
  for (const x of models) add(x);

  return {
    url: String(data.url ?? '').trim(),
    key: String(data.key ?? '').trim(),
    model: chain.length > 0 ? chain[0] : primary,
    models: chain.length > 1 ? chain.slice(1) : [],
    systemPrompt: String(data.systemPrompt ?? '').trim(),
    messages: Array.isArray(data.messages)
      ? data.messages.map((m) => ({
          role: String(m?.role ?? 'user'),
          content: String(m?.content ?? ''),
        }))
      : [],
    params: {
      temperature: Number(data.params?.temperature ?? 0.6),
      topP: Number(data.params?.topP ?? 0.75),
      presencePenalty: Number(data.params?.presencePenalty ?? 0),
      frequencyPenalty: Number(data.params?.frequencyPenalty ?? 0),
      maxTokens: Number(data.params?.maxTokens ?? 0),
      stop: Array.isArray(data.params?.stop) ? data.params!.stop : [],
      responseFormat: String(data.params?.responseFormat ?? 'text'),
    },
    enabled_skill_names: Array.isArray(data.enabled_skill_names) ? data.enabled_skill_names : [],
  };
}

export const LlmRegistry: RuleGoNodeRegistry = {
  type: ActionNodeType.Llm,
  backendNodeType: 'ai/llm',
  category: 'action',
  info: {
    icon: '🤖',
    description: '大模型调用（OpenAI 兼容）',
  },
  meta: {
    size: { width: 300, height: 480 },
    defaultPorts: [
      { type: 'input', location: 'left', portID: 'input' },
      { type: 'output', location: 'right', portID: 'success' },
      { type: 'output', location: 'bottom', portID: 'failure' },
    ],
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },
  onAdd: () => ({
    data: {
      url: 'https://ai.gitee.com/v1',
      key: '',
      model: 'gpt-4o-mini',
      models: [],
      systemPrompt: '',
      messages: [{ role: 'user', content: '' }],
      params: { ...defaultParams },
      enabled_skill_names: [],
    } satisfies LlmConfig,
  }),
  /** 与 Blockly「块属性」、节点配置弹窗共用同一套表单 */
  renderConfigSidebar: LlmConfigForm,
  formMeta,
  serializeConfiguration: (data) => toBackendConfiguration(data as LlmConfig),
  deserializeConfiguration: (config) => ({ ...config }) as Record<string, unknown>,
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};
