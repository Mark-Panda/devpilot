/**
 * DSL 适配层导出
 */

export { buildRuleGoDsl, buildRuleGoDslFromDocument } from './buildRuleGoDsl';
export { loadRuleGoDsl } from './loadRuleGoDsl';
export {
  ruleGoDslToWorkflowJson,
  ruleGoDslToWorkflowJsonWithRegistry,
} from './ruleGoDslToWorkflowJson';
export type { GetRegistryFn, WorkflowJson, WorkflowNodeJson, WorkflowEdgeJson } from './ruleGoDslToWorkflowJson.core';
export * from './nodeTypeMapping';
export * from './errors';
export { normalizeRuleGoDslForCompare } from './dslNormalize';
