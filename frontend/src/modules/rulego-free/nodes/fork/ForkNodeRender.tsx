/**
 * Fork：并行分支数量配置
 */

import React, { useCallback } from 'react';
import { InputNumber } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { ForkConfig } from './types';

const MAX_BRANCH = 8;
const MIN_BRANCH = 1;

const Wrap = styled.div`
  width: 320px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #fff7ed 0%, #ffedd5 100%);
  color: #431407;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(234, 88, 12, 0.18);
  border: 1px solid rgba(234, 88, 12, 0.28);
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
  border-bottom: 1px solid rgba(194, 65, 12, 0.25);
  color: #9a3412;
`;

export function ForkNodeRender() {
  const { data, updateData } = useNodeRender();
  const cfg = (data ?? {}) as ForkConfig;
  const branchCount = Math.max(MIN_BRANCH, Math.min(MAX_BRANCH, Number(cfg.branchCount ?? 2)));

  const onChange = useCallback(
    (v: number | string | undefined) => {
      const n = typeof v === 'number' ? v : Number(v);
      const next = Math.max(MIN_BRANCH, Math.min(MAX_BRANCH, Number.isFinite(n) ? n : 2));
      updateData({ ...cfg, branchCount: next } as ForkConfig);
    },
    [cfg, updateData]
  );

  return (
    <Wrap className="rulego-fork-node">
      <Title>
        <span aria-hidden>⎇</span>
        <span>并行网关（Fork）</span>
      </Title>
      <div style={{ marginBottom: 8, color: 'rgba(154, 52, 18, 0.85)', fontSize: 11, lineHeight: 1.45 }}>
        输出多路 Success 并行分支；Failure 为异常分支。
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>分支数</span>
        <InputNumber min={MIN_BRANCH} max={MAX_BRANCH} value={branchCount} onChange={onChange} />
      </div>
    </Wrap>
  );
}
