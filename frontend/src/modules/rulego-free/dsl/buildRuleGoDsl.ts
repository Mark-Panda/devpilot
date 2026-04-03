/**
 * 构建 RuleGo DSL (Flowgram → RuleGo)
 *
 * 实现要点见 `openspec/changes/migrate-to-flowgram-editor/specs/03-dsl-adapter.md`
 */

import type { BuildDslOptions } from '../types/dsl';
import { getNodeRegistry } from '../nodes/registry';

import { buildRuleGoDslFromDocument } from './buildRuleGoDsl.core';

export { buildRuleGoDslFromDocument } from './buildRuleGoDsl.core';
export type { GetNodeRegistryFn } from './buildRuleGoDsl.core';
export { formatDslError } from './dslErrors';

/**
 * 构建 RuleGo DSL
 *
 * @param ctx - Flowgram 编辑器上下文（需含 `document.toJSON()`）
 */
export function buildRuleGoDsl(
  ctx: any,
  ruleName: string,
  options: BuildDslOptions = {}
): string {
  const doc = ctx.document?.toJSON?.() ?? { nodes: [], edges: [] };
  const dsl = buildRuleGoDslFromDocument(doc, ruleName, options, getNodeRegistry);
  return JSON.stringify(dsl, null, 2);
}
