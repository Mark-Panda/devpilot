/**
 * 纯逻辑：校验节点注册表 type / backendNodeType 唯一性及非空（供构建前脚本或单测调用）
 */

import type { RuleGoNodeRegistry } from '../types';

export interface RegistryIntegrityResult {
  ok: boolean;
  errors: string[];
  count: number;
}

export function validateRulegoNodeRegistries(registries: RuleGoNodeRegistry[]): RegistryIntegrityResult {
  const errors: string[] = [];
  const types = new Map<string, number>();
  const backends = new Map<string, number>();

  registries.forEach((r, i) => {
    const t = String(r.type ?? '').trim();
    const b = String(r.backendNodeType ?? '').trim();
    if (!t) errors.push(`[${i}] type 为空`);
    if (!b) errors.push(`[${i}] backendNodeType 为空`);
    if (t) types.set(t, (types.get(t) ?? 0) + 1);
    if (b) backends.set(b, (backends.get(b) ?? 0) + 1);
  });

  for (const [t, n] of types) {
    if (n > 1) errors.push(`重复的 type: ${t} (${n} 次)`);
  }
  for (const [b, n] of backends) {
    if (n > 1) errors.push(`重复的 backendNodeType: ${b} (${n} 次)`);
  }

  return {
    ok: errors.length === 0,
    errors,
    count: registries.length,
  };
}

/** 与 tasks.md 约定：43 业务 + 2 哨兵 = 45 */
export const EXPECTED_REGISTRY_TOTAL = 45;
