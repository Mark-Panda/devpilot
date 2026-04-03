/**
 * LLM 配置表单（供弹窗 / 侧栏与画布共用，字段与 Blockly llm 块一致）
 */

import React, { useCallback } from 'react';
import { Input, InputNumber, TextArea, Select } from '@douyinfe/semi-ui';
import styled from 'styled-components';

import type { RuleGoConfigSidebarRenderProps } from '../../types';
import { mergeRuleGoNodeData } from '../../utils/mergeRuleGoNodeData';
import type { LlmConfig } from './types';

const Wrap = styled.div`
  width: 100%;
  max-width: 560px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #1e1b4b 0%, #312e81 100%);
  color: #f8fafc;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(49, 46, 129, 0.35);
  font-size: 12px;
`;

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
`;

const Row = styled.div`
  margin-bottom: 8px;
`;

const Label = styled.div`
  margin-bottom: 4px;
  opacity: 0.85;
  font-size: 11px;
`;

const MODEL_OPTIONS = [
  { label: 'gpt-4o', value: 'gpt-4o' },
  { label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
  { label: 'gpt-4-turbo', value: 'gpt-4-turbo' },
  { label: 'gpt-3.5-turbo', value: 'gpt-3.5-turbo' },
  { label: 'deepseek-chat', value: 'deepseek-chat' },
];

const SKILL_OPTIONS = [
  { label: 'mcp', value: 'mcp' },
  { label: 'filesystem', value: 'filesystem' },
  { label: 'git', value: 'git' },
  { label: 'web_search', value: 'web_search' },
];

function getUserMessageContent(messages: LlmConfig['messages']): string {
  const m = messages?.find((x) => x.role === 'user');
  return m?.content ?? '';
}

function setUserMessageContent(messages: LlmConfig['messages'], content: string): LlmConfig['messages'] {
  const list = Array.isArray(messages) ? [...messages] : [];
  const idx = list.findIndex((x) => x.role === 'user');
  if (idx >= 0) {
    list[idx] = { ...list[idx], role: 'user', content };
  } else {
    list.push({ role: 'user', content });
  }
  return list;
}

export function LlmConfigForm({ data: raw, onApplyPatch }: RuleGoConfigSidebarRenderProps) {
  const data = raw as LlmConfig;

  const patch = useCallback(
    (partial: Partial<LlmConfig>) => {
      const cur = raw as Record<string, unknown>;
      onApplyPatch(mergeRuleGoNodeData(cur, partial as Record<string, unknown>));
    },
    [raw, onApplyPatch]
  );

  const patchParams = useCallback(
    (partial: Partial<LlmConfig['params']>) => {
      patch({
        params: {
          temperature: Number(data?.params?.temperature ?? 0.6),
          topP: Number(data?.params?.topP ?? 0.75),
          presencePenalty: Number(data?.params?.presencePenalty ?? 0),
          frequencyPenalty: Number(data?.params?.frequencyPenalty ?? 0),
          maxTokens: Number(data?.params?.maxTokens ?? 0),
          stop: Array.isArray(data?.params?.stop) ? data.params!.stop : [],
          responseFormat: String(data?.params?.responseFormat ?? 'text'),
          ...partial,
        },
      });
    },
    [data, patch]
  );

  const userPrompt = getUserMessageContent(data?.messages);
  const modelQuick = MODEL_OPTIONS.some((o) => o.value === data?.model) ? data?.model : '';

  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>
        <span aria-hidden>🤖</span>
        <span>大模型 LLM</span>
      </Title>

      <Row>
        <Label>API URL</Label>
        <Input
          size="small"
          value={data?.url ?? ''}
          onChange={(v) => patch({ url: String(v) })}
          placeholder="https://..."
        />
      </Row>

      <Row>
        <Label>API Key</Label>
        <Input
          size="small"
          mode="password"
          value={data?.key ?? ''}
          onChange={(v) => patch({ key: String(v) })}
          placeholder="可选"
        />
      </Row>

      <Row>
        <Label>快速选择模型</Label>
        <Select
          size="small"
          style={{ width: '100%' }}
          value={modelQuick || undefined}
          optionList={MODEL_OPTIONS}
          placeholder="选择常用模型"
          showClear
          onChange={(v) => patch({ model: String(v ?? '') })}
        />
      </Row>

      <Row>
        <Label>模型 ID（可编辑）</Label>
        <Input
          size="small"
          value={data?.model ?? ''}
          onChange={(v) => patch({ model: String(v) })}
          placeholder="例如 gpt-4o-mini"
        />
      </Row>

      <Row style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Label>温度</Label>
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            min={0}
            max={2}
            step={0.05}
            value={data?.params?.temperature ?? 0.6}
            onNumberChange={(v) => patchParams({ temperature: typeof v === 'number' ? v : 0.6 })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Max Tokens</Label>
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            min={0}
            max={128000}
            step={256}
            value={data?.params?.maxTokens ?? 0}
            onNumberChange={(v) => patchParams({ maxTokens: typeof v === 'number' ? v : 0 })}
          />
        </div>
      </Row>

      <Row>
        <Label>系统 Prompt</Label>
        <TextArea
          rows={2}
          value={data?.systemPrompt ?? ''}
          onChange={(v) => patch({ systemPrompt: String(v) })}
          placeholder="System 指令"
        />
      </Row>

      <Row>
        <Label>用户 Prompt</Label>
        <TextArea
          rows={3}
          value={userPrompt}
          onChange={(v) => patch({ messages: setUserMessageContent(data?.messages, String(v)) })}
          placeholder="用户消息（messages 中 role=user）"
        />
      </Row>

      <Row>
        <Label>启用技能（多选）</Label>
        <Select
          multiple
          filter
          maxTagCount={3}
          style={{ width: '100%' }}
          value={data?.enabled_skill_names ?? []}
          optionList={SKILL_OPTIONS}
          placeholder="选择技能标识"
          onChange={(v) => patch({ enabled_skill_names: (v as string[]) ?? [] })}
        />
      </Row>
    </Wrap>
  );
}
