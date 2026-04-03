/**
 * Endpoint 触发器 DSL 纯序列化（无 React），供 registry、round-trip 单测共用
 */

import type { HttpTriggerData } from '../http-trigger/types';

export function splitProcessors(s: string): string[] | undefined {
  const a = s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return a.length ? a : undefined;
}

export function parseExtraRoutersJson(raw: string): unknown[] {
  const t = raw?.trim();
  if (!t) return [];
  try {
    const v = JSON.parse(t) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function serializeHttpEndpoint(node: any): Record<string, unknown> {
  const d = (node.data ?? {}) as HttpTriggerData;
  const id = String(node.id ?? '');
  const name = String(d.name ?? 'HTTP 端点');
  const server = String(d.server ?? ':9090');
  const configuration: Record<string, unknown> = { server };
  if (d.allowCors) configuration.allowCors = true;

  const method = String(d.method ?? 'POST');
  const path = String(d.path ?? '/');
  const toPath = String(d.to ?? 'chain:default');
  const wait = !!d.wait;
  const toProcessors = splitProcessors(String(d.toProcessors ?? ''));
  const rid = String(d.routerId ?? '').trim();
  const routerId =
    rid ||
    path.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') ||
    'r1';

  const mainRouter: Record<string, unknown> = {
    id: routerId,
    params: [method],
    from: { path, configuration: {} },
    to: {
      path: toPath,
      wait,
      ...(toProcessors ? { processors: toProcessors } : {}),
    },
  };

  const extra = parseExtraRoutersJson(String(d.extraRoutersJson ?? ''));
  const routers = [mainRouter, ...extra];

  const out: Record<string, unknown> = {
    id,
    type: 'endpoint/http',
    name,
    configuration,
    routers,
  };

  const pos = node.meta?.position;
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    out.additionalInfo = { position: { x: pos.x, y: pos.y } };
  }

  return out;
}

export function deserializeHttpEndpoint(ep: Record<string, unknown>): Record<string, unknown> {
  const cfg = (ep.configuration ?? {}) as Record<string, unknown>;
  const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
  const first = routers[0];
  const from = (first?.from ?? {}) as { path?: string; configuration?: Record<string, unknown> };
  const to = (first?.to ?? {}) as { path?: string; wait?: boolean; processors?: string[] };
  const params = first?.params as unknown[] | undefined;

  const data: HttpTriggerData = {
    name: String(ep.name ?? 'HTTP 端点'),
    server: String(cfg.server ?? ':9090'),
    allowCors: !!cfg.allowCors,
    routerId: String(first?.id ?? ''),
    method: params?.[0] != null ? String(params[0]) : 'POST',
    path: String(from.path ?? '/api/v1/hook'),
    to: String(to.path ?? 'chain:default'),
    wait: !!to.wait,
    toProcessors: Array.isArray(to.processors) ? to.processors.join(', ') : '',
    extraRoutersJson:
      routers.length > 1 ? JSON.stringify(routers.slice(1), null, 2) : '',
  };

  return { data };
}

export type WsTriggerData = {
  name: string;
  server: string;
  routerId: string;
  method: string;
  path: string;
  to: string;
  wait: boolean;
  extraRoutersJson: string;
};

export function serializeWsEndpoint(node: any): Record<string, unknown> {
  const d = (node.data ?? {}) as WsTriggerData;
  const id = String(node.id ?? '');
  const name = String(d.name ?? 'WebSocket 端点');
  const server = String(d.server ?? ':9090');
  const configuration = { server };
  const param = String(d.method ?? 'GET');
  const path = String(d.path ?? '/ws');
  const toPath = String(d.to ?? 'chain:default');
  const wait = !!d.wait;
  const rid = String(d.routerId ?? '').trim();
  const routerId =
    rid ||
    path.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') ||
    'r1';
  const mainRouter: Record<string, unknown> = {
    id: routerId,
    params: [param],
    from: { path, configuration: {} },
    to: { path: toPath, wait },
  };
  const extra = parseExtraRoutersJson(String(d.extraRoutersJson ?? ''));
  const out: Record<string, unknown> = {
    id,
    type: 'endpoint/ws',
    name,
    configuration,
    routers: [mainRouter, ...extra],
  };
  const pos = node.meta?.position;
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    out.additionalInfo = { position: { x: pos.x, y: pos.y } };
  }
  return out;
}

export function deserializeWsEndpoint(ep: Record<string, unknown>): Record<string, unknown> {
  const cfg = (ep.configuration ?? {}) as Record<string, unknown>;
  const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
  const first = routers[0];
  const from = (first?.from ?? {}) as { path?: string };
  const to = (first?.to ?? {}) as { path?: string; wait?: boolean };
  const params = first?.params as unknown[] | undefined;
  const data: WsTriggerData = {
    name: String(ep.name ?? 'WebSocket 端点'),
    server: String(cfg.server ?? ':9090'),
    routerId: String(first?.id ?? ''),
    method: params?.[0] != null ? String(params[0]) : 'GET',
    path: String(from.path ?? '/ws'),
    to: String(to.path ?? 'chain:default'),
    wait: !!to.wait,
    extraRoutersJson: routers.length > 1 ? JSON.stringify(routers.slice(1), null, 2) : '',
  };
  return { data };
}

export type MqttTriggerData = {
  name: string;
  server: string;
  username: string;
  password: string;
  qos: number;
  clientId: string;
  routerId: string;
  path: string;
  fromProcessors: string;
  to: string;
  extraRoutersJson: string;
};

export function serializeMqttEndpoint(node: any): Record<string, unknown> {
  const d = (node.data ?? {}) as MqttTriggerData;
  const id = String(node.id ?? '');
  const name = String(d.name ?? 'MQTT 端点');
  const server = String(d.server ?? '127.0.0.1:1883');
  const qos = Number(d.qos ?? 1);
  const configuration: Record<string, unknown> = {
    server,
    username: String(d.username ?? ''),
    password: String(d.password ?? ''),
    qos: Number.isFinite(qos) ? qos : 1,
    clientId: String(d.clientId ?? 'rulego_mqtt'),
  };
  const path = String(d.path ?? 'sensors/+/data');
  const toPath = String(d.to ?? 'chain:default');
  const fromProcessors = splitProcessors(String(d.fromProcessors ?? ''));
  const rid = String(d.routerId ?? '').trim();
  const routerId =
    rid ||
    path.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') ||
    'r1';
  const from: Record<string, unknown> = { path, configuration: {} };
  if (fromProcessors) from.processors = fromProcessors;
  const mainRouter: Record<string, unknown> = {
    id: routerId,
    from,
    to: { path: toPath },
  };
  const extra = parseExtraRoutersJson(String(d.extraRoutersJson ?? ''));
  const out: Record<string, unknown> = {
    id,
    type: 'endpoint/mqtt',
    name,
    configuration,
    routers: [mainRouter, ...extra],
  };
  const pos = node.meta?.position;
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    out.additionalInfo = { position: { x: pos.x, y: pos.y } };
  }
  return out;
}

export function deserializeMqttEndpoint(ep: Record<string, unknown>): Record<string, unknown> {
  const cfg = (ep.configuration ?? {}) as Record<string, unknown>;
  const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
  const first = routers[0];
  const from = (first?.from ?? {}) as { path?: string; processors?: string[] };
  const to = (first?.to ?? {}) as { path?: string };
  const data: MqttTriggerData = {
    name: String(ep.name ?? 'MQTT 端点'),
    server: String(cfg.server ?? '127.0.0.1:1883'),
    username: String(cfg.username ?? ''),
    password: String(cfg.password ?? ''),
    qos: Number(cfg.qos ?? 1) || 1,
    clientId: String(cfg.clientId ?? 'rulego_mqtt'),
    routerId: String(first?.id ?? ''),
    path: String(from.path ?? 'sensors/+/data'),
    fromProcessors: Array.isArray(from.processors) ? from.processors.join(', ') : '',
    to: String(to.path ?? 'chain:default'),
    extraRoutersJson: routers.length > 1 ? JSON.stringify(routers.slice(1), null, 2) : '',
  };
  return { data };
}

export type ScheduleTriggerData = {
  name: string;
  server: string;
  cron: string;
  to: string;
  epProcessors: string;
  extraRoutersJson: string;
};

export function serializeScheduleEndpoint(node: any): Record<string, unknown> {
  const d = (node.data ?? {}) as ScheduleTriggerData;
  const id = String(node.id ?? '');
  const name = String(d.name ?? '定时端点');
  const cron = String(d.cron ?? '*/1 * * * * *');
  const toPath = String(d.to ?? '').trim();
  const epProcessors = splitProcessors(String(d.epProcessors ?? ''));
  const mainRouter: Record<string, unknown> = {
    from: { path: cron },
  };
  if (toPath) {
    (mainRouter as { to?: { path: string } }).to = { path: toPath };
  }
  const extra = parseExtraRoutersJson(String(d.extraRoutersJson ?? ''));
  const out: Record<string, unknown> = {
    id,
    type: 'endpoint/schedule',
    name,
    configuration: {},
    routers: [mainRouter, ...extra],
  };
  if (epProcessors) out.processors = epProcessors;
  const pos = node.meta?.position;
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    out.additionalInfo = { position: { x: pos.x, y: pos.y } };
  }
  return out;
}

export function deserializeScheduleEndpoint(ep: Record<string, unknown>): Record<string, unknown> {
  const procs = ep.processors as string[] | undefined;
  const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
  const first = routers[0];
  const from = (first?.from ?? {}) as { path?: string };
  const to = (first?.to ?? {}) as { path?: string };
  const data: ScheduleTriggerData = {
    name: String(ep.name ?? '定时端点'),
    server: '',
    cron: String(from.path ?? '*/1 * * * * *'),
    to: String(to.path ?? ''),
    epProcessors: Array.isArray(procs) ? procs.join(', ') : '',
    extraRoutersJson: routers.length > 1 ? JSON.stringify(routers.slice(1), null, 2) : '',
  };
  return { data };
}

export type NetTriggerData = {
  name: string;
  protocol: string;
  server: string;
  path: string;
  to: string;
  extraRoutersJson: string;
};

export function serializeNetEndpoint(node: any): Record<string, unknown> {
  const d = (node.data ?? {}) as NetTriggerData;
  const id = String(node.id ?? '');
  const name = String(d.name ?? 'TCP/UDP 端点');
  const protocol = String(d.protocol ?? 'tcp');
  const server = String(d.server ?? ':8888');
  const path = String(d.path ?? '.*');
  const toPath = String(d.to ?? 'chain:default');
  const mainRouter: Record<string, unknown> = {
    from: { path, configuration: {} },
    to: { path: toPath },
  };
  const extra = parseExtraRoutersJson(String(d.extraRoutersJson ?? ''));
  const out: Record<string, unknown> = {
    id,
    type: 'endpoint/net',
    name,
    configuration: { protocol, server },
    routers: [mainRouter, ...extra],
  };
  const pos = node.meta?.position;
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    out.additionalInfo = { position: { x: pos.x, y: pos.y } };
  }
  return out;
}

export function deserializeNetEndpoint(ep: Record<string, unknown>): Record<string, unknown> {
  const cfg = (ep.configuration ?? {}) as Record<string, unknown>;
  const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
  const first = routers[0];
  const from = (first?.from ?? {}) as { path?: string };
  const to = (first?.to ?? {}) as { path?: string };
  const data: NetTriggerData = {
    name: String(ep.name ?? 'TCP/UDP 端点'),
    protocol: String(cfg.protocol ?? 'tcp'),
    server: String(cfg.server ?? ':8888'),
    path: String(from.path ?? '.*'),
    to: String(to.path ?? 'chain:default'),
    extraRoutersJson: routers.length > 1 ? JSON.stringify(routers.slice(1), null, 2) : '',
  };
  return { data };
}
