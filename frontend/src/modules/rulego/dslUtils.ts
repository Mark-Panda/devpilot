/**
 * 从 DSL definition JSON 中解析 ruleChain 的启用状态。
 * DSL 中为 ruleChain.disabled（true=停用，false=启用），与接口 enabled 含义相反。
 * @returns 若 DSL 中存在 ruleChain.disabled 则返回对应的 enabled；否则返回 undefined，由调用方用 rule.enabled 兜底。
 */
export function getEnabledFromDefinition(definition: string): boolean | undefined {
  if (!definition?.trim()) return undefined;
  try {
    const parsed = JSON.parse(definition);
    const chain = parsed?.ruleChain;
    if (chain == null || typeof chain !== "object") return undefined;
    if (typeof chain.disabled !== "boolean") return undefined;
    return !chain.disabled;
  } catch {
    return undefined;
  }
}
