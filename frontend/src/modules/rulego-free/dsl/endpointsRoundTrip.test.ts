import { describe, expect, it } from 'vitest';

import type { RuleGoDsl } from '../types/dsl';

import { buildRuleGoDslFromDocument } from './buildRuleGoDsl.core';
import {
  getRegistryForDslToWorkflow,
  getRegistryForWorkflowToDsl,
} from './roundTripRegistries';
import { ruleGoDslToWorkflowJsonWithRegistry } from './ruleGoDslToWorkflowJson.core';

describe('Endpoint metadata.endpoints（5 种）Workflow→DSL→Workflow', () => {
  const cases: Array<{
    name: string;
    flowType: string;
    backendEp: string;
    data: Record<string, unknown>;
  }> = [
    {
      name: 'HTTP',
      flowType: 'http-trigger',
      backendEp: 'endpoint/http',
      data: {
        name: 'HTTP 端点',
        server: ':9090',
        allowCors: false,
        routerId: 'r_hook',
        method: 'POST',
        path: '/api/v1/hook',
        to: 'chain:default',
        wait: false,
        toProcessors: '',
        extraRoutersJson: '',
      },
    },
    {
      name: 'WS',
      flowType: 'ws-trigger',
      backendEp: 'endpoint/ws',
      data: {
        name: 'WebSocket 端点',
        server: ':9090',
        routerId: 'ws',
        method: 'GET',
        path: '/ws',
        to: 'chain:default',
        wait: false,
        extraRoutersJson: '',
      },
    },
    {
      name: 'MQTT',
      flowType: 'mqtt-trigger',
      backendEp: 'endpoint/mqtt',
      data: {
        name: 'MQTT 端点',
        server: '127.0.0.1:1883',
        username: '',
        password: '',
        qos: 1,
        clientId: 'rulego_mqtt',
        routerId: 'sensors_data',
        path: 'sensors/+/data',
        fromProcessors: '',
        to: 'chain:default',
        extraRoutersJson: '',
      },
    },
    {
      name: 'Schedule',
      flowType: 'schedule-trigger',
      backendEp: 'endpoint/schedule',
      data: {
        name: '定时端点',
        server: '',
        cron: '0 0 * * * *',
        to: 'chain:default',
        epProcessors: '',
        extraRoutersJson: '',
      },
    },
    {
      name: 'Net',
      flowType: 'net-trigger',
      backendEp: 'endpoint/net',
      data: {
        name: 'TCP/UDP 端点',
        protocol: 'tcp',
        server: ':8888',
        path: '.*',
        to: 'chain:default',
        extraRoutersJson: '',
      },
    },
  ];

  for (const c of cases) {
    it(`${c.name}: 序列化 type 与 round-trip data`, () => {
      const doc = {
        nodes: [
          {
            id: 'ep1',
            type: c.flowType,
            meta: { position: { x: 10, y: 20 } },
            data: c.data,
          },
        ],
        edges: [],
      };

      const dsl = buildRuleGoDslFromDocument(doc, 't', {}, getRegistryForWorkflowToDsl);
      const eps = dsl.metadata?.endpoints ?? [];
      expect(eps).toHaveLength(1);
      expect(eps[0].type).toBe(c.backendEp);
      expect(String(eps[0].id)).toBe('ep1');

      const wf = ruleGoDslToWorkflowJsonWithRegistry(dsl as RuleGoDsl, getRegistryForDslToWorkflow);
      expect(wf.nodes).toHaveLength(1);
      expect(wf.nodes[0].type).toBe(c.flowType);
      expect(wf.nodes[0].data).toMatchObject(c.data);
    });
  }
});
