/**
 * GroupAction 节点组（后端 groupAction）
 * T4.4：先以配置列表表达 nodeIds；容器化拖入可后续增强。
 */

import type { RuleGoNodeRegistry } from '../../types';
import { DataNodeType } from '../constants';
import { SF_PORTS } from '../t43/sfPorts';
import { GroupActionNodeRender } from './GroupActionNodeRender';
import type { GroupActionConfig } from './types';

const formMeta = {
  render: () => <GroupActionNodeRender />,
};

export const GroupActionRegistry: RuleGoNodeRegistry = {
  type: DataNodeType.GroupAction,
  backendNodeType: 'groupAction',
  category: 'data',
  info: {
    icon: '📦',
    description: '并行节点组（GroupAction）',
  },
  meta: {
    size: { width: 440, height: 400 },
    defaultPorts: [...SF_PORTS],
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },
  onAdd: () => ({
    data: {
      nodeIds: [],
      matchRelationType: 'Success',
      matchNum: 0,
      timeout: 0,
      mergeToMap: false,
    } satisfies GroupActionConfig,
  }),
  formMeta,
  serializeConfiguration: (data) => {
    const d = data as GroupActionConfig;
    return {
      nodeIds: Array.isArray(d.nodeIds) ? [...d.nodeIds] : [],
      matchRelationType: d.matchRelationType === 'Failure' ? 'Failure' : 'Success',
      matchNum: Number(d.matchNum ?? 0) || 0,
      timeout: Number(d.timeout ?? 0) || 0,
      mergeToMap: Boolean(d.mergeToMap),
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    const raw = o.nodeIds;
    const nodeIds = Array.isArray(raw) ? raw.map((x) => String(x)) : [];
    return {
      nodeIds,
      matchRelationType: String(o.matchRelationType ?? 'Success') === 'Failure' ? 'Failure' : 'Success',
      matchNum: Number(o.matchNum ?? 0) || 0,
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

export type { GroupActionConfig } from './types';
