/**
 * T4.3 其余 Endpoint 触发器：WS / MQTT / Schedule / Net（对齐 Blockly endpointTriggers.ts）
 */

import React, { useCallback } from 'react';
import { Input, InputNumber, Select, Switch, TextArea } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { RuleGoNodeRegistry } from '../../types';
import { TriggerNodeType } from '../constants';
import {
  deserializeMqttEndpoint,
  deserializeNetEndpoint,
  deserializeScheduleEndpoint,
  deserializeWsEndpoint,
  serializeMqttEndpoint,
  serializeNetEndpoint,
  serializeScheduleEndpoint,
  serializeWsEndpoint,
} from '../endpoints/endpointDsl';
import type {
  MqttTriggerData,
  NetTriggerData,
  ScheduleTriggerData,
  WsTriggerData,
} from '../endpoints/endpointDsl';

export type {
  MqttTriggerData,
  NetTriggerData,
  ScheduleTriggerData,
  WsTriggerData,
} from '../endpoints/endpointDsl';

const Wrap = styled.div`
  width: 320px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%);
  color: #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.35);
  font-size: 12px;
`;
const Title = styled.div`
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
`;
const Row = styled.div`
  margin-bottom: 8px;
`;
const Lb = styled.div`
  font-size: 11px;
  opacity: 0.85;
  margin-bottom: 4px;
`;

/* ---------- WebSocket ---------- */

function WsTriggerForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as WsTriggerData;
  const patch = useCallback((p: Partial<WsTriggerData>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>🔌 WebSocket 端点</Title>
      <Row>
        <Lb>名称</Lb>
        <Input size="small" value={d.name ?? ''} onChange={(v) => patch({ name: String(v) })} />
      </Row>
      <Row>
        <Lb>Server</Lb>
        <Input size="small" value={d.server ?? ''} onChange={(v) => patch({ server: String(v) })} placeholder=":9090" />
      </Row>
      <Row>
        <Lb>路由 ID</Lb>
        <Input size="small" value={d.routerId ?? ''} onChange={(v) => patch({ routerId: String(v) })} />
      </Row>
      <Row>
        <Lb>Method</Lb>
        <Select
          size="small"
          value={d.method ?? 'GET'}
          optionList={['GET', 'POST'].map((m) => ({ label: m, value: m }))}
          onChange={(v) => patch({ method: String(v) })}
        />
      </Row>
      <Row>
        <Lb>Path</Lb>
        <Input size="small" value={d.path ?? ''} onChange={(v) => patch({ path: String(v) })} />
      </Row>
      <Row>
        <Lb>转发 to</Lb>
        <Input size="small" value={d.to ?? ''} onChange={(v) => patch({ to: String(v) })} />
      </Row>
      <Row>
        <Switch checked={!!d.wait} onChange={(c) => patch({ wait: !!c })} /> wait
      </Row>
      <Row>
        <Lb>额外 routers JSON</Lb>
        <TextArea rows={3} value={d.extraRoutersJson ?? ''} onChange={(v) => patch({ extraRoutersJson: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const WsTriggerRegistry: RuleGoNodeRegistry = {
  type: TriggerNodeType.WebSocket,
  backendNodeType: 'endpoint/ws',
  category: 'trigger',
  isEndpoint: true,
  info: { icon: '🔌', description: 'WebSocket 端点' },
  meta: { size: { width: 340, height: 480 }, defaultPorts: [{ type: 'output', location: 'right', portID: 'output' }], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({
    data: {
      name: 'WebSocket 端点',
      server: ':9090',
      routerId: '',
      method: 'GET',
      path: '/ws',
      to: 'chain:default',
      wait: false,
      extraRoutersJson: '',
    } satisfies WsTriggerData,
  }),
  formMeta: { render: () => <WsTriggerForm /> },
  serializeEndpoint: serializeWsEndpoint,
  deserializeEndpoint: deserializeWsEndpoint,
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (port?.type === 'output' || pid === 'output') return 'Success';
    return 'Default';
  },
};

/* ---------- MQTT ---------- */

function MqttTriggerForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as MqttTriggerData;
  const patch = useCallback((p: Partial<MqttTriggerData>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>📡 MQTT 端点</Title>
      <Row>
        <Lb>名称</Lb>
        <Input size="small" value={d.name ?? ''} onChange={(v) => patch({ name: String(v) })} />
      </Row>
      <Row>
        <Lb>Server</Lb>
        <Input size="small" value={d.server ?? ''} onChange={(v) => patch({ server: String(v) })} />
      </Row>
      <Row>
        <Lb>用户名 / 密码</Lb>
        <Input size="small" value={d.username ?? ''} onChange={(v) => patch({ username: String(v) })} />
      </Row>
      <Row>
        <Input size="small" mode="password" value={d.password ?? ''} onChange={(v) => patch({ password: String(v) })} />
      </Row>
      <Row>
        <Lb>QoS / clientId</Lb>
        <InputNumber value={d.qos ?? 1} onChange={(v) => patch({ qos: Number(v) })} />
      </Row>
      <Row>
        <Input size="small" value={d.clientId ?? ''} onChange={(v) => patch({ clientId: String(v) })} placeholder="clientId" />
      </Row>
      <Row>
        <Lb>路由 ID</Lb>
        <Input size="small" value={d.routerId ?? ''} onChange={(v) => patch({ routerId: String(v) })} />
      </Row>
      <Row>
        <Lb>Topic（path）</Lb>
        <Input size="small" value={d.path ?? ''} onChange={(v) => patch({ path: String(v) })} />
      </Row>
      <Row>
        <Lb>fromProcessors（逗号分隔）</Lb>
        <Input size="small" value={d.fromProcessors ?? ''} onChange={(v) => patch({ fromProcessors: String(v) })} />
      </Row>
      <Row>
        <Lb>转发 to</Lb>
        <Input size="small" value={d.to ?? ''} onChange={(v) => patch({ to: String(v) })} />
      </Row>
      <Row>
        <Lb>额外 routers JSON</Lb>
        <TextArea rows={3} value={d.extraRoutersJson ?? ''} onChange={(v) => patch({ extraRoutersJson: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const MqttTriggerRegistry: RuleGoNodeRegistry = {
  type: TriggerNodeType.Mqtt,
  backendNodeType: 'endpoint/mqtt',
  category: 'trigger',
  isEndpoint: true,
  info: { icon: '📡', description: 'MQTT 端点' },
  meta: { size: { width: 340, height: 560 }, defaultPorts: [{ type: 'output', location: 'right', portID: 'output' }], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({
    data: {
      name: 'MQTT 端点',
      server: '127.0.0.1:1883',
      username: '',
      password: '',
      qos: 1,
      clientId: 'rulego_mqtt',
      routerId: '',
      path: 'sensors/+/data',
      fromProcessors: '',
      to: 'chain:default',
      extraRoutersJson: '',
    } satisfies MqttTriggerData,
  }),
  formMeta: { render: () => <MqttTriggerForm /> },
  serializeEndpoint: serializeMqttEndpoint,
  deserializeEndpoint: deserializeMqttEndpoint,
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (port?.type === 'output' || pid === 'output') return 'Success';
    return 'Default';
  },
};

/* ---------- Schedule ---------- */

function ScheduleTriggerForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as ScheduleTriggerData;
  const patch = useCallback((p: Partial<ScheduleTriggerData>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>⏰ 定时端点</Title>
      <Row>
        <Lb>名称</Lb>
        <Input size="small" value={d.name ?? ''} onChange={(v) => patch({ name: String(v) })} />
      </Row>
      <Row>
        <Lb>Cron（from.path）</Lb>
        <Input size="small" value={d.cron ?? ''} onChange={(v) => patch({ cron: String(v) })} placeholder="*/1 * * * * *" />
      </Row>
      <Row>
        <Lb>转发 to（path）</Lb>
        <Input size="small" value={d.to ?? ''} onChange={(v) => patch({ to: String(v) })} />
      </Row>
      <Row>
        <Lb>端点 processors（逗号）</Lb>
        <Input size="small" value={d.epProcessors ?? ''} onChange={(v) => patch({ epProcessors: String(v) })} />
      </Row>
      <Row>
        <Lb>额外 routers JSON</Lb>
        <TextArea rows={3} value={d.extraRoutersJson ?? ''} onChange={(v) => patch({ extraRoutersJson: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const ScheduleTriggerRegistry: RuleGoNodeRegistry = {
  type: TriggerNodeType.Schedule,
  backendNodeType: 'endpoint/schedule',
  category: 'trigger',
  isEndpoint: true,
  info: { icon: '⏰', description: '定时端点' },
  meta: { size: { width: 340, height: 400 }, defaultPorts: [{ type: 'output', location: 'right', portID: 'output' }], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({
    data: {
      name: '定时端点',
      server: '',
      cron: '*/1 * * * * *',
      to: '',
      epProcessors: '',
      extraRoutersJson: '',
    } satisfies ScheduleTriggerData,
  }),
  formMeta: { render: () => <ScheduleTriggerForm /> },
  serializeEndpoint: serializeScheduleEndpoint,
  deserializeEndpoint: deserializeScheduleEndpoint,
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (port?.type === 'output' || pid === 'output') return 'Success';
    return 'Default';
  },
};

/* ---------- Net TCP/UDP ---------- */

function NetTriggerForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as NetTriggerData;
  const patch = useCallback((p: Partial<NetTriggerData>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>🛰 TCP/UDP 端点</Title>
      <Row>
        <Lb>名称</Lb>
        <Input size="small" value={d.name ?? ''} onChange={(v) => patch({ name: String(v) })} />
      </Row>
      <Row>
        <Lb>协议</Lb>
        <Select
          size="small"
          value={d.protocol ?? 'tcp'}
          optionList={[
            { label: 'tcp', value: 'tcp' },
            { label: 'udp', value: 'udp' },
          ]}
          onChange={(v) => patch({ protocol: String(v) })}
        />
      </Row>
      <Row>
        <Lb>Server</Lb>
        <Input size="small" value={d.server ?? ''} onChange={(v) => patch({ server: String(v) })} placeholder=":8888" />
      </Row>
      <Row>
        <Lb>匹配 path（正则）</Lb>
        <Input size="small" value={d.path ?? ''} onChange={(v) => patch({ path: String(v) })} />
      </Row>
      <Row>
        <Lb>转发 to</Lb>
        <Input size="small" value={d.to ?? ''} onChange={(v) => patch({ to: String(v) })} />
      </Row>
      <Row>
        <Lb>额外 routers JSON</Lb>
        <TextArea rows={3} value={d.extraRoutersJson ?? ''} onChange={(v) => patch({ extraRoutersJson: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const NetTriggerRegistry: RuleGoNodeRegistry = {
  type: TriggerNodeType.Net,
  backendNodeType: 'endpoint/net',
  category: 'trigger',
  isEndpoint: true,
  info: { icon: '🛰', description: 'TCP/UDP 端点' },
  meta: { size: { width: 340, height: 440 }, defaultPorts: [{ type: 'output', location: 'right', portID: 'output' }], deleteDisable: false, copyDisable: false, nodePanelVisible: true },
  onAdd: () => ({
    data: {
      name: 'TCP/UDP 端点',
      protocol: 'tcp',
      server: ':8888',
      path: '.*',
      to: 'chain:default',
      extraRoutersJson: '',
    } satisfies NetTriggerData,
  }),
  formMeta: { render: () => <NetTriggerForm /> },
  serializeEndpoint: serializeNetEndpoint,
  deserializeEndpoint: deserializeNetEndpoint,
  getConnectionType: (port) => {
    const pid = port?.portID ?? port?.id;
    if (port?.type === 'output' || pid === 'output') return 'Success';
    return 'Default';
  },
};

export const t43EndpointRegistries: RuleGoNodeRegistry[] = [
  WsTriggerRegistry,
  MqttTriggerRegistry,
  ScheduleTriggerRegistry,
  NetTriggerRegistry,
];
