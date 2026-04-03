/**
 * 复杂节点：用 JSON 文本编辑 configuration，与后端 DSL 对象一致
 */

import React, { useCallback } from 'react';
import { TextArea } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

const Wrap = styled.div`
  width: 420px;
  padding: 10px 12px 12px;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  font-size: 11px;
`;
const Title = styled.div`
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  color: #334155;
`;

export function JsonConfigForm({ title, hint }: { title: string; hint?: string }) {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { configJson?: string };
  const onChange = useCallback(
    (v: string) => {
      updateData({ ...d, configJson: v });
    },
    [d, updateData]
  );
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>{title}</Title>
      {hint ? <div style={{ marginBottom: 8, color: '#94a3b8', lineHeight: 1.45 }}>{hint}</div> : null}
      <TextArea
        rows={16}
        value={d.configJson ?? ''}
        onChange={onChange}
        style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
      />
    </Wrap>
  );
}

export function parseConfigJson(data: unknown): Record<string, unknown> {
  const raw = (data as { configJson?: string })?.configJson?.trim();
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function stringifyConfig(c: Record<string, unknown>): { configJson: string } {
  return { configJson: JSON.stringify(c, null, 2) };
}
