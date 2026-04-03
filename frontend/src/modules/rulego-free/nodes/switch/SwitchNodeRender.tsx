/**
 * Switch：多路条件分支（最多 6 路）+ Default + Failure
 */

import React, { useCallback } from 'react';
import { Button, Space, TextArea } from '@douyinfe/semi-ui';
import { IconMinus, IconPlus } from '@douyinfe/semi-icons';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { SwitchConfig } from './types';

const MAX_CASES = 6;

const Wrap = styled.div`
  width: 420px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%);
  color: #1e1b4b;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(109, 40, 217, 0.18);
  border: 1px solid rgba(109, 40, 217, 0.28);
  font-size: 12px;
`;

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(91, 33, 182, 0.22);
  color: #5b21b6;
`;

const CaseRow = styled.div`
  margin-bottom: 10px;
`;

const CaseLabel = styled.div`
  font-size: 11px;
  color: #5b21b6;
  margin-bottom: 4px;
`;

export function SwitchNodeRender() {
  const { data, updateData } = useNodeRender();
  const cfg = (data ?? {}) as SwitchConfig;
  const cases = Array.isArray(cfg.cases) && cfg.cases.length > 0 ? cfg.cases : [{ case: 'true' }];

  const setCases = useCallback(
    (next: { case: string }[]) => {
      updateData({ ...cfg, cases: next } as SwitchConfig);
    },
    [cfg, updateData]
  );

  const addCase = useCallback(() => {
    if (cases.length >= MAX_CASES) return;
    setCases([...cases, { case: 'true' }]);
  }, [cases, setCases]);

  const removeCase = useCallback(
    (idx: number) => {
      if (cases.length <= 1) return;
      setCases(cases.filter((_, i) => i !== idx));
    },
    [cases, setCases]
  );

  const onCaseChange = useCallback(
    (idx: number, value: string) => {
      const next = cases.map((c, i) => (i === idx ? { ...c, case: value } : c));
      setCases(next);
    },
    [cases, setCases]
  );

  return (
    <Wrap className="rulego-switch-node">
      <Title>
        <span aria-hidden>🔀</span>
        <span>条件分支（Switch）</span>
      </Title>
      <div style={{ marginBottom: 10, color: 'rgba(91, 33, 182, 0.75)', fontSize: 11, lineHeight: 1.45 }}>
        按顺序匹配分支表达式；均不匹配走 Default；异常走 Failure。
      </div>
      {cases.map((c, idx) => (
        <CaseRow key={idx}>
          <CaseLabel>Case{idx}（→ DSL 类型 Case{idx}）</CaseLabel>
          <Space style={{ width: '100%' }} align="start">
            <TextArea
              value={c.case}
              onChange={(v) => onCaseChange(idx, v)}
              rows={2}
              style={{ flex: 1 }}
              placeholder="例如: msg.temperature > 80"
            />
            <Button
              type="danger"
              theme="borderless"
              icon={<IconMinus />}
              disabled={cases.length <= 1}
              onClick={() => removeCase(idx)}
              aria-label={`删除分支 ${idx}`}
            />
          </Space>
        </CaseRow>
      ))}
      <Button icon={<IconPlus />} onClick={addCase} disabled={cases.length >= MAX_CASES} block>
        添加分支（最多 {MAX_CASES} 个）
      </Button>
    </Wrap>
  );
}
