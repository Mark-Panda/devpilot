/**
 * Start Trigger 节点
 * 
 * 规则链起始触发器节点
 */

import React from 'react';
import type { RuleGoNodeRegistry, FormMeta } from '../../types';
import { TriggerNodeType } from '../constants';
import { StartTriggerNodeRender } from './StartTriggerNodeRender';

/**
 * 表单元数据 - 使用自定义渲染组件
 */
const formMeta: FormMeta = {
  render: () => <StartTriggerNodeRender />,
  defaultValues: {},
};

/**
 * StartTrigger 节点注册表
 */
export const StartTriggerRegistry: RuleGoNodeRegistry = {
  type: TriggerNodeType.Start,
  backendNodeType: 'startTrigger',
  category: 'trigger',

  info: {
    icon: '▶️',
    description: '规则链起始触发器',
  },

  meta: {
    size: { width: 160, height: 64 },
    defaultPorts: [
      {
        type: 'output',
        location: 'right',
        portID: 'output',
      },
    ],
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },

  onAdd: () => ({
    data: {},
  }),

  formMeta,

  serializeConfiguration: () => ({}),
  
  deserializeConfiguration: () => ({}),

  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (port?.type === 'output' || pid === 'output') {
      return 'Success';
    }
    return 'Default';
  },
};
