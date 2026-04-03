import { describe, expect, it } from 'vitest';

import type { RuleGoNodeRegistry } from '../types';
import { buildRuleGoDslFromDocument } from './buildRuleGoDsl.core';
import { ConnectionError } from './dslErrors';

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

/**
 * 与 `rulegoNodeRegistries` 中 7 类节点对应的最小桩，避免 vitest 加载带 Semi 的全量 registry
 */
function mockRegistryForSevenTypes(frontendType: string): RuleGoNodeRegistry | undefined {
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
        serializeEndpoint: (node: any) => ({
          id: String(node.id),
          type: 'endpoint/http',
          name: 'ep',
          configuration: {},
          routers: [{ id: 'r1', params: ['POST'], from: { path: '/' }, to: { path: 'chain:default' } }],
        }),
        getConnectionType: (port: any) =>
          port?.portID === 'output' ? 'Success' : 'Default',
      });
    case 'rest-api-call':
      return mk({
        type: 'rest-api-call',
        backendNodeType: 'restApiCall',
        getConnectionType: (port: any) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'success') return 'Success';
          if (pid === 'failure') return 'Failure';
          return 'Default';
        },
      });
    case 'llm':
      return mk({
        type: 'llm',
        backendNodeType: 'ai/llm',
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
    case 'js-transform':
      return mk({
        type: 'js-transform',
        backendNodeType: 'jsTransform',
        serializeConfiguration: (d: any) => ({ jsScript: String(d?.jsScript ?? '') }),
        getConnectionType: (port: any) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'success') return 'Success';
          if (pid === 'failure') return 'Failure';
          return 'Default';
        },
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
    case 'fork':
      return mk({
        type: 'fork',
        backendNodeType: 'fork',
        serializeConfiguration: (d: any) => ({ branchCount: Number(d?.branchCount ?? 2) }),
        getConnectionType: (port: any) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'failure') return 'Failure';
          if (typeof pid === 'string' && /^branch_\d+$/.test(pid)) return 'Success';
          return 'Default';
        },
      });
    case 'switch':
      return mk({
        type: 'switch',
        backendNodeType: 'switch',
        serializeConfiguration: (d: any) => ({ cases: (d as { cases?: unknown })?.cases ?? [{ case: 'true' }] }),
        getConnectionType: (port: any) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'default') return 'Default';
          if (pid === 'failure') return 'Failure';
          const m = /^case_(\d+)$/.exec(String(pid ?? ''));
          if (m) return `Case${m[1]}`;
          return 'Default';
        },
      });
    case 'join':
      return mk({
        type: 'join',
        backendNodeType: 'join',
        serializeConfiguration: (d: any) => ({
          timeout: Number(d?.timeout ?? 0) || 0,
          mergeToMap: Boolean(d?.mergeToMap),
        }),
        getConnectionType: (port: any) => {
          const pid = port?.portID ?? port?.id;
          if (pid === 'success') return 'Success';
          if (pid === 'failure') return 'Failure';
          return 'Default';
        },
      });
    default:
      return undefined;
  }
}

describe('buildRuleGoDslFromDocument', () => {
  it('serializes seven registered node kinds (6 metadata.nodes + 1 endpoint)', () => {
    const doc = {
      nodes: [
        { id: 's1', type: 'start-trigger', data: {}, meta: {} },
        { id: 'h1', type: 'http-trigger', data: { name: 'ep' }, meta: {} },
        { id: 'r1', type: 'rest-api-call', data: { title: 'R', restEndpointUrlPattern: 'http://x' }, meta: {} },
        { id: 'l1', type: 'llm', data: { title: 'L', model: 'm' }, meta: {} },
        {
          id: 'f1',
          type: 'for-loop',
          data: { range: '1..2', do: '', mode: 0 },
          meta: {},
          blocks: [
            { id: 'bs', type: 'block-start', data: {}, meta: {} },
            { id: 'c1', type: 'llm', data: { model: 'x' }, meta: {} },
            { id: 'be', type: 'block-end', data: {}, meta: {} },
          ],
          edges: [
            { sourceNodeID: 'bs', targetNodeID: 'c1', sourcePortID: 'output', targetPortID: 'input' },
          ],
        },
        { id: 'jt', type: 'js-transform', data: { jsScript: 'return 1;' }, meta: {} },
        { id: 'jf', type: 'js-filter', data: { jsScript: 'return true;' }, meta: {} },
      ],
      edges: [
        { sourceNodeID: 's1', targetNodeID: 'r1', sourcePortID: 'output', targetPortID: 'input' },
        { sourceNodeID: 'jf', targetNodeID: 'jt', sourcePortID: 'true', targetPortID: 'input' },
      ],
    };

    const dsl = buildRuleGoDslFromDocument(doc, '链 T3.1', {}, mockRegistryForSevenTypes);

    expect(dsl.ruleChain.name).toBe('链 T3.1');
    expect(dsl.metadata.endpoints).toHaveLength(1);
    expect(dsl.metadata.endpoints?.[0].type).toBe('endpoint/http');

    const types = (dsl.metadata.nodes ?? []).map((n) => n.type).sort();
    expect(types).toEqual(
      ['ai/llm', 'ai/llm', 'for', 'jsFilter', 'jsTransform', 'restApiCall', 'startTrigger'].sort()
    );

    const forNode = dsl.metadata.nodes?.find((n) => n.type === 'for');
    expect(forNode?.configuration?.do).toBe('c1');

    const conns = dsl.metadata.connections ?? [];
    expect(conns.some((c) => c.type === 'Do' && c.fromId === 'f1' && c.toId === 'c1')).toBe(true);
    expect(conns.some((c) => c.type === 'True' && c.fromId === 'jf' && c.toId === 'jt')).toBe(true);
  });

  it('produces valid JSON round-trip shape', () => {
    const doc = {
      nodes: [{ id: 's1', type: 'start-trigger', data: {}, meta: {} }],
      edges: [],
    };
    const dsl = buildRuleGoDslFromDocument(doc, 'x', { ruleId: 'rid' }, mockRegistryForSevenTypes);
    const json = JSON.stringify(dsl);
    const back = JSON.parse(json);
    expect(back.metadata.nodes).toHaveLength(1);
    expect(back.ruleChain.id).toBe('rid');
  });

  it('T7.1: fork 出边按 branch_N 排序后再写入 DSL（避免 Success 顺序与端口错位）', () => {
    const doc = {
      nodes: [
        { id: 'fk1', type: 'fork', data: { branchCount: 2 }, meta: {} },
        { id: 'na', type: 'rest-api-call', data: { title: 'A' }, meta: {} },
        { id: 'nb', type: 'rest-api-call', data: { title: 'B' }, meta: {} },
      ],
      edges: [
        { sourceNodeID: 'fk1', targetNodeID: 'nb', sourcePortID: 'branch_1', targetPortID: 'input' },
        { sourceNodeID: 'fk1', targetNodeID: 'na', sourcePortID: 'branch_0', targetPortID: 'input' },
      ],
    };
    const dsl = buildRuleGoDslFromDocument(doc, 'fork-order', {}, mockRegistryForSevenTypes);
    const fromFork = (dsl.metadata.connections ?? []).filter((c) => c.fromId === 'fk1' && c.type === 'Success');
    expect(fromFork.map((c) => c.toId)).toEqual(['na', 'nb']);
  });

  it('T7.1: switch 出边按 case_N / default / failure 稳定排序', () => {
    const doc = {
      nodes: [
        { id: 'sw1', type: 'switch', data: { cases: [{ case: 'a' }, { case: 'b' }] }, meta: {} },
        { id: 'n1', type: 'rest-api-call', data: {}, meta: {} },
        { id: 'n2', type: 'rest-api-call', data: {}, meta: {} },
        { id: 'n3', type: 'rest-api-call', data: {}, meta: {} },
      ],
      edges: [
        { sourceNodeID: 'sw1', targetNodeID: 'n3', sourcePortID: 'default', targetPortID: 'input' },
        { sourceNodeID: 'sw1', targetNodeID: 'n1', sourcePortID: 'case_0', targetPortID: 'input' },
        { sourceNodeID: 'sw1', targetNodeID: 'n2', sourcePortID: 'case_1', targetPortID: 'input' },
      ],
    };
    const dsl = buildRuleGoDslFromDocument(doc, 'sw-order', {}, mockRegistryForSevenTypes);
    const fromSw = (dsl.metadata.connections ?? []).filter((c) => c.fromId === 'sw1');
    expect(fromSw.map((c) => c.type)).toEqual(['Case0', 'Case1', 'Default']);
    expect(fromSw.map((c) => c.toId)).toEqual(['n1', 'n2', 'n3']);
  });

  it('T7.3: 连线引用未知节点时抛出 ConnectionError', () => {
    const doc = {
      nodes: [{ id: 'a', type: 'start-trigger', data: {}, meta: {} }],
      edges: [
        {
          sourceNodeID: 'a',
          targetNodeID: 'ghost',
          sourcePortID: 'output',
          targetPortID: 'input',
        },
      ],
    };
    expect(() => buildRuleGoDslFromDocument(doc, 'x', {}, mockRegistryForSevenTypes)).toThrow(
      ConnectionError
    );
  });

  it('T7.4: 100 节点线性链 DSL 构建在合理时间内完成', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      id: `n${i}`,
      type: 'rest-api-call',
      meta: { position: { x: i * 10, y: 0 } },
      data: {
        title: `N${i}`,
        restEndpointUrlPattern: 'http://localhost/x',
        requestMethod: 'GET',
        headers: {},
        query: {},
        body: '',
        timeout: 30000,
        maxParallelRequestsCount: 200,
      },
    }));
    const edges = Array.from({ length: 99 }, (_, i) => ({
      sourceNodeID: `n${i}`,
      targetNodeID: `n${i + 1}`,
      sourcePortID: 'success',
      targetPortID: 'input',
    }));
    const doc = { nodes, edges };
    const t0 = performance.now();
    buildRuleGoDslFromDocument(doc, 'perf', {}, mockRegistryForSevenTypes);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(500);
  });

  it('T7.1: join 的 extraIncomings 补全为 metadata.connections', () => {
    const doc = {
      nodes: [
        { id: 'r1', type: 'rest-api-call', data: {}, meta: {} },
        {
          id: 'j1',
          type: 'join',
          data: { timeout: 0, mergeToMap: false, extraIncomings: ['r2'] },
          meta: {},
        },
        { id: 'r2', type: 'rest-api-call', data: {}, meta: {} },
      ],
      edges: [{ sourceNodeID: 'r1', targetNodeID: 'j1', sourcePortID: 'success', targetPortID: 'input' }],
    };
    const dsl = buildRuleGoDslFromDocument(doc, 'join-extra', {}, mockRegistryForSevenTypes);
    const toJoin = (dsl.metadata.connections ?? []).filter((c) => c.toId === 'j1' && c.type === 'Success');
    expect(toJoin.map((c) => c.fromId).sort()).toEqual(['r1', 'r2']);
  });
});
