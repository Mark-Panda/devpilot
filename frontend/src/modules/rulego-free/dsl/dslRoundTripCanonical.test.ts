import { describe, expect, it } from 'vitest';

import type { RuleGoDsl } from '../types/dsl';
import { buildRuleGoDslFromDocument } from './buildRuleGoDsl.core';
import { normalizeRuleGoDslForCompare } from './dslNormalize';
import { getRegistryForDslToWorkflow, getRegistryForWorkflowToDsl } from './roundTripRegistries';
import { ruleGoDslToWorkflowJsonWithRegistry } from './ruleGoDslToWorkflowJson.core';

function roundTrip(dsl: RuleGoDsl): RuleGoDsl {
  const w = ruleGoDslToWorkflowJsonWithRegistry(dsl, getRegistryForDslToWorkflow);
  return buildRuleGoDslFromDocument(
    w,
    dsl.ruleChain.name,
    {
      ruleId: dsl.ruleChain.id,
      debugMode: dsl.ruleChain.debugMode,
      root: dsl.ruleChain.root,
      enabled: dsl.ruleChain.disabled === undefined ? true : !dsl.ruleChain.disabled,
    },
    getRegistryForWorkflowToDsl
  );
}

describe('DSL ↔ Workflow 规范化 round-trip', () => {
  it('线性 Success 链', () => {
    const dsl: RuleGoDsl = {
      ruleChain: { id: 'rc-linear', name: '线性' },
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

    const again = roundTrip(dsl);
    expect(normalizeRuleGoDslForCompare(dsl)).toEqual(normalizeRuleGoDslForCompare(again));
  });

  it('ForLoop + Do 子节点', () => {
    const dsl: RuleGoDsl = {
      ruleChain: { id: 'rc-loop', name: '含 Loop' },
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

    const again = roundTrip(dsl);
    expect(normalizeRuleGoDslForCompare(dsl)).toEqual(normalizeRuleGoDslForCompare(again));
  });

  it('jsFilter True/False 分支', () => {
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
      ruleChain: { id: 'rc-filter', name: 'filter' },
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

    const again = roundTrip(dsl);
    expect(normalizeRuleGoDslForCompare(dsl)).toEqual(normalizeRuleGoDslForCompare(again));
  });
});
