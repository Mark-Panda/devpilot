/**
 * 从 DSL definition JSON 中解析 ruleChain 的启用状态（以 definition 为准，表中已无 enabled 字段）。
 * DSL 中 ruleChain.disabled === true 为停用，false 或未设置为启用。
 */
export function getEnabledFromDefinition(definition: string): boolean {
  if (!definition?.trim()) return false;
  try {
    const parsed = JSON.parse(definition);
    const chain = parsed?.ruleChain;
    if (chain == null || typeof chain !== "object") return true;
    if (typeof chain.disabled !== "boolean") return true;
    return !chain.disabled;
  } catch {
    return true;
  }
}

/**
 * 将 definition 中的 ruleChain.disabled 设为指定值，用于列表「开启/关闭」持久化。
 */
export function setDisabledInDefinition(definition: string, disabled: boolean): string {
  if (!definition?.trim()) return definition;
  try {
    const parsed = JSON.parse(definition);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (!parsed.ruleChain) parsed.ruleChain = {};
      parsed.ruleChain.disabled = disabled;
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // ignore
  }
  return definition;
}
