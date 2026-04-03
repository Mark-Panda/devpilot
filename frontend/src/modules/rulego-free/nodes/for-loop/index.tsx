/**
 * ForLoop 容器节点类型
 */

import type { RuleGoNodeRegistry } from '../../types';
import { DataNodeType } from '../constants';
import { ForLoopSidebarForm } from './ForLoopSidebarForm';
import { LoopNodeRender } from './LoopNodeRender';

/**
 * ForLoop 配置数据结构
 */
export interface ForLoopConfig {
  range: string;
  do: string;
  mode: number;
}

const formMeta = {
  render: () => <LoopNodeRender />,
};

/**
 * ForLoop 容器节点注册定义
 */
export const ForLoopRegistry: RuleGoNodeRegistry = {
  type: DataNodeType.ForLoop,
  backendNodeType: 'for',
  category: 'data',
  info: {
    icon: '🔁',
    description: 'For循环遍历节点（容器）',
  },
  meta: {
    size: { width: 400, height: 300 },
    defaultPorts: [
      { type: 'input', location: 'left', portID: 'input' },
      { type: 'output', location: 'right', portID: 'success' },
      { type: 'output', location: 'bottom', portID: 'failure' },
    ],
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
    isContainer: true, // 容器节点标记
  },
  onAdd: () => ({
    data: {
      range: '1..10',
      do: '',
      mode: 0,
    } as ForLoopConfig,
  }),
  renderConfigSidebar: ForLoopSidebarForm,
  formMeta,
  serializeConfiguration: (data) => {
    const config = data as ForLoopConfig;
    return {
      range: config.range,
      do: config.do,
      mode: config.mode,
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
