/**
 * T5.3：火山 TLS、OpenSearch、JsSwitch
 */

import React, { useCallback } from 'react';
import { Input, InputNumber, Switch, TextArea } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { RuleGoNodeRegistry } from '../../types';
import { ActionNodeType, ConditionNodeType } from '../constants';
import { SF_PORTS } from '../t43/sfPorts';
import { JsonConfigForm, parseConfigJson, stringifyConfig } from './JsonConfigForm';

const Wrap = styled.div`
  width: 420px;
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
  size: { width: 420, height: 320 },
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

const DEFAULT_VOLC_JSON = JSON.stringify(
  {
    endpoint: '',
    region: 'cn-beijing',
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: '',
    topicId: '',
    defaultQuery: '*',
    limit: 100,
    useApiV3: false,
    timeoutSec: 60,
    timeRangePreset: 'last_15m',
    defaultStartTimeMs: 0,
    defaultEndTimeMs: 0,
    defaultSort: 'desc',
    highLight: false,
  },
  null,
  2
);

const DEFAULT_OS_BODY =
  '{"size":100,"sort":[{"@timestamp":{"order":"desc"}}],"query":{"match_all":{}}}';

function isValidJsonObject(s: string): boolean {
  try {
    const v = JSON.parse(s) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  } catch {
    return false;
  }
}

/* ---------- Volc TLS（JSON） ---------- */
export const VolcTlsSearchRegistry: RuleGoNodeRegistry = {
  type: ActionNodeType.VolcTlsSearch,
  backendNodeType: 'volcTls/searchLogs',
  category: 'action',
  info: { icon: '🌋', description: '火山 TLS 查日志' },
  meta: { ...SF_META, size: { width: 440, height: 400 } },
  onAdd: () => ({ data: { configJson: DEFAULT_VOLC_JSON } }),
  formMeta: {
    render: () => (
      <JsonConfigForm
        title="火山 TLS（configuration JSON）"
        hint="与 Blockly volcTls/searchLogs 的 getConfiguration 字段一致。"
      />
    ),
  },
  serializeConfiguration: (data) => parseConfigJson(data),
  deserializeConfiguration: (c) => stringifyConfig(c as Record<string, unknown>),
  getConnectionType: getSFConnectionType,
};

/* ---------- OpenSearch ---------- */
function OpenSearchForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as Record<string, unknown>;
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>OpenSearch 查日志</Title>
      <Row>
        <Lb>endpoint</Lb>
        <Input
          size="small"
          value={String(d.endpoint ?? 'https://localhost:9200')}
          onChange={(v) => patch({ endpoint: String(v) })}
        />
      </Row>
      <Row>
        <Lb>index</Lb>
        <Input size="small" value={String(d.index ?? 'logs-*')} onChange={(v) => patch({ index: String(v) })} />
      </Row>
      <Row>
        <Lb>username</Lb>
        <Input size="small" value={String(d.username ?? '')} onChange={(v) => patch({ username: String(v) })} />
      </Row>
      <Row>
        <Lb>password</Lb>
        <Input size="small" type="password" value={String(d.password ?? '')} onChange={(v) => patch({ password: String(v) })} />
      </Row>
      <Row style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Lb style={{ marginBottom: 0 }}>insecureSkipVerify</Lb>
        <Switch checked={Boolean(d.insecureSkipVerify)} onChange={(c) => patch({ insecureSkipVerify: !!c })} />
      </Row>
      <Row>
        <Lb>timeoutSec</Lb>
        <InputNumber
          size="small"
          value={Number(d.timeoutSec ?? 60)}
          onChange={(v) => patch({ timeoutSec: Number(v) || 60 })}
        />
      </Row>
      <Row>
        <Lb>apiMode</Lb>
        <Input size="small" value={String(d.apiMode ?? 'search')} onChange={(v) => patch({ apiMode: String(v) })} />
      </Row>
      <Row>
        <Lb>searchType</Lb>
        <Input
          size="small"
          value={String(d.searchType ?? 'query_then_fetch')}
          onChange={(v) => patch({ searchType: String(v) })}
        />
      </Row>
      <Row style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Lb style={{ marginBottom: 0 }}>ignoreUnavailable</Lb>
        <Switch checked={d.ignoreUnavailable !== false} onChange={(c) => patch({ ignoreUnavailable: !!c })} />
      </Row>
      <Row style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Lb style={{ marginBottom: 0 }}>sourceEnabled</Lb>
        <Switch checked={Boolean(d.sourceEnabled)} onChange={(c) => patch({ sourceEnabled: !!c })} />
      </Row>
      <Row style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Lb style={{ marginBottom: 0 }}>trackTotalHits</Lb>
        <Switch checked={d.trackTotalHits !== false} onChange={(c) => patch({ trackTotalHits: !!c })} />
      </Row>
      <Row>
        <Lb>defaultSearchBody（JSON 字符串）</Lb>
        <TextArea
          rows={6}
          value={String(d.defaultSearchBody ?? DEFAULT_OS_BODY)}
          onChange={(v) => patch({ defaultSearchBody: String(v) })}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
        />
      </Row>
    </Wrap>
  );
}

export const OpenSearchSearchRegistry: RuleGoNodeRegistry = {
  type: ActionNodeType.OpenSearchSearch,
  backendNodeType: 'opensearch/search',
  category: 'action',
  info: { icon: '📇', description: 'OpenSearch 检索' },
  meta: { ...SF_META, size: { width: 440, height: 520 } },
  onAdd: () => ({
    data: {
      endpoint: 'https://localhost:9200',
      index: 'logs-*',
      username: '',
      password: '',
      insecureSkipVerify: false,
      timeoutSec: 60,
      apiMode: 'search',
      searchType: 'query_then_fetch',
      ignoreUnavailable: true,
      sourceEnabled: false,
      trackTotalHits: true,
      defaultSearchBody: DEFAULT_OS_BODY,
    },
  }),
  formMeta: { render: () => <OpenSearchForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    const raw = String(d.defaultSearchBody ?? '').trim();
    const defaultSearchBody = raw && isValidJsonObject(raw) ? raw : DEFAULT_OS_BODY;
    return {
      endpoint: String(d.endpoint ?? 'https://localhost:9200'),
      index: String(d.index ?? 'logs-*'),
      username: String(d.username ?? ''),
      password: String(d.password ?? ''),
      insecureSkipVerify: Boolean(d.insecureSkipVerify),
      timeoutSec: Number(d.timeoutSec ?? 60) || 60,
      apiMode: String(d.apiMode ?? 'search'),
      searchType: String(d.searchType ?? 'query_then_fetch'),
      ignoreUnavailable: d.ignoreUnavailable !== false,
      sourceEnabled: Boolean(d.sourceEnabled),
      trackTotalHits: d.trackTotalHits !== false,
      defaultSearchBody,
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      endpoint: String(o.endpoint ?? 'https://localhost:9200'),
      index: String(o.index ?? 'logs-*'),
      username: String(o.username ?? ''),
      password: String(o.password ?? ''),
      insecureSkipVerify: Boolean(o.insecureSkipVerify),
      timeoutSec: Number(o.timeoutSec ?? 60) || 60,
      apiMode: String(o.apiMode ?? 'search'),
      searchType: String(o.searchType ?? 'query_then_fetch'),
      ignoreUnavailable: o.ignoreUnavailable !== false,
      sourceEnabled: Boolean(o.sourceEnabled),
      trackTotalHits: o.trackTotalHits !== false,
      defaultSearchBody: String(o.defaultSearchBody ?? DEFAULT_OS_BODY),
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- JsSwitch ---------- */
const JS_SWITCH_PORTS = [
  { type: 'input', location: 'left', portID: 'input' },
  { type: 'output', location: 'right', portID: 'success' },
  { type: 'output', location: 'right', portID: 'default' },
  { type: 'output', location: 'bottom', portID: 'failure' },
] as const;

function JsSwitchForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { jsScript?: string };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>脚本路由（jsSwitch）</Title>
      <Row>
        <Lb>jsScript</Lb>
        <TextArea
          rows={10}
          value={String(d.jsScript ?? "return ['Success'];")}
          onChange={(v) => patch({ jsScript: String(v) })}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
        />
      </Row>
    </Wrap>
  );
}

function getJsSwitchConnectionType(port: { portID?: string; id?: string }) {
  const pid = port?.portID ?? port?.id;
  if (pid === 'success') return 'Success';
  if (pid === 'failure') return 'Failure';
  if (pid === 'default') return 'Default';
  return 'Default';
}

export const JsSwitchRegistry: RuleGoNodeRegistry = {
  type: ConditionNodeType.JsSwitch,
  backendNodeType: 'jsSwitch',
  category: 'condition',
  info: { icon: '🔀', description: 'JavaScript 路由' },
  meta: {
    size: { width: 420, height: 320 },
    defaultPorts: [...JS_SWITCH_PORTS],
    deleteDisable: false,
    copyDisable: false,
    nodePanelVisible: true,
  },
  onAdd: () => ({ data: { jsScript: "return ['Success'];" } }),
  formMeta: { render: () => <JsSwitchForm /> },
  serializeConfiguration: (data) => ({
    jsScript: String((data as { jsScript?: string }).jsScript ?? ''),
  }),
  deserializeConfiguration: (c) => ({
    jsScript: String((c as { jsScript?: unknown }).jsScript ?? "return ['Success'];"),
  }),
  getConnectionType: getJsSwitchConnectionType,
};

export const t53ExtraRegistries: RuleGoNodeRegistry[] = [
  VolcTlsSearchRegistry,
  OpenSearchSearchRegistry,
  JsSwitchRegistry,
];
