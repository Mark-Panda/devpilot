/**
 * JsFilter 节点（后端类型 jsFilter，连接类型 True / False / Failure）
 */

import type { RuleGoNodeRegistry } from '../../types';
import { DataNodeType } from '../constants';
import { JsFilterNodeRender } from './JsFilterNodeRender';
import type { JsFilterConfig } from './types';

export type { JsFilterConfig } from './types';

const DEFAULT_SCRIPT = 'return msg.temperature > 50;';

const formMeta = {
  render: () => <JsFilterNodeRender />,
};

export const JsFilterRegistry: RuleGoNodeRegistry = {
  type: DataNodeType.JsFilter,
  backendNodeType: 'jsFilter',
  category: 'data',
  info: {
    icon: '⚖️',
    description: 'JavaScript 条件过滤节点',
  },
  meta: {
    size: { width: 404, height: 340 },
    defaultPorts: [
      { type: 'input', location: 'left', portID: 'input' },
      { type: 'output', location: 'right', portID: 'true' },
      { type: 'output', location: 'right', portID: 'false' },
      { type: 'output', location: 'bottom', portID: 'failure' },
    ],
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },
  onAdd: () => ({
    data: {
      jsScript: DEFAULT_SCRIPT,
    } as JsFilterConfig,
  }),
  formMeta,
  serializeConfiguration: (data) => {
    const c = data as JsFilterConfig;
    return {
      jsScript: String(c?.jsScript ?? ''),
    };
  },
  deserializeConfiguration: (config) => {
    const o = config as Record<string, unknown>;
    return {
      jsScript: String(o.jsScript ?? DEFAULT_SCRIPT),
    } as Record<string, unknown>;
  },
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'true') return 'True';
    if (pid === 'false') return 'False';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};
