/**
 * LLM 节点画布渲染：委托 LlmConfigForm（与弹窗配置字段一致）
 */

import React from 'react';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';

import { mergeRuleGoNodeData } from '../../utils/mergeRuleGoNodeData';
import type { LlmConfig } from './types';
import { LlmConfigForm } from './LlmConfigForm';

export function LlmNodeRender() {
  const nodeRender = useNodeRender();
  const data = (nodeRender.data ?? {}) as Record<string, unknown>;

  return (
    <LlmConfigForm
      data={data}
      onApplyPatch={(patch) => {
        nodeRender.updateData(mergeRuleGoNodeData(data, patch) as LlmConfig);
      }}
    />
  );
}
