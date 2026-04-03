/**
 * Join 汇聚节点（后端 join）
 */

import type { RuleGoNodeRegistry } from '../../types';
import { DataNodeType } from '../constants';
import { JoinNodeRender } from './JoinNodeRender';
import type { JoinConfig } from './types';

const formMeta = {
  render: () => <JoinNodeRender />,
};

export const JoinRegistry: RuleGoNodeRegistry = {
  type: DataNodeType.Join,
  backendNodeType: 'join',
  category: 'data',
  info: {
    icon: '⎈',
    description: '多路汇聚（Join）',
  },
  meta: {
    size: { width: 380, height: 280 },
    defaultPorts: [
      { type: 'input', location: 'left', portID: 'input' },
      { type: 'output', location: 'right', portID: 'success' },
      { type: 'output', location: 'bottom', portID: 'failure' },
    ],
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },
  onAdd: () => ({
    data: {
      timeout: 0,
      mergeToMap: false,
      extraIncomings: [],
    } as JoinConfig,
  }),
  formMeta,
  serializeConfiguration: (data) => {
    const d = data as JoinConfig;
    /** extraIncomings 仅存在于 Flowgram data，由连线推导进 metadata.connections，不写入 DSL configuration */
    return {
      timeout: Number(d?.timeout ?? 0) || 0,
      mergeToMap: Boolean(d?.mergeToMap),
    };
  },
  deserializeConfiguration: (config) => {
    const o = config as Record<string, unknown>;
    return {
      timeout: Number(o.timeout ?? 0) || 0,
      mergeToMap: Boolean(o.mergeToMap),
    } as Record<string, unknown>;
  },
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

export type { JoinConfig } from './types';
