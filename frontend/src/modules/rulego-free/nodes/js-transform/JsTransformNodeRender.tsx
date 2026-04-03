/**
 * JsTransform 节点：Monaco 脚本编辑（与 Blockly `JS_SCRIPT` 字段对齐）
 */

import React, { useCallback } from 'react';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import { JsEditor } from '../../../../shared/components/JsEditor/JsEditor';
import type { JsTransformConfig } from './types';

const Wrap = styled.div`
  width: 380px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%);
  color: #1c1917;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.25);
  border: 1px solid rgba(245, 158, 11, 0.35);
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
  border-bottom: 1px solid rgba(180, 83, 9, 0.2);
  color: #92400e;
`;

const EditorShell = styled.div`
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(180, 83, 9, 0.25);
  background: #ffffff;
`;

export function JsTransformNodeRender() {
  const { data, updateData } = useNodeRender();
  const cfg = data as JsTransformConfig;
  const script = String(cfg?.jsScript ?? '');

  const onScriptChange = useCallback(
    (value: string) => {
      updateData({ ...cfg, jsScript: value });
    },
    [cfg, updateData]
  );

  return (
    <Wrap className="rulego-js-transform-node">
      <Title>
        <span aria-hidden>🧩</span>
        <span>脚本转换</span>
      </Title>
      <EditorShell>
        <JsEditor
          value={script}
          onChange={onScriptChange}
          height={200}
          minHeight={160}
          readOnly={false}
          showFormatButton={false}
          showExpandButton={true}
        />
      </EditorShell>
    </Wrap>
  );
}
