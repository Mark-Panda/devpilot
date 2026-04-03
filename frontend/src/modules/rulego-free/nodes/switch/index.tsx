/**
 * Switch 多分支节点（后端类型 switch，DSL 连接类型 Case0..CaseN、Default、Failure）
 */

import type { RuleGoNodeRegistry } from '../../types';
import { ConditionNodeType } from '../constants';
import { SwitchNodeRender } from './SwitchNodeRender';
import type { SwitchConfig } from './types';

const MAX_CASES = 6;

const formMeta = {
  render: () => <SwitchNodeRender />,
};

function buildPortsForCaseCount(caseCount: number) {
  const n = Math.max(1, Math.min(MAX_CASES, caseCount));
  const ports: Array<{ type: string; location: string; portID: string }> = [
    { type: 'input', location: 'left', portID: 'input' },
  ];
  for (let i = 0; i < n; i++) {
    ports.push({ type: 'output', location: 'right', portID: `case_${i}` });
  }
  ports.push(
    { type: 'output', location: 'right', portID: 'default' },
    { type: 'output', location: 'bottom', portID: 'failure' }
  );
  return ports;
}

export const SwitchRegistry: RuleGoNodeRegistry = {
  type: ConditionNodeType.Switch,
  backendNodeType: 'switch',
  category: 'condition',
  info: {
    icon: '🔀',
    description: '多路条件分支（Switch）',
  },
  meta: {
    size: { width: 440, height: 360 },
    defaultPorts: buildPortsForCaseCount(1),
    getPortsConfig: (node: { data?: SwitchConfig }) => {
      const raw = node?.data?.cases;
      const len = Array.isArray(raw) && raw.length > 0 ? raw.length : 1;
      return buildPortsForCaseCount(len);
    },
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },
  onAdd: () => ({
    data: {
      cases: [{ case: 'true' }],
    } as SwitchConfig,
  }),
  formMeta,
  serializeConfiguration: (data) => {
    const cfg = data as SwitchConfig;
    const cases = Array.isArray(cfg.cases) && cfg.cases.length > 0 ? cfg.cases : [{ case: 'true' }];
    return {
      cases: cases.slice(0, MAX_CASES).map((c) => ({ case: String(c?.case ?? '') })),
    };
  },
  deserializeConfiguration: (config) => {
    const o = config as Record<string, unknown>;
    const raw = o.cases;
    if (Array.isArray(raw) && raw.length > 0) {
      return {
        cases: raw.map((x: unknown) => ({
          case: String((x as { case?: string })?.case ?? ''),
        })),
      } as Record<string, unknown>;
    }
    return { cases: [{ case: 'true' }] } as Record<string, unknown>;
  },
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'default') return 'Default';
    if (pid === 'failure') return 'Failure';
    const m = /^case_(\d+)$/.exec(String(pid ?? ''));
    if (m) return `Case${m[1]}`;
    return 'Default';
  },
};

export type { SwitchConfig } from './types';
