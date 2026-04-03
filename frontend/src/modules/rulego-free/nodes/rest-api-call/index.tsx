/**
 * RestApiCall 节点类型
 */

import type { RuleGoNodeRegistry } from '../../types';
import { ActionNodeType } from '../constants';
import { RestApiCallNodeRender } from './RestApiCallNodeRender';

/**
 * RestApiCall 配置数据结构
 */
export interface RestApiCallConfig {
  restEndpointUrlPattern: string;
  requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  query: Record<string, string>;
  body: string;
  timeout: number;
  maxParallelRequestsCount: number;
}

const formMeta = {
  render: () => <RestApiCallNodeRender />,
};

/**
 * RestApiCall 节点注册定义
 */
export const RestApiCallRegistry: RuleGoNodeRegistry = {
  type: ActionNodeType.RestApiCall,
  backendNodeType: 'restApiCall',
  category: 'action',
  info: {
    icon: '🌐',
    description: 'HTTP API 调用节点',
  },
  meta: {
    size: { width: 200, height: 80 },
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
      restEndpointUrlPattern: 'http://localhost:9099/api',
      requestMethod: 'POST',
      headers: {},
      query: {},
      body: '',
      timeout: 30000,
      maxParallelRequestsCount: 200,
    } as RestApiCallConfig,
  }),
  formMeta,
  serializeConfiguration: (data) => {
    const config = data as RestApiCallConfig;
    return {
      restEndpointUrlPattern: config.restEndpointUrlPattern,
      requestMethod: config.requestMethod,
      headers: config.headers,
      query: config.query,
      body: config.body,
      timeout: config.timeout,
      maxParallelRequestsCount: config.maxParallelRequestsCount,
    };
  },
  deserializeConfiguration: (config) => {
    return { ...config } as Record<string, unknown>;
  },
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};
