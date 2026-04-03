/**
 * 容器子画布内部哨兵节点（仅用于 Flowgram 子画布结构，不参与 RuleGo DSL 导出）
 */

import React from 'react';
import type { RuleGoNodeRegistry } from '../../types';
import { InternalNodeType } from '../constants';

function BlockStartRender() {
  return (
    <div
      style={{
        padding: '6px 10px',
        fontSize: 11,
        color: 'var(--node-border-hover)',
        userSelect: 'none',
      }}
    >
      In
    </div>
  );
}

function BlockEndRender() {
  return (
    <div
      style={{
        padding: '6px 10px',
        fontSize: 11,
        color: 'var(--node-border-hover)',
        userSelect: 'none',
      }}
    >
      Out
    </div>
  );
}

export const BlockStartRegistry: RuleGoNodeRegistry = {
  type: InternalNodeType.BlockStart,
  backendNodeType: 'internal:block-start',
  category: 'data',
  info: { icon: '·', description: '容器入口' },
  meta: {
    size: { width: 72, height: 36 },
    defaultPorts: [{ type: 'output', location: 'right', portID: 'output' }],
    deleteDisable: true,
    copyDisable: true,
    nodePanelVisible: false,
  },
  onAdd: () => ({ data: {} }),
  formMeta: { render: () => <BlockStartRender /> },
  serializeConfiguration: () => ({}),
  deserializeConfiguration: () => ({}),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'output') return 'Success';
    return 'Default';
  },
};

export const BlockEndRegistry: RuleGoNodeRegistry = {
  type: InternalNodeType.BlockEnd,
  backendNodeType: 'internal:block-end',
  category: 'data',
  info: { icon: '·', description: '容器出口' },
  meta: {
    size: { width: 72, height: 36 },
    defaultPorts: [{ type: 'input', location: 'left', portID: 'input' }],
    deleteDisable: true,
    copyDisable: true,
    nodePanelVisible: false,
  },
  onAdd: () => ({ data: {} }),
  formMeta: { render: () => <BlockEndRender /> },
  serializeConfiguration: () => ({}),
  deserializeConfiguration: () => ({}),
  getConnectionType: () => 'Default',
};

export const blockSentinelRegistries: RuleGoNodeRegistry[] = [
  BlockStartRegistry,
  BlockEndRegistry,
];
