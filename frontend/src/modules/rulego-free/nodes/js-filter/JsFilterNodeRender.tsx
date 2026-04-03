/**
 * JsFilter 节点：条件脚本 + True/False/Failure 分支（与 Blockly 对齐）
 */

import React, { useCallback } from 'react';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import { JsEditor } from '../../../../shared/components/JsEditor/JsEditor';
import type { JsFilterConfig } from './types';

const Wrap = styled.div`
  width: 380px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #ecfeff 0%, #cffafe 100%);
  color: #0f172a;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(6, 182, 212, 0.22);
  border: 1px solid rgba(6, 182, 212, 0.35);
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
  border-bottom: 1px solid rgba(14, 116, 144, 0.25);
  color: #0e7490;
`;

const Hint = styled.div`
  font-size: 11px;
  color: #0e7490;
  opacity: 0.9;
  margin-bottom: 8px;
  line-height: 1.4;
`;

const EditorShell = styled.div`
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(14, 116, 144, 0.25);
  background: #ffffff;
`;

export function JsFilterNodeRender() {
  const { data, updateData } = useNodeRender();
  const cfg = data as JsFilterConfig;
  const script = String(cfg?.jsScript ?? '');

  const onScriptChange = useCallback(
    (value: string) => {
      updateData({ ...cfg, jsScript: value });
    },
    [cfg, updateData]
  );

  return (
    <Wrap className="rulego-js-filter-node">
      <Title>
        <span aria-hidden>⚖️</span>
        <span>JS 条件</span>
      </Title>
      <Hint>
        表达式求值为 true 走 True 分支，false 走 False 分支；异常走 Failure。
      </Hint>
      <EditorShell>
        <JsEditor
          value={script}
          onChange={onScriptChange}
          height={180}
          minHeight={140}
          readOnly={false}
          showFormatButton={false}
          showExpandButton={true}
        />
      </EditorShell>
    </Wrap>
  );
}
