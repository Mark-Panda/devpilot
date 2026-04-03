/**
 * 将 RuleGo DSL 规范为可稳定对比的结构（排序键、节点/连线顺序、剥离布局噪声）。
 */

import type { RuleGoDsl } from '../types/dsl';

function sortKeysDeep(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = sortKeysDeep(o[k]);
    }
    return out;
  }
  return v;
}

function stripNodeAdditionalForCompare(
  a?: { parentContainer?: string; flowgramNodeType?: string; position?: unknown; [key: string]: unknown }
) {
  if (!a) return undefined;
  /** 仅保留语义字段；flowgramNodeType 可由 type 推导，不参与对比 */
  return a.parentContainer !== undefined ? { parentContainer: a.parentContainer } : undefined;
}

/**
 * 返回可 `expect(a).toEqual(b)` 的规范化快照（不含画布坐标等易变字段）。
 */
export function normalizeRuleGoDslForCompare(dsl: RuleGoDsl): unknown {
  const nodes = [...(dsl.metadata.nodes ?? [])]
    .sort((x, y) => x.id.localeCompare(y.id))
    .map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      debugMode: Boolean(n.debugMode),
      configuration: sortKeysDeep(n.configuration ?? {}),
      additionalInfo: stripNodeAdditionalForCompare(n.additionalInfo),
    }));

  const connections = [...(dsl.metadata.connections ?? [])].sort((a, b) => {
    const c = a.fromId.localeCompare(b.fromId);
    if (c !== 0) return c;
    const c2 = a.toId.localeCompare(b.toId);
    if (c2 !== 0) return c2;
    return a.type.localeCompare(b.type);
  });

  const endpoints = dsl.metadata.endpoints?.length
    ? [...dsl.metadata.endpoints]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((e) => ({
          id: String(e.id),
          type: e.type,
          ...(e.name !== undefined ? { name: e.name } : {}),
          configuration: sortKeysDeep(e.configuration ?? {}),
        }))
    : undefined;

  return {
    ruleChain: {
      id: dsl.ruleChain.id,
      name: dsl.ruleChain.name,
      debugMode: Boolean(dsl.ruleChain.debugMode),
      root: dsl.ruleChain.root !== false,
      disabled: Boolean(dsl.ruleChain.disabled),
      configuration: sortKeysDeep(dsl.ruleChain.configuration ?? {}),
    },
    metadata: {
      firstNodeIndex: dsl.metadata.firstNodeIndex ?? 0,
      nodes,
      connections,
      ...(endpoints ? { endpoints } : {}),
    },
  };
}
