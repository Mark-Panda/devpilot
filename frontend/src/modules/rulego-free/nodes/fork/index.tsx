/**
 * Fork 并行网关（后端 fork；DSL 上多路 outgoing 均为 Success）
 */

import type { RuleGoNodeRegistry } from '../../types';
import { FlowNodeType } from '../constants';
import { ForkNodeRender } from './ForkNodeRender';
import type { ForkConfig } from './types';

const MAX_BRANCH = 8;
const MIN_BRANCH = 1;

const formMeta = {
  render: () => <ForkNodeRender />,
};

function buildForkPorts(branchCount: number) {
  const n = Math.max(MIN_BRANCH, Math.min(MAX_BRANCH, branchCount));
  const ports: Array<{ type: string; location: string; portID: string }> = [
    { type: 'input', location: 'left', portID: 'input' },
  ];
  for (let i = 0; i < n; i++) {
    ports.push({ type: 'output', location: 'right', portID: `branch_${i}` });
  }
  ports.push({ type: 'output', location: 'bottom', portID: 'failure' });
  return ports;
}

export const ForkRegistry: RuleGoNodeRegistry = {
  type: FlowNodeType.Fork,
  backendNodeType: 'fork',
  category: 'flow',
  info: {
    icon: '⎇',
    description: '并行分支（Fork）',
  },
  meta: {
    size: { width: 340, height: 220 },
    defaultPorts: buildForkPorts(2),
    getPortsConfig: (node: { data?: ForkConfig }) => {
      const bc = Number(node?.data?.branchCount ?? 2);
      return buildForkPorts(bc);
    },
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },
  onAdd: () => ({
    data: { branchCount: 2 } as ForkConfig,
  }),
  formMeta,
  serializeConfiguration: (data) => {
    const bc = Math.max(MIN_BRANCH, Math.min(MAX_BRANCH, Number((data as ForkConfig)?.branchCount ?? 2)));
    return { branchCount: bc };
  },
  deserializeConfiguration: (config) => {
    const o = config as Record<string, unknown>;
    const bc = Math.max(MIN_BRANCH, Math.min(MAX_BRANCH, Number(o.branchCount ?? 2)));
    return { branchCount: bc } as Record<string, unknown>;
  },
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'failure') return 'Failure';
    if (typeof pid === 'string' && /^branch_\d+$/.test(pid)) return 'Success';
    return 'Default';
  },
};

export type { ForkConfig } from './types';
