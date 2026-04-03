import { describe, expect, it } from 'vitest';

import type { RuleGoNodeRegistry } from '../types';
import type { RuleGoDsl } from '../types/dsl';
import { ruleGoDslToWorkflowJsonWithRegistry } from './ruleGoDslToWorkflowJson.core';

/** 内存注册表，避免 vitest 加载带 Semi/React 的 registry 全量 */
function mockGetRegistry(bt: string): RuleGoNodeRegistry | undefined {
  const base = {
    category: 'data' as const,
    info: { icon: '', description: '' },
    onAdd: () => ({ data: {} }),
    formMeta: { render: () => null },
    serializeConfiguration: () => ({}),
    getConnectionType: () => 'Success',
  };

  switch (bt) {
    case 'startTrigger':
      return {
        ...base,
        type: 'start-trigger',
        backendNodeType: 'startTrigger',
        meta: {},
        deserializeConfiguration: () => ({}),
      };
    case 'restApiCall':
      return {
        ...base,
        type: 'rest-api-call',
        backendNodeType: 'restApiCall',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
      };
    case 'for':
      return {
        ...base,
        type: 'for-loop',
        backendNodeType: 'for',
        meta: { isContainer: true },
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
      };
    case 'ai/llm':
      return {
        ...base,
        type: 'llm',
        backendNodeType: 'ai/llm',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
      };
    case 'jsFilter':
      return {
        ...base,
        type: 'js-filter',
        backendNodeType: 'jsFilter',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
      };
    case 'switch':
      return {
        ...base,
        type: 'switch',
        backendNodeType: 'switch',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
      };
    case 'fork':
      return {
        ...base,
        type: 'fork',
        backendNodeType: 'fork',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({ ...c }),
        getConnectionType: (port: { portID?: string; id?: string }) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'failure') return 'Failure';
          if (typeof pid === 'string' && /^branch_\d+$/.test(pid)) return 'Success';
          return 'Default';
        },
      };
    case 'join':
      return {
        ...base,
        type: 'join',
        backendNodeType: 'join',
        meta: {},
        deserializeConfiguration: (c: Record<string, unknown>) => ({
          timeout: Number((c as { timeout?: unknown }).timeout ?? 0) || 0,
          mergeToMap: Boolean((c as { mergeToMap?: unknown }).mergeToMap),
        }),
        getConnectionType: (port: { portID?: string; id?: string }) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'success') return 'Success';
          if (pid === 'failure') return 'Failure';
          return 'Default';
        },
      };
    default:
      return undefined;
  }
}

describe('ruleGoDslToWorkflowJsonWithRegistry', () => {
  it('maps linear Success chain to root nodes and edges', () => {
    const dsl: RuleGoDsl = {
      ruleChain: { id: 'rc1', name: '线性' },
      metadata: {
        firstNodeIndex: 0,
        nodes: [
          {
            id: 'n_start',
            type: 'startTrigger',
            name: '开始',
            configuration: {},
            additionalInfo: { position: { x: 10, y: 20 } },
          },
          {
            id: 'n_rest',
            type: 'restApiCall',
            name: 'API',
            configuration: {
              restEndpointUrlPattern: 'http://x',
              requestMethod: 'GET',
              headers: {},
              query: {},
              body: '',
              timeout: 1000,
              maxParallelRequestsCount: 1,
            },
            additionalInfo: {},
          },
        ],
        connections: [{ fromId: 'n_start', toId: 'n_rest', type: 'Success' }],
        ruleChainConnections: [],
      },
    };

    const w = ruleGoDslToWorkflowJsonWithRegistry(dsl, mockGetRegistry);
    expect(w.nodes.map((x) => x.type)).toEqual(['start-trigger', 'rest-api-call']);
    expect(w.edges).toHaveLength(1);
    expect(w.edges[0]).toMatchObject({
      sourceNodeID: 'n_start',
      targetNodeID: 'n_rest',
      sourcePortID: 'output',
      targetPortID: 'input',
    });
  });

  it('expands for-loop with Do child into container blocks and inner edges', () => {
    const dsl: RuleGoDsl = {
      ruleChain: { id: 'rc2', name: '含 Loop' },
      metadata: {
        firstNodeIndex: 0,
        nodes: [
          {
            id: 'for1',
            type: 'for',
            name: 'F',
            configuration: { range: '1..2', do: 'sub_llm', mode: 0 },
            additionalInfo: { position: { x: 0, y: 0 } },
          },
          {
            id: 'sub_llm',
            type: 'ai/llm',
            name: 'L',
            configuration: {
              url: 'https://x',
              key: '',
              model: 'm',
              models: [],
              systemPrompt: '',
              messages: [],
              params: {
                temperature: 0,
                topP: 0,
                presencePenalty: 0,
                frequencyPenalty: 0,
                maxTokens: 1,
                stop: [],
                responseFormat: 'text',
              },
              enabled_skill_names: [],
            },
            additionalInfo: { parentContainer: 'for1' },
          },
        ],
        connections: [{ fromId: 'for1', toId: 'sub_llm', type: 'Do' }],
        ruleChainConnections: [],
      },
    };

    const w = ruleGoDslToWorkflowJsonWithRegistry(dsl, mockGetRegistry);
    expect(w.nodes).toHaveLength(1);
    expect(w.nodes[0].type).toBe('for-loop');
    const blocks = w.nodes[0].blocks ?? [];
    expect(blocks.some((b) => b.type === 'block-start')).toBe(true);
    expect(blocks.some((b) => b.type === 'block-end')).toBe(true);
    expect(blocks.some((b) => b.id === 'sub_llm')).toBe(true);
    const inner = w.nodes[0].edges ?? [];
    expect(inner.some((e) => e.targetNodeID === 'sub_llm')).toBe(true);
    /** 子节点在容器 blocks 内具备 meta.position，供 Flowgram 子画布布局（与「真机显示」一致的数据前提） */
    const sub = blocks.find((b) => b.id === 'sub_llm');
    expect(sub?.meta?.position).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    );
  });

  it('maps True/False connections from jsFilter to correct source ports', () => {
    const restCfg = {
      restEndpointUrlPattern: 'http://x',
      requestMethod: 'GET' as const,
      headers: {},
      query: {},
      body: '',
      timeout: 1000,
      maxParallelRequestsCount: 1,
    };
    const dsl: RuleGoDsl = {
      ruleChain: { id: 'rc3', name: 'filter' },
      metadata: {
        firstNodeIndex: 0,
        nodes: [
          {
            id: 'jf1',
            type: 'jsFilter',
            name: 'Cond',
            configuration: { jsScript: 'return true;' },
            additionalInfo: { position: { x: 0, y: 0 } },
          },
          {
            id: 'on_true',
            type: 'restApiCall',
            name: 'T',
            configuration: restCfg,
            additionalInfo: {},
          },
          {
            id: 'on_false',
            type: 'restApiCall',
            name: 'F',
            configuration: restCfg,
            additionalInfo: {},
          },
        ],
        connections: [
          { fromId: 'jf1', toId: 'on_true', type: 'True' },
          { fromId: 'jf1', toId: 'on_false', type: 'False' },
        ],
        ruleChainConnections: [],
      },
    };

    const w = ruleGoDslToWorkflowJsonWithRegistry(dsl, mockGetRegistry);
    expect(w.edges).toHaveLength(2);
    expect(w.edges.find((e) => e.targetNodeID === 'on_true')).toMatchObject({
      sourcePortID: 'true',
    });
    expect(w.edges.find((e) => e.targetNodeID === 'on_false')).toMatchObject({
      sourcePortID: 'false',
    });
  });

  it('maps Case0 / Default from switch to workflow source ports', () => {
    const restCfg = {
      restEndpointUrlPattern: 'http://x',
      requestMethod: 'GET' as const,
      headers: {},
      query: {},
      body: '',
      timeout: 1000,
      maxParallelRequestsCount: 1,
    };
    const dsl: RuleGoDsl = {
      ruleChain: { id: 'rc-sw', name: 'switch' },
      metadata: {
        firstNodeIndex: 0,
        nodes: [
          {
            id: 'sw1',
            type: 'switch',
            name: 'S',
            configuration: { cases: [{ case: 'msg.ok' }] },
            additionalInfo: { position: { x: 0, y: 0 } },
          },
          {
            id: 'na',
            type: 'restApiCall',
            name: 'A',
            configuration: restCfg,
            additionalInfo: {},
          },
          {
            id: 'nb',
            type: 'restApiCall',
            name: 'B',
            configuration: restCfg,
            additionalInfo: {},
          },
        ],
        connections: [
          { fromId: 'sw1', toId: 'na', type: 'Case0' },
          { fromId: 'sw1', toId: 'nb', type: 'Default' },
        ],
        ruleChainConnections: [],
      },
    };

    const w = ruleGoDslToWorkflowJsonWithRegistry(dsl, mockGetRegistry);
    expect(w.edges).toHaveLength(2);
    expect(w.edges.find((e) => e.targetNodeID === 'na')).toMatchObject({ sourcePortID: 'case_0' });
    expect(w.edges.find((e) => e.targetNodeID === 'nb')).toMatchObject({ sourcePortID: 'default' });
  });

  it('maps fork parallel Success edges to branch_0 / branch_1 and sets branchCount on workflow node', () => {
    const restCfg = {
      restEndpointUrlPattern: 'http://x',
      requestMethod: 'GET' as const,
      headers: {},
      query: {},
      body: '',
      timeout: 1000,
      maxParallelRequestsCount: 1,
    };
    const dsl: RuleGoDsl = {
      ruleChain: { id: 'rc-fork', name: 'fork' },
      metadata: {
        firstNodeIndex: 0,
        nodes: [
          {
            id: 'fk1',
            type: 'fork',
            name: 'F',
            configuration: { branchCount: 2 },
            additionalInfo: { position: { x: 0, y: 0 } },
          },
          {
            id: 'na',
            type: 'restApiCall',
            name: 'A',
            configuration: restCfg,
            additionalInfo: {},
          },
          {
            id: 'nb',
            type: 'restApiCall',
            name: 'B',
            configuration: restCfg,
            additionalInfo: {},
          },
        ],
        connections: [
          { fromId: 'fk1', toId: 'na', type: 'Success' },
          { fromId: 'fk1', toId: 'nb', type: 'Success' },
        ],
        ruleChainConnections: [],
      },
    };

    const w = ruleGoDslToWorkflowJsonWithRegistry(dsl, mockGetRegistry);
    expect(w.edges).toHaveLength(2);
    expect(w.edges.find((e) => e.targetNodeID === 'na')).toMatchObject({ sourcePortID: 'branch_0' });
    expect(w.edges.find((e) => e.targetNodeID === 'nb')).toMatchObject({ sourcePortID: 'branch_1' });
    const forkWf = w.nodes.find((n) => n.id === 'fk1');
    expect(forkWf?.data).toMatchObject({ branchCount: 2 });
  });

  it('join: first Success becomes edge, rest go to extraIncomings', () => {
    const restCfg = {
      restEndpointUrlPattern: 'http://x',
      requestMethod: 'GET' as const,
      headers: {},
      query: {},
      body: '',
      timeout: 1000,
      maxParallelRequestsCount: 1,
    };
    const dsl: RuleGoDsl = {
      ruleChain: { id: 'rc-join', name: 'join' },
      metadata: {
        firstNodeIndex: 0,
        nodes: [
          {
            id: 'r1',
            type: 'restApiCall',
            name: 'R1',
            configuration: restCfg,
            additionalInfo: {},
          },
          {
            id: 'r2',
            type: 'restApiCall',
            name: 'R2',
            configuration: restCfg,
            additionalInfo: {},
          },
          {
            id: 'j1',
            type: 'join',
            name: 'J',
            configuration: { timeout: 0, mergeToMap: false },
            additionalInfo: { position: { x: 0, y: 0 } },
          },
        ],
        connections: [
          { fromId: 'r1', toId: 'j1', type: 'Success' },
          { fromId: 'r2', toId: 'j1', type: 'Success' },
        ],
        ruleChainConnections: [],
      },
    };

    const w = ruleGoDslToWorkflowJsonWithRegistry(dsl, mockGetRegistry);
    expect(w.edges).toHaveLength(1);
    expect(w.edges[0]).toMatchObject({
      sourceNodeID: 'r1',
      targetNodeID: 'j1',
      targetPortID: 'input',
    });
    const joinWf = w.nodes.find((n) => n.id === 'j1');
    expect((joinWf?.data as { extraIncomings?: string[] })?.extraIncomings).toEqual(['r2']);
  });
});
