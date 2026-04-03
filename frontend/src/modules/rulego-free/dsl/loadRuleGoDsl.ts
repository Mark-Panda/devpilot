/**
 * 加载 RuleGo DSL (RuleGo → Flowgram)
 *
 * 将 RuleGo 后端的 DSL 格式转换为 Flowgram 编辑器的内部数据
 */

import type { RuleGoDsl } from '../types/dsl';

import { InvalidDslFormatError } from './dslErrors';
import { ruleGoDslToWorkflowJson } from './ruleGoDslToWorkflowJson';

/**
 * 加载 RuleGo DSL 到编辑器
 *
 * @param dslJson - RuleGo DSL 对象
 * @param ctx - Flowgram 编辑器上下文（需含 `operation.fromJSON`）
 */
export function loadRuleGoDsl(dslJson: RuleGoDsl, ctx: any): void {
  if (!dslJson?.metadata) {
    throw new InvalidDslFormatError('无效的 DSL：缺少 metadata');
  }

  const workflow = ruleGoDslToWorkflowJson(dslJson);

  const op = ctx.operation;
  if (typeof op?.fromJSON !== 'function') {
    throw new InvalidDslFormatError('编辑器上下文无效：缺少 operation.fromJSON');
  }

  try {
    op.startTransaction?.();
    op.fromJSON(workflow);
  } finally {
    op.endTransaction?.();
  }

  try {
    ctx.tools?.fitView?.(false);
  } catch {
    /* ignore */
  }
}
