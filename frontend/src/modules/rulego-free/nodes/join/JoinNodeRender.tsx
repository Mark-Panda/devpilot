/**
 * Join：超时、合并到 Map；额外入边在 extraIncomings 中展示
 */

import React, { useCallback } from 'react';
import { InputNumber, Switch, Space } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { JoinConfig } from './types';

const Wrap = styled.div`
  width: 360px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #ecfeff 0%, #e0f2fe 100%);
  color: #0c4a6e;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.18);
  border: 1px solid rgba(2, 132, 199, 0.28);
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
  border-bottom: 1px solid rgba(3, 105, 161, 0.25);
  color: #0369a1;
`;

const Row = styled.div`
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

export function JoinNodeRender() {
  const { data, updateData } = useNodeRender();
  const cfg = (data ?? {}) as JoinConfig;
  const timeout = Number(cfg.timeout ?? 0);
  const mergeToMap = Boolean(cfg.mergeToMap);
  const extra = Array.isArray(cfg.extraIncomings) ? cfg.extraIncomings : [];

  const onTimeout = useCallback(
    (v: number | string | undefined) => {
      const n = typeof v === 'number' ? v : Number(v);
      updateData({ ...cfg, timeout: Number.isFinite(n) ? n : 0 } as JoinConfig);
    },
    [cfg, updateData]
  );

  const onMerge = useCallback(
    (checked: boolean) => {
      updateData({ ...cfg, mergeToMap: checked } as JoinConfig);
    },
    [cfg, updateData]
  );

  return (
    <Wrap className="rulego-join-node">
      <Title>
        <span aria-hidden>⎈</span>
        <span>汇聚（Join）</span>
      </Title>
      <div style={{ marginBottom: 10, color: 'rgba(3, 105, 161, 0.85)', fontSize: 11, lineHeight: 1.45 }}>
        首条 Success 入线接主端口；其余并行入线在 extraIncomings 中（由 DSL 加载或连线自动维护）。
      </div>
      <Row>
        <span>超时（秒）</span>
        <InputNumber min={0} max={3600} value={timeout} onChange={onTimeout} style={{ width: 120 }} />
      </Row>
      <Row>
        <span>合并到 Map</span>
        <Switch checked={mergeToMap} onChange={onMerge} />
      </Row>
      {extra.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: '#0369a1', marginBottom: 4 }}>额外入边（{extra.length}）</div>
          <Space wrap>
            {extra.map((id) => (
              <span
                key={id}
                style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(3, 105, 161, 0.25)',
                }}
              >
                {id}
              </span>
            ))}
          </Space>
        </div>
      )}
    </Wrap>
  );
}
