/**
 * Round-trip 单测用：DSL→Workflow 与 Workflow→DSL 两套注册表桩（不加载 Semi/React 全量 registry）
 */

import {
  deserializeHttpEndpoint,
  deserializeMqttEndpoint,
  deserializeNetEndpoint,
  deserializeScheduleEndpoint,
  deserializeWsEndpoint,
  serializeHttpEndpoint,
  serializeMqttEndpoint,
  serializeNetEndpoint,
  serializeScheduleEndpoint,
  serializeWsEndpoint,
} from '../nodes/endpoints/endpointDsl';
import type { RuleGoNodeRegistry } from '../types';

function stripTitleName(d: Record<string, unknown>) {
  const { title: _t, name: _n, ...rest } = d;
  return rest;
}

function mk(
  p: Partial<RuleGoNodeRegistry> & Pick<RuleGoNodeRegistry, 'type' | 'backendNodeType'>
): RuleGoNodeRegistry {
  return {
    category: 'data',
    info: { icon: '', description: '' },
    meta: {},
    onAdd: () => ({ data: {} }),
    formMeta: { render: () => null },
    serializeConfiguration: (c) => ({ ...c }),
    getConnectionType: () => 'Success',
    ...p,
  } as RuleGoNodeRegistry;
}

/** `ruleGoDslToWorkflowJsonWithRegistry` 使用 backend 类型作 key */
export function getRegistryForDslToWorkflow(backendType: string): RuleGoNodeRegistry | undefined {
  switch (backendType) {
    case 'startTrigger':
      return mk({
        type: 'start-trigger',
        backendNodeType: 'startTrigger',
        meta: {},
        deserializeConfiguration: () => ({}),
        serializeConfiguration: () => ({}),
      });
    case 'restApiCall':
      return mk({
        type: 'rest-api-call',
        backendNodeType: 'restApiCall',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
        serializeConfiguration: (d) => stripTitleName(d as Record<string, unknown>),
        getConnectionType: (port: { portID?: string; id?: string }) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'success') return 'Success';
          if (pid === 'failure') return 'Failure';
          return 'Default';
        },
      });
    case 'for':
      return mk({
        type: 'for-loop',
        backendNodeType: 'for',
        meta: { isContainer: true },
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
        serializeConfiguration: (d: any) => ({
          range: String(d?.range ?? ''),
          do: String(d?.do ?? ''),
          mode: Number(d?.mode ?? 0),
        }),
      });
    case 'ai/llm':
      return mk({
        type: 'llm',
        backendNodeType: 'ai/llm',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
        serializeConfiguration: (d) => stripTitleName(d as Record<string, unknown>),
      });
    case 'jsFilter':
      return mk({
        type: 'js-filter',
        backendNodeType: 'jsFilter',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
        serializeConfiguration: (d: any) => ({ jsScript: String(d?.jsScript ?? '') }),
        getConnectionType: (port: { portID?: string; id?: string }) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'true') return 'True';
          if (pid === 'false') return 'False';
          if (pid === 'failure') return 'Failure';
          return 'Default';
        },
      });
    case 'endpoint/http':
      return mk({
        type: 'http-trigger',
        backendNodeType: 'endpoint/http',
        isEndpoint: true,
        deserializeEndpoint: deserializeHttpEndpoint,
        serializeConfiguration: () => ({}),
      });
    case 'endpoint/ws':
      return mk({
        type: 'ws-trigger',
        backendNodeType: 'endpoint/ws',
        isEndpoint: true,
        deserializeEndpoint: deserializeWsEndpoint,
        serializeConfiguration: () => ({}),
      });
    case 'endpoint/mqtt':
      return mk({
        type: 'mqtt-trigger',
        backendNodeType: 'endpoint/mqtt',
        isEndpoint: true,
        deserializeEndpoint: deserializeMqttEndpoint,
        serializeConfiguration: () => ({}),
      });
    case 'endpoint/schedule':
      return mk({
        type: 'schedule-trigger',
        backendNodeType: 'endpoint/schedule',
        isEndpoint: true,
        deserializeEndpoint: deserializeScheduleEndpoint,
        serializeConfiguration: () => ({}),
      });
    case 'endpoint/net':
      return mk({
        type: 'net-trigger',
        backendNodeType: 'endpoint/net',
        isEndpoint: true,
        deserializeEndpoint: deserializeNetEndpoint,
        serializeConfiguration: () => ({}),
      });
    default:
      return undefined;
  }
}

/** `buildRuleGoDslFromDocument` 使用 Flowgram 前端 type 作 key */
export function getRegistryForWorkflowToDsl(frontendType: string): RuleGoNodeRegistry | undefined {
  switch (frontendType) {
    case 'start-trigger':
      return mk({
        type: 'start-trigger',
        backendNodeType: 'startTrigger',
        serializeConfiguration: () => ({}),
        getConnectionType: (port: any) =>
          port?.portID === 'output' || port?.id === 'output' ? 'Success' : 'Default',
      });
    case 'http-trigger':
      return mk({
        type: 'http-trigger',
        backendNodeType: 'endpoint/http',
        isEndpoint: true,
        serializeEndpoint: serializeHttpEndpoint,
        serializeConfiguration: () => ({}),
        getConnectionType: (port: any) =>
          port?.portID === 'output' || port?.id === 'output' ? 'Success' : 'Default',
      });
    case 'ws-trigger':
      return mk({
        type: 'ws-trigger',
        backendNodeType: 'endpoint/ws',
        isEndpoint: true,
        serializeEndpoint: serializeWsEndpoint,
        serializeConfiguration: () => ({}),
        getConnectionType: (port: any) =>
          port?.portID === 'output' || port?.id === 'output' ? 'Success' : 'Default',
      });
    case 'mqtt-trigger':
      return mk({
        type: 'mqtt-trigger',
        backendNodeType: 'endpoint/mqtt',
        isEndpoint: true,
        serializeEndpoint: serializeMqttEndpoint,
        serializeConfiguration: () => ({}),
        getConnectionType: (port: any) =>
          port?.portID === 'output' || port?.id === 'output' ? 'Success' : 'Default',
      });
    case 'schedule-trigger':
      return mk({
        type: 'schedule-trigger',
        backendNodeType: 'endpoint/schedule',
        isEndpoint: true,
        serializeEndpoint: serializeScheduleEndpoint,
        serializeConfiguration: () => ({}),
        getConnectionType: (port: any) =>
          port?.portID === 'output' || port?.id === 'output' ? 'Success' : 'Default',
      });
    case 'net-trigger':
      return mk({
        type: 'net-trigger',
        backendNodeType: 'endpoint/net',
        isEndpoint: true,
        serializeEndpoint: serializeNetEndpoint,
        serializeConfiguration: () => ({}),
        getConnectionType: (port: any) =>
          port?.portID === 'output' || port?.id === 'output' ? 'Success' : 'Default',
      });
    case 'rest-api-call':
      return mk({
        type: 'rest-api-call',
        backendNodeType: 'restApiCall',
        serializeConfiguration: (d) => stripTitleName(d as Record<string, unknown>),
        getConnectionType: (port: any) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'success') return 'Success';
          if (pid === 'failure') return 'Failure';
          return 'Default';
        },
      });
    case 'for-loop':
      return mk({
        type: 'for-loop',
        backendNodeType: 'for',
        meta: { isContainer: true },
        serializeConfiguration: (d: any) => ({
          range: String(d?.range ?? ''),
          do: String(d?.do ?? ''),
          mode: Number(d?.mode ?? 0),
        }),
      });
    case 'llm':
      return mk({
        type: 'llm',
        backendNodeType: 'ai/llm',
        serializeConfiguration: (d) => stripTitleName(d as Record<string, unknown>),
      });
    case 'js-filter':
      return mk({
        type: 'js-filter',
        backendNodeType: 'jsFilter',
        serializeConfiguration: (d: any) => ({ jsScript: String(d?.jsScript ?? '') }),
        getConnectionType: (port: any) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'true') return 'True';
          if (pid === 'false') return 'False';
          if (pid === 'failure') return 'Failure';
          return 'Default';
        },
      });
    case 'block-start':
    case 'block-end':
      return mk({
        type: frontendType,
        backendNodeType: `internal:${frontendType}`,
        serializeConfiguration: () => ({}),
      });
    default:
      return undefined;
  }
}
