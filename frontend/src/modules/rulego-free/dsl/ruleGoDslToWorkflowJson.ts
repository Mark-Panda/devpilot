/**
 * RuleGo DSL → Flowgram WorkflowJSON（供 operation.fromJSON）
 * 约定见 openspec/.../03-dsl-adapter.md
 */

import type { RuleGoDsl } from '../types/dsl';
import { getNodeRegistryByBackendType } from '../nodes/registry';

import type { WorkflowJson } from './ruleGoDslToWorkflowJson.core';
import { ruleGoDslToWorkflowJsonWithRegistry } from './ruleGoDslToWorkflowJson.core';

export type {
  GetRegistryFn,
  WorkflowEdgeJson,
  WorkflowJson,
  WorkflowNodeJson,
} from './ruleGoDslToWorkflowJson.core';

export { ruleGoDslToWorkflowJsonWithRegistry } from './ruleGoDslToWorkflowJson.core';

/**
 * 将 RuleGo DSL 转为 Flowgram WorkflowJSON（使用应用内节点注册表）
 */
export function ruleGoDslToWorkflowJson(dsl: RuleGoDsl): WorkflowJson {
  return ruleGoDslToWorkflowJsonWithRegistry(dsl, getNodeRegistryByBackendType);
}
