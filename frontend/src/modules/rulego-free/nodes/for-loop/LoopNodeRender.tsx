/**
 * ForLoop 容器节点：头部摘要 + SubCanvas（循环体）
 */

import React from 'react';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import { SubCanvasRender } from '@flowgram.ai/free-container-plugin';

import {
  LoopContainerStyle,
  LoopHeader,
  LoopHeaderIcon,
  LoopHeaderInfo,
  LoopTitle,
  LoopConfigSummary,
  LoopModeBadge,
  LoopBody,
  LoopBodyLabel,
  LoopErrorIndicator,
} from './styles';

const MODE_LABELS = ['忽略', '追加', '覆盖', '异步'];

export function LoopNodeRender() {
  const { selected, form, data } = useNodeRender();
  const mode = typeof data?.mode === 'number' ? data.mode : 0;
  const range = typeof data?.range === 'string' ? data.range : '1..3';
  const title =
    typeof data?.title === 'string' && data.title.trim() !== ''
      ? data.title
      : 'Loop';

  const invalid = Boolean(form?.state?.invalid);

  return (
    <LoopContainerStyle
      className={`rulego-free-node-for-loop ${selected ? 'selected' : ''} ${invalid ? 'error' : ''}`}
    >
      <LoopHeader className="rulego-for-loop-header">
        <LoopHeaderIcon>🔁</LoopHeaderIcon>
        <LoopHeaderInfo>
          <LoopTitle>{title}</LoopTitle>
          <LoopConfigSummary>
            范围: <code>{range}</code>
            {mode !== 0 && mode < MODE_LABELS.length && (
              <LoopModeBadge mode={mode}>{MODE_LABELS[mode]}</LoopModeBadge>
            )}
          </LoopConfigSummary>
        </LoopHeaderInfo>
      </LoopHeader>

      <LoopBody>
        <LoopBodyLabel>Body</LoopBodyLabel>
        <SubCanvasRender />
      </LoopBody>

      {invalid && (
        <LoopErrorIndicator className="rulego-for-loop-error" title="配置有误，请检查">
          ⚠️
        </LoopErrorIndicator>
      )}
    </LoopContainerStyle>
  );
}
