/**
 * HTTP 触发器（metadata.endpoints，类型 endpoint/http）
 * 对齐 Blockly `endpointTriggers.ts` 的 getEndpointDsl / setEndpointDsl
 */

import React from 'react';
import type { RuleGoNodeRegistry } from '../../types';
import { TriggerNodeType } from '../constants';
import {
  deserializeHttpEndpoint,
  serializeHttpEndpoint,
} from '../endpoints/endpointDsl';
import { HttpTriggerNodeRender } from './HttpTriggerNodeRender';
import type { HttpTriggerData } from './types';

export type { HttpTriggerData } from './types';

const formMeta = {
  render: () => <HttpTriggerNodeRender />,
};

export const HttpTriggerRegistry: RuleGoNodeRegistry = {
  type: TriggerNodeType.Http,
  backendNodeType: 'endpoint/http',
  category: 'trigger',
  isEndpoint: true,

  info: {
    icon: '🌐',
    description: 'HTTP 端点触发（metadata.endpoints）',
  },

  meta: {
    size: { width: 340, height: 520 },
    defaultPorts: [{ type: 'output', location: 'right', portID: 'output' }],
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },

  onAdd: () => ({
    data: {
      name: 'HTTP 端点',
      server: ':9090',
      allowCors: false,
      routerId: '',
      method: 'POST',
      path: '/api/v1/hook',
      to: 'chain:default',
      wait: false,
      toProcessors: '',
      extraRoutersJson: '',
    } satisfies HttpTriggerData,
  }),

  formMeta,

  serializeEndpoint: (node) => serializeHttpEndpoint(node),

  deserializeEndpoint: (ep) => deserializeHttpEndpoint(ep),

  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (port?.type === 'output' || pid === 'output') return 'Success';
    return 'Default';
  },
};
