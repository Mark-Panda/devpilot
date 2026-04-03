/**
 * T5.1 追踪类节点（对齐 Blockly getConfiguration）
 */

import React, { useCallback } from 'react';
import { Input, InputNumber } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { RuleGoNodeRegistry } from '../../types';
import { TracerNodeType } from '../constants';
import { SF_PORTS } from '../t43/sfPorts';
import { JsonConfigForm, parseConfigJson, stringifyConfig } from './JsonConfigForm';
import {
  DEFAULT_SOURCEGRAPH_REPO_BACKEND,
  DEFAULT_SOURCEGRAPH_REPO_FRONTEND,
} from '../../../rulego/sourcegraph/buildTracerSourcegraphQuery';

const Wrap = styled.div`
  width: 400px;
  padding: 10px 12px 12px;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  font-size: 12px;
`;
const Title = styled.div`
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
`;
const Row = styled.div`
  margin-bottom: 8px;
`;
const Lb = styled.div`
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
`;

const SF_META = {
  size: { width: 420, height: 240 },
  defaultPorts: [...SF_PORTS],
  deleteDisable: false,
  copyDisable: false,
  nodePanelVisible: true,
} as const;

function getSFConnectionType(port: { portID?: string; id?: string }) {
  const pid = port?.portID ?? port?.id;
  if (pid === 'success') return 'Success';
  if (pid === 'failure') return 'Failure';
  return 'Default';
}

const DEFAULT_CURSOR_ACP = JSON.stringify(
  {
    agentCommand: 'agent',
    args: [] as string[],
    timeoutSec: 1800,
    workDir: '',
    model: '',
    sessionMode: 'agent',
    permissionOptionId: 'allow-once',
    verboseLog: true,
  },
  null,
  2
);

const DEFAULT_CURSOR_ACP_AGENT = JSON.stringify(
  {
    agentCommand: 'agent',
    args: [] as string[],
    timeoutSec: 3600,
    workDir: '',
    workspaceId: '',
    model: '',
    sessionMode: 'agent',
    permissionOptionId: 'allow-once',
    maxPromptRounds: 20,
    continuationPrompt: '',
    useRegisteredAfterRoundHook: false,
    useAskQuestionDialog: false,
    autoPlanOptionId: 'approve',
    autoAskQuestionOptionIndex: 0,
    elicitationUrlAction: 'decline',
    verboseLog: true,
  },
  null,
  2
);

const DEFAULT_CURSOR_ACP_STEP = JSON.stringify(
  {
    agentCommand: 'agent',
    args: [] as string[],
    timeoutSec: 3600,
    workDir: '',
    workspaceId: '',
    model: '',
    sessionMode: 'agent',
    permissionOptionId: 'allow-once',
    useAskQuestionDialog: false,
    autoPlanOptionId: 'approve',
    autoAskQuestionOptionIndex: 0,
    elicitationUrlAction: 'decline',
    verboseLog: true,
  },
  null,
  2
);

const DEFAULT_SG_QUERY_BUILD = JSON.stringify(
  {
    defaultPatternType: 'literal',
    defaultPatterns: '',
    repoScope: '',
    repoFrontend: DEFAULT_SOURCEGRAPH_REPO_FRONTEND,
    repoBackend: DEFAULT_SOURCEGRAPH_REPO_BACKEND,
    contextGlobal: 'true',
    typeFilter: '',
    includeForked: 'true',
    displayLimit: '1500',
  },
  null,
  2
);

/* ---------- Git Prepare ---------- */
function GitPrepareForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { gitlabUrl?: string; workDir?: string };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>追踪·Git 工作区</Title>
      <Row>
        <Lb>gitlabUrl</Lb>
        <Input size="small" value={String(d.gitlabUrl ?? '')} onChange={(v) => patch({ gitlabUrl: String(v) })} />
      </Row>
      <Row>
        <Lb>workDir</Lb>
        <Input size="small" value={String(d.workDir ?? '')} onChange={(v) => patch({ workDir: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const GitPrepareRegistry: RuleGoNodeRegistry = {
  type: TracerNodeType.GitPrepare,
  backendNodeType: 'apiRouteTracer/gitPrepare',
  category: 'tracer',
  info: { icon: '📦', description: 'Git 工作区准备' },
  meta: { ...SF_META, size: { width: 400, height: 200 } },
  onAdd: () => ({ data: { gitlabUrl: '', workDir: '' } }),
  formMeta: { render: () => <GitPrepareForm /> },
  serializeConfiguration: (data) => ({
    gitlabUrl: String((data as { gitlabUrl?: string }).gitlabUrl ?? ''),
    workDir: String((data as { workDir?: string }).workDir ?? ''),
  }),
  deserializeConfiguration: (c) => ({
    gitlabUrl: String((c as { gitlabUrl?: unknown }).gitlabUrl ?? ''),
    workDir: String((c as { workDir?: unknown }).workDir ?? ''),
  }),
  getConnectionType: getSFConnectionType,
};

/* ---------- Sourcegraph Search ---------- */
function SourcegraphSearchForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as {
    endpoint?: string;
    accessToken?: string;
    timeoutSec?: number;
    defaultSearchQuery?: string;
  };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>Sourcegraph 搜索</Title>
      <Row>
        <Lb>endpoint</Lb>
        <Input
          size="small"
          value={String(d.endpoint ?? 'https://sourcegraph.com')}
          onChange={(v) => patch({ endpoint: String(v) })}
        />
      </Row>
      <Row>
        <Lb>accessToken</Lb>
        <Input size="small" value={String(d.accessToken ?? '')} onChange={(v) => patch({ accessToken: String(v) })} />
      </Row>
      <Row>
        <Lb>timeoutSec</Lb>
        <InputNumber
          size="small"
          value={Number(d.timeoutSec ?? 30)}
          onChange={(v) => patch({ timeoutSec: Number(v) || 30 })}
        />
      </Row>
      <Row>
        <Lb>defaultSearchQuery</Lb>
        <Input
          size="small"
          value={String(d.defaultSearchQuery ?? '')}
          onChange={(v) => patch({ defaultSearchQuery: String(v) })}
        />
      </Row>
    </Wrap>
  );
}

export const SourcegraphSearchRegistry: RuleGoNodeRegistry = {
  type: TracerNodeType.SourcegraphSearch,
  backendNodeType: 'sourcegraph/search',
  category: 'tracer',
  info: { icon: '🔎', description: 'Sourcegraph 搜索' },
  meta: { ...SF_META, size: { width: 420, height: 280 } },
  onAdd: () => ({
    data: {
      endpoint: 'https://sourcegraph.com',
      accessToken: '',
      timeoutSec: 30,
      defaultSearchQuery: '',
    },
  }),
  formMeta: { render: () => <SourcegraphSearchForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      endpoint: String(d.endpoint ?? 'https://sourcegraph.com'),
      accessToken: String(d.accessToken ?? ''),
      timeoutSec: Number(d.timeoutSec ?? 30) || 30,
      defaultSearchQuery: String(d.defaultSearchQuery ?? ''),
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      endpoint: String(o.endpoint ?? 'https://sourcegraph.com'),
      accessToken: String(o.accessToken ?? ''),
      timeoutSec: Number(o.timeoutSec ?? 30) || 30,
      defaultSearchQuery: String(o.defaultSearchQuery ?? ''),
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- Sourcegraph Query Build（JSON） ---------- */
export const SourcegraphQueryBuildRegistry: RuleGoNodeRegistry = {
  type: TracerNodeType.SourcegraphQueryBuild,
  backendNodeType: 'sourcegraph/queryBuild',
  category: 'tracer',
  info: { icon: '🧩', description: 'Sourcegraph 查询构建' },
  meta: { ...SF_META, size: { width: 440, height: 360 } },
  onAdd: () => ({ data: { configJson: DEFAULT_SG_QUERY_BUILD } }),
  formMeta: {
    render: () => (
      <JsonConfigForm
        title="Sourcegraph·查询构建（configuration JSON）"
        hint="与 Blockly「Sourcegraph·查询构建」字段一致：defaultPatternType、repoFrontend、repoBackend 等。"
      />
    ),
  },
  serializeConfiguration: (data) => parseConfigJson(data),
  deserializeConfiguration: (c) => stringifyConfig(c as Record<string, unknown>),
  getConnectionType: getSFConnectionType,
};

/* ---------- Cursor ACP 系（JSON） ---------- */
export const CursorAcpRegistry: RuleGoNodeRegistry = {
  type: TracerNodeType.CursorAcp,
  backendNodeType: 'cursor/acp',
  category: 'tracer',
  info: { icon: '🤖', description: 'Cursor ACP' },
  meta: { ...SF_META, size: { width: 440, height: 380 } },
  onAdd: () => ({ data: { configJson: DEFAULT_CURSOR_ACP } }),
  formMeta: {
    render: () => (
      <JsonConfigForm title="Cursor ACP（configuration JSON）" hint="与 Blockly cursor/acp 块 getConfiguration 输出一致。" />
    ),
  },
  serializeConfiguration: (data) => parseConfigJson(data),
  deserializeConfiguration: (c) => stringifyConfig(c as Record<string, unknown>),
  getConnectionType: getSFConnectionType,
};

export const CursorAcpAgentRegistry: RuleGoNodeRegistry = {
  type: TracerNodeType.CursorAcpAgent,
  backendNodeType: 'cursor/acp_agent',
  category: 'tracer',
  info: { icon: '🧭', description: 'Cursor ACP Agent' },
  meta: { ...SF_META, size: { width: 440, height: 420 } },
  onAdd: () => ({ data: { configJson: DEFAULT_CURSOR_ACP_AGENT } }),
  formMeta: {
    render: () => (
      <JsonConfigForm
        title="Cursor ACP Agent（configuration JSON）"
        hint="与 Blockly cursor/acp_agent 块一致（含 maxPromptRounds、continuationPrompt 等）。"
      />
    ),
  },
  serializeConfiguration: (data) => parseConfigJson(data),
  deserializeConfiguration: (c) => stringifyConfig(c as Record<string, unknown>),
  getConnectionType: getSFConnectionType,
};

export const CursorAcpAgentStepRegistry: RuleGoNodeRegistry = {
  type: TracerNodeType.CursorAcpAgentStep,
  backendNodeType: 'cursor/acp_agent_step',
  category: 'tracer',
  info: { icon: '⏭', description: 'Cursor ACP Agent 单步' },
  meta: { ...SF_META, size: { width: 440, height: 400 } },
  onAdd: () => ({ data: { configJson: DEFAULT_CURSOR_ACP_STEP } }),
  formMeta: {
    render: () => (
      <JsonConfigForm
        title="Cursor ACP Agent Step（configuration JSON）"
        hint="与 Blockly cursor/acp_agent_step 块一致。"
      />
    ),
  },
  serializeConfiguration: (data) => parseConfigJson(data),
  deserializeConfiguration: (c) => stringifyConfig(c as Record<string, unknown>),
  getConnectionType: getSFConnectionType,
};

export const t5TracerRegistries: RuleGoNodeRegistry[] = [
  GitPrepareRegistry,
  SourcegraphSearchRegistry,
  SourcegraphQueryBuildRegistry,
  CursorAcpRegistry,
  CursorAcpAgentRegistry,
  CursorAcpAgentStepRegistry,
];
