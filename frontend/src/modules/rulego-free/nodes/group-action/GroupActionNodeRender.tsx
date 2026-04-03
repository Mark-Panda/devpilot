/**
 * GroupAction：并行节点组（配置对齐 Blockly groupAction）
 */

import React, { useCallback } from 'react';
import { InputNumber, Select, Switch, TextArea } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { GroupActionConfig } from './types';

const Wrap = styled.div`
  width: 420px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #fdf4ff 0%, #fae8ff 100%);
  color: #581c87;
  border-radius: 10px;
  border: 1px solid #e9d5ff;
  font-size: 12px;
`;
const Title = styled.div`
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e9d5ff;
`;
const Row = styled.div`
  margin-bottom: 8px;
`;
const Lb = styled.div`
  font-size: 11px;
  margin-bottom: 4px;
  opacity: 0.9;
`;

function parseNodeIds(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      const v = JSON.parse(t) as unknown;
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fallthrough */
    }
  }
  return t
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function GroupActionNodeRender() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as GroupActionConfig;
  const patch = useCallback((p: Partial<GroupActionConfig>) => updateData({ ...d, ...p }), [d, updateData]);

  const nodeIdsText = Array.isArray(d.nodeIds) ? d.nodeIds.join(', ') : '';

  const onIdsChange = useCallback(
    (v: string) => {
      patch({ nodeIds: parseNodeIds(v) });
    },
    [patch]
  );

  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()} className="rulego-group-action-node">
      <Title>📦 节点组（groupAction）</Title>
      <div style={{ fontSize: 11, marginBottom: 8, opacity: 0.85 }}>
        nodeIds：逗号分隔或 JSON 数组，如 <code>n1,n2</code> 或 <code>[&quot;a&quot;,&quot;b&quot;]</code>
      </div>
      <Row>
        <Lb>nodeIds</Lb>
        <TextArea rows={4} value={nodeIdsText} onChange={onIdsChange} placeholder="node1, node2" />
      </Row>
      <Row>
        <Lb>matchRelationType</Lb>
        <Select
          size="small"
          value={d.matchRelationType ?? 'Success'}
          optionList={[
            { label: 'Success', value: 'Success' },
            { label: 'Failure', value: 'Failure' },
          ]}
          onChange={(v) => patch({ matchRelationType: String(v) as 'Success' | 'Failure' })}
        />
      </Row>
      <Row>
        <Lb>matchNum</Lb>
        <InputNumber value={d.matchNum ?? 0} min={0} max={99} onChange={(v) => patch({ matchNum: Number(v) ?? 0 })} />
      </Row>
      <Row>
        <Lb>timeout（秒）</Lb>
        <InputNumber value={d.timeout ?? 0} min={0} max={3600} onChange={(v) => patch({ timeout: Number(v) ?? 0 })} />
      </Row>
      <Row>
        <Switch checked={!!d.mergeToMap} onChange={(c) => patch({ mergeToMap: !!c })} /> mergeToMap
      </Row>
    </Wrap>
  );
}
