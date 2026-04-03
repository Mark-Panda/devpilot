/**
 * JsTransform 节点（后端类型 jsTransform）
 */

import type { RuleGoNodeRegistry } from '../../types';
import { DataNodeType } from '../constants';
import { JsTransformNodeRender } from './JsTransformNodeRender';
import type { JsTransformConfig } from './types';

export type { JsTransformConfig } from './types';

const DEFAULT_SCRIPT = `metadata['name']='test02';
metadata['index']=22;
msg['addField']='addValue2';
return {'msg':msg,'metadata':metadata,'msgType':msgType};`;

const formMeta = {
  render: () => <JsTransformNodeRender />,
};

export const JsTransformRegistry: RuleGoNodeRegistry = {
  type: DataNodeType.JsTransform,
  backendNodeType: 'jsTransform',
  category: 'data',
  info: {
    icon: '🧩',
    description: 'JavaScript 脚本转换节点',
  },
  meta: {
    size: { width: 404, height: 340 },
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
      jsScript: DEFAULT_SCRIPT,
    } as JsTransformConfig,
  }),
  formMeta,
  serializeConfiguration: (data) => {
    const c = data as JsTransformConfig;
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
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};
