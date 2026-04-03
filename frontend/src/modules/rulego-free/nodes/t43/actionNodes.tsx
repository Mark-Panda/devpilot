/**
 * T4.3 标准动作/DB/文件节点（对齐 Blockly 块字段）
 */

import React, { useCallback } from 'react';
import { Input, InputNumber, Select, Switch, TextArea } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { RuleGoNodeRegistry } from '../../types';
import {
  ActionNodeType,
  DbNodeType,
  FileNodeType,
  FlowNodeType,
} from '../constants';
import { BREAK_PORTS, SF_PORTS } from './sfPorts';

const Wrap = styled.div`
  width: 380px;
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

function parseExecScript(c: Record<string, unknown>): string {
  const cmd = String(c.cmd ?? '').trim();
  const args = Array.isArray(c.args) ? c.args : [];
  if (cmd === 'sh' && args.length >= 2 && String(args[0]) === '-c') return String(args[1] ?? '');
  if (cmd === '/bin/sh' && args.length >= 2 && String(args[0]) === '-c') return String(args[1] ?? '');
  if (cmd && args.length > 0) return [cmd, ...args.map((a) => String(a))].join(' ');
  if (cmd) return cmd;
  return 'true';
}

/* ---------- Delay ---------- */
function DelayForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { delayMs?: string; overwrite?: boolean };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>⏱ 延迟（delay）</Title>
      <Row>
        <Lb>delayMs</Lb>
        <Input size="small" value={String(d.delayMs ?? '60000')} onChange={(v) => patch({ delayMs: String(v) })} />
      </Row>
      <Row style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Lb style={{ marginBottom: 0 }}>overwrite</Lb>
        <Switch checked={!!d.overwrite} onChange={(c) => patch({ overwrite: !!c })} />
      </Row>
    </Wrap>
  );
}

export const DelayRegistry: RuleGoNodeRegistry = {
  type: ActionNodeType.Delay,
  backendNodeType: 'delay',
  category: 'action',
  info: { icon: '⏱', description: '延迟' },
  meta: { size: { width: 400, height: 200 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: { delayMs: '60000', overwrite: false } }),
  formMeta: { render: () => <DelayForm /> },
  serializeConfiguration: (data) => ({
    delayMs: String((data as { delayMs?: string }).delayMs ?? '60000'),
    overwrite: Boolean((data as { overwrite?: boolean }).overwrite),
  }),
  deserializeConfiguration: (c) => ({
    delayMs: String((c as { delayMs?: unknown }).delayMs ?? '60000'),
    overwrite: Boolean((c as { overwrite?: unknown }).overwrite),
  }),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

/* ---------- Exec ---------- */
function ExecForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { script?: string; log?: boolean; replaceData?: boolean };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>⌨ 执行命令（exec）</Title>
      <Row>
        <Lb>Shell（sh -c）</Lb>
        <TextArea rows={4} value={String(d.script ?? '')} onChange={(v) => patch({ script: String(v) })} />
      </Row>
      <Row style={{ display: 'flex', gap: 12 }}>
        <span>
          <Switch checked={!!d.log} onChange={(c) => patch({ log: !!c })} /> log
        </span>
        <span>
          <Switch checked={!!d.replaceData} onChange={(c) => patch({ replaceData: !!c })} /> replaceData
        </span>
      </Row>
    </Wrap>
  );
}

export const ExecCommandRegistry: RuleGoNodeRegistry = {
  type: ActionNodeType.ExecCommand,
  backendNodeType: 'exec',
  category: 'action',
  info: { icon: '⌨', description: '本地命令' },
  meta: { size: { width: 420, height: 280 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: { script: 'true', log: false, replaceData: false } }),
  formMeta: { render: () => <ExecForm /> },
  serializeConfiguration: (data) => {
    const script = String((data as { script?: string }).script ?? '').trim() || 'true';
    return {
      cmd: 'sh',
      args: ['-c', script],
      log: !!(data as { log?: boolean }).log,
      replaceData: !!(data as { replaceData?: boolean }).replaceData,
    };
  },
  deserializeConfiguration: (c) => ({
    script: parseExecScript(c as Record<string, unknown>),
    log: Boolean((c as { log?: unknown }).log),
    replaceData: Boolean((c as { replaceData?: unknown }).replaceData),
  }),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

/* ---------- Flow ---------- */
function FlowForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { targetId?: string; extend?: boolean };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>📎 子规则链（flow）</Title>
      <Row>
        <Lb>targetId</Lb>
        <Input size="small" value={String(d.targetId ?? '')} onChange={(v) => patch({ targetId: String(v) })} />
      </Row>
      <Row>
        <Switch checked={!!d.extend} onChange={(c) => patch({ extend: !!c })} /> extend
      </Row>
    </Wrap>
  );
}

export const FlowRegistry: RuleGoNodeRegistry = {
  type: FlowNodeType.Flow,
  backendNodeType: 'flow',
  category: 'flow',
  info: { icon: '📎', description: '子规则链' },
  meta: { size: { width: 400, height: 200 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: { targetId: '', extend: false } }),
  formMeta: { render: () => <FlowForm /> },
  serializeConfiguration: (data) => ({
    targetId: String((data as { targetId?: string }).targetId ?? ''),
    extend: !!(data as { extend?: boolean }).extend,
  }),
  deserializeConfiguration: (c) => ({
    targetId: String((c as { targetId?: unknown }).targetId ?? ''),
    extend: Boolean((c as { extend?: unknown }).extend),
  }),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

/* ---------- Ref ---------- */
function RefForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { targetId?: string; tellChain?: boolean };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>🔗 节点引用（ref）</Title>
      <Row>
        <Lb>targetId</Lb>
        <Input size="small" value={String(d.targetId ?? '')} onChange={(v) => patch({ targetId: String(v) })} placeholder="nodeId 或 chainId:nodeId" />
      </Row>
      <Row>
        <Switch checked={!!d.tellChain} onChange={(c) => patch({ tellChain: !!c })} /> tellChain
      </Row>
    </Wrap>
  );
}

export const RefRegistry: RuleGoNodeRegistry = {
  type: FlowNodeType.Ref,
  backendNodeType: 'ref',
  category: 'flow',
  info: { icon: '🔗', description: '节点引用' },
  meta: { size: { width: 400, height: 200 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: { targetId: '', tellChain: false } }),
  formMeta: { render: () => <RefForm /> },
  serializeConfiguration: (data) => ({
    targetId: String((data as { targetId?: string }).targetId ?? ''),
    tellChain: !!(data as { tellChain?: boolean }).tellChain,
  }),
  deserializeConfiguration: (c) => ({
    targetId: String((c as { targetId?: unknown }).targetId ?? ''),
    tellChain: Boolean((c as { tellChain?: unknown }).tellChain),
  }),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

/* ---------- Break ---------- */
function BreakForm() {
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>⏹ 终止循环（break）</Title>
      <div style={{ fontSize: 11, color: '#64748b' }}>无额外配置。</div>
    </Wrap>
  );
}

export const BreakRegistry: RuleGoNodeRegistry = {
  type: FlowNodeType.Break,
  backendNodeType: 'break',
  category: 'flow',
  info: { icon: '⏹', description: '终止循环' },
  meta: { size: { width: 320, height: 120 }, defaultPorts: [...BREAK_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: {} }),
  formMeta: { render: () => <BreakForm /> },
  serializeConfiguration: () => ({}),
  deserializeConfiguration: () => ({}),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    return 'Default';
  },
};

/* ---------- DbClient ---------- */
function DbForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as Record<string, unknown>;
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>🗄 数据库（dbClient）</Title>
      <Row>
        <Lb>driverName</Lb>
        <Input size="small" value={String(d.driverName ?? 'mysql')} onChange={(v) => patch({ driverName: String(v) })} />
      </Row>
      <Row>
        <Lb>dsn</Lb>
        <Input size="small" value={String(d.dsn ?? '')} onChange={(v) => patch({ dsn: String(v) })} />
      </Row>
      <Row>
        <Lb>poolSize</Lb>
        <InputNumber value={Number(d.poolSize ?? 5)} onChange={(v) => patch({ poolSize: v })} />
      </Row>
      <Row>
        <Lb>opType</Lb>
        <Input size="small" value={String(d.opType ?? '')} onChange={(v) => patch({ opType: String(v) })} />
      </Row>
      <Row>
        <Lb>sql</Lb>
        <TextArea rows={3} value={String(d.sql ?? '')} onChange={(v) => patch({ sql: String(v) })} />
      </Row>
      <Row>
        <Lb>params（JSON 数组）</Lb>
        <TextArea rows={4} value={String(d.paramsJson ?? '[]')} onChange={(v) => patch({ paramsJson: String(v) })} />
      </Row>
      <Row>
        <Switch checked={!!d.getOne} onChange={(c) => patch({ getOne: !!c })} /> getOne
      </Row>
    </Wrap>
  );
}

export const DbClientRegistry: RuleGoNodeRegistry = {
  type: DbNodeType.DbClient,
  backendNodeType: 'dbClient',
  category: 'db',
  info: { icon: '🗄', description: '数据库客户端' },
  meta: { size: { width: 420, height: 480 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({
    data: {
      driverName: 'mysql',
      dsn: 'root:root@tcp(127.0.0.1:3306)/test',
      poolSize: 5,
      opType: '',
      sql: 'select 1',
      paramsJson: '[]',
      getOne: false,
    },
  }),
  formMeta: { render: () => <DbForm /> },
  serializeConfiguration: (data) => {
    const x = data as Record<string, unknown>;
    let params: unknown[] = [];
    try {
      const parsed = JSON.parse(String(x.paramsJson ?? '[]')) as unknown;
      params = Array.isArray(parsed) ? parsed : [];
    } catch {
      params = [];
    }
    const cfg: Record<string, unknown> = {
      driverName: String(x.driverName ?? 'mysql'),
      dsn: String(x.dsn ?? ''),
      sql: String(x.sql ?? ''),
      params,
      getOne: Boolean(x.getOne),
    };
    const ps = Number(x.poolSize);
    if (Number.isFinite(ps) && ps > 0) cfg.poolSize = ps;
    const ot = String(x.opType ?? '').trim();
    if (ot) cfg.opType = ot;
    return cfg;
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    const paramList = Array.isArray(o.params) ? o.params : [];
    return {
      driverName: String(o.driverName ?? 'mysql'),
      dsn: String(o.dsn ?? ''),
      poolSize: o.poolSize != null ? Number(o.poolSize) : 5,
      opType: String(o.opType ?? ''),
      sql: String(o.sql ?? ''),
      paramsJson: JSON.stringify(paramList.length ? paramList : []),
      getOne: Boolean(o.getOne),
    };
  },
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

/* ---------- File ---------- */
function FileReadForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { path?: string; dataType?: string; recursive?: boolean };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>📄 读文件</Title>
      <Row>
        <Lb>path</Lb>
        <Input size="small" value={String(d.path ?? '')} onChange={(v) => patch({ path: String(v) })} />
      </Row>
      <Row>
        <Lb>dataType</Lb>
        <Select
          size="small"
          value={d.dataType ?? 'text'}
          optionList={[
            { label: 'text', value: 'text' },
            { label: 'base64', value: 'base64' },
          ]}
          onChange={(v) => patch({ dataType: String(v) })}
        />
      </Row>
      <Row>
        <Switch checked={!!d.recursive} onChange={(c) => patch({ recursive: !!c })} /> recursive
      </Row>
    </Wrap>
  );
}

export const FileReadRegistry: RuleGoNodeRegistry = {
  type: FileNodeType.FileRead,
  backendNodeType: 'x/fileRead',
  category: 'file',
  info: { icon: '📄', description: '读文件' },
  meta: { size: { width: 400, height: 240 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: { path: '/tmp/data.txt', dataType: 'text', recursive: false } }),
  formMeta: { render: () => <FileReadForm /> },
  serializeConfiguration: (data) => ({
    path: String((data as { path?: string }).path ?? ''),
    dataType: String((data as { dataType?: string }).dataType ?? 'text'),
    recursive: !!(data as { recursive?: boolean }).recursive,
  }),
  deserializeConfiguration: (c) => ({
    path: String((c as { path?: unknown }).path ?? ''),
    dataType: String((c as { dataType?: unknown }).dataType ?? 'text'),
    recursive: Boolean((c as { recursive?: unknown }).recursive),
  }),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

function FileWriteForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { path?: string; content?: string; append?: boolean };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>✏ 写文件</Title>
      <Row>
        <Lb>path</Lb>
        <Input size="small" value={String(d.path ?? '')} onChange={(v) => patch({ path: String(v) })} />
      </Row>
      <Row>
        <Lb>content</Lb>
        <TextArea rows={3} value={String(d.content ?? '${data}')} onChange={(v) => patch({ content: String(v) })} />
      </Row>
      <Row>
        <Switch checked={!!d.append} onChange={(c) => patch({ append: !!c })} /> append
      </Row>
    </Wrap>
  );
}

export const FileWriteRegistry: RuleGoNodeRegistry = {
  type: FileNodeType.FileWrite,
  backendNodeType: 'x/fileWrite',
  category: 'file',
  info: { icon: '✏', description: '写文件' },
  meta: { size: { width: 400, height: 240 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: { path: '/tmp/out.txt', content: '${data}', append: false } }),
  formMeta: { render: () => <FileWriteForm /> },
  serializeConfiguration: (data) => ({
    path: String((data as { path?: string }).path ?? ''),
    content: String((data as { content?: string }).content ?? ''),
    append: !!(data as { append?: boolean }).append,
  }),
  deserializeConfiguration: (c) => ({
    path: String((c as { path?: unknown }).path ?? ''),
    content: String((c as { content?: unknown }).content ?? ''),
    append: Boolean((c as { append?: unknown }).append),
  }),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

function FileDeleteForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { path?: string };
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>🗑 删文件</Title>
      <Row>
        <Lb>path</Lb>
        <Input size="small" value={String(d.path ?? '')} onChange={(v) => updateData({ ...d, path: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const FileDeleteRegistry: RuleGoNodeRegistry = {
  type: FileNodeType.FileDelete,
  backendNodeType: 'x/fileDelete',
  category: 'file',
  info: { icon: '🗑', description: '删文件' },
  meta: { size: { width: 400, height: 160 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: { path: '/tmp/data.txt' } }),
  formMeta: { render: () => <FileDeleteForm /> },
  serializeConfiguration: (data) => ({ path: String((data as { path?: string }).path ?? '') }),
  deserializeConfiguration: (c) => ({ path: String((c as { path?: unknown }).path ?? '') }),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

function FileListForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { path?: string; recursive?: boolean };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>📂 列目录</Title>
      <Row>
        <Lb>path / glob</Lb>
        <Input size="small" value={String(d.path ?? '')} onChange={(v) => patch({ path: String(v) })} />
      </Row>
      <Row>
        <Switch checked={!!d.recursive} onChange={(c) => patch({ recursive: !!c })} /> recursive
      </Row>
    </Wrap>
  );
}

export const FileListRegistry: RuleGoNodeRegistry = {
  type: FileNodeType.FileList,
  backendNodeType: 'x/fileList',
  category: 'file',
  info: { icon: '📂', description: '列文件' },
  meta: { size: { width: 400, height: 200 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({ data: { path: '/tmp/*.txt', recursive: false } }),
  formMeta: { render: () => <FileListForm /> },
  serializeConfiguration: (data) => ({
    path: String((data as { path?: string }).path ?? ''),
    recursive: !!(data as { recursive?: boolean }).recursive,
  }),
  deserializeConfiguration: (c) => ({
    path: String((c as { path?: unknown }).path ?? ''),
    recursive: Boolean((c as { recursive?: unknown }).recursive),
  }),
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

/* ---------- Feishu ---------- */
function FeishuForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as Record<string, unknown>;
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>💬 飞书单聊</Title>
      <Row>
        <Lb>appId</Lb>
        <Input size="small" value={String(d.appId ?? '')} onChange={(v) => patch({ appId: String(v) })} />
      </Row>
      <Row>
        <Lb>appSecret</Lb>
        <Input size="small" type="password" value={String(d.appSecret ?? '')} onChange={(v) => patch({ appSecret: String(v) })} />
      </Row>
      <Row>
        <Lb>receiveIdType</Lb>
        <Select
          size="small"
          value={String(d.receiveIdType ?? 'open_id')}
          optionList={[
            { label: 'open_id', value: 'open_id' },
            { label: 'union_id', value: 'union_id' },
            { label: 'user_id', value: 'user_id' },
            { label: 'email', value: 'email' },
          ]}
          onChange={(v) => patch({ receiveIdType: String(v) })}
        />
      </Row>
      <Row>
        <Lb>receiveId</Lb>
        <Input size="small" value={String(d.receiveId ?? '')} onChange={(v) => patch({ receiveId: String(v) })} />
      </Row>
      <Row>
        <Lb>text</Lb>
        <TextArea rows={3} value={String(d.text ?? '${data}')} onChange={(v) => patch({ text: String(v) })} />
      </Row>
      <Row>
        <Lb>timeoutSec</Lb>
        <InputNumber value={Number(d.timeoutSec ?? 30)} onChange={(v) => patch({ timeoutSec: v })} />
      </Row>
    </Wrap>
  );
}

export const FeishuMessageRegistry: RuleGoNodeRegistry = {
  type: ActionNodeType.FeishuMessage,
  backendNodeType: 'feishu/imMessage',
  category: 'action',
  info: { icon: '💬', description: '飞书 IM' },
  meta: { size: { width: 400, height: 420 }, defaultPorts: [...SF_PORTS], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({
    data: {
      appId: '',
      appSecret: '',
      receiveIdType: 'open_id',
      receiveId: '',
      text: '${data}',
      timeoutSec: 30,
    },
  }),
  formMeta: { render: () => <FeishuForm /> },
  serializeConfiguration: (data) => {
    const x = data as Record<string, unknown>;
    return {
      appId: String(x.appId ?? ''),
      appSecret: String(x.appSecret ?? ''),
      receiveIdType: String(x.receiveIdType ?? 'open_id'),
      receiveId: String(x.receiveId ?? ''),
      text: String(x.text ?? '${data}'),
      timeoutSec: Number(x.timeoutSec ?? 30) || 30,
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      appId: String(o.appId ?? ''),
      appSecret: String(o.appSecret ?? ''),
      receiveIdType: String(o.receiveIdType ?? 'open_id'),
      receiveId: String(o.receiveId ?? ''),
      text: String(o.text ?? '${data}'),
      timeoutSec: Number(o.timeoutSec ?? 30) || 30,
    };
  },
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (pid === 'success') return 'Success';
    if (pid === 'failure') return 'Failure';
    return 'Default';
  },
};

export const t43ActionRegistries: RuleGoNodeRegistry[] = [
  DelayRegistry,
  ExecCommandRegistry,
  FlowRegistry,
  RefRegistry,
  BreakRegistry,
  DbClientRegistry,
  FileReadRegistry,
  FileWriteRegistry,
  FileDeleteRegistry,
  FileListRegistry,
  FeishuMessageRegistry,
];
