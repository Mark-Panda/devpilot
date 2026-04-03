import { describe, expect, it } from 'vitest';

import type { RuleGoNodeRegistry } from '../types';
import { EXPECTED_REGISTRY_TOTAL, validateRulegoNodeRegistries } from './registryIntegrity';

function stubReg(p: Partial<RuleGoNodeRegistry> & Pick<RuleGoNodeRegistry, 'type' | 'backendNodeType'>): RuleGoNodeRegistry {
  return {
    category: 'action',
    info: { icon: '', description: '' },
    meta: {},
    onAdd: () => ({ data: {} }),
    formMeta: { render: () => null as any },
    ...p,
  } as RuleGoNodeRegistry;
}

describe('validateRulegoNodeRegistries', () => {
  it('通过：唯一 type 与 backendNodeType', () => {
    const r = validateRulegoNodeRegistries([
      stubReg({ type: 'a', backendNodeType: 'A' }),
      stubReg({ type: 'b', backendNodeType: 'B' }),
    ]);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(r.errors).toEqual([]);
  });

  it('失败：重复 type', () => {
    const r = validateRulegoNodeRegistries([
      stubReg({ type: 'x', backendNodeType: 'A' }),
      stubReg({ type: 'x', backendNodeType: 'B' }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('重复的 type'))).toBe(true);
  });

  it('失败：重复 backendNodeType', () => {
    const r = validateRulegoNodeRegistries([
      stubReg({ type: 'a', backendNodeType: 'Z' }),
      stubReg({ type: 'b', backendNodeType: 'Z' }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('重复的 backendNodeType'))).toBe(true);
  });

  it('EXPECTED_REGISTRY_TOTAL 与 tasks.md 约定一致', () => {
    expect(EXPECTED_REGISTRY_TOTAL).toBe(45);
  });
});
