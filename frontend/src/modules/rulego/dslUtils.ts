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
 * 判断规则链是否为子规则链（DSL 中 ruleChain.root === false）。
 * 用于子规则链组件的 targetId 下拉选项筛选。
 */
export function isSubRuleChain(definition: string): boolean {
  if (!definition?.trim()) return false;
  try {
    const parsed = JSON.parse(definition);
    const chain = parsed?.ruleChain;
    return chain != null && typeof chain === "object" && chain.root === false;
  } catch {
    return false;
  }
}

/** 从规则链 definition JSON 中解析 metadata.nodes，供 ref 节点 targetId 下拉（跨链 `chainId:nodeId`）等使用 */
export function extractNodesFromRuleDefinition(definition: string): Array<{ id: string; name: string }> {
  if (!definition?.trim()) return [];
  try {
    const parsed = JSON.parse(definition);
    const nodes = parsed?.metadata?.nodes;
    if (!Array.isArray(nodes)) return [];
    return nodes
      .map((n: { id?: string; name?: string }) => ({
        id: String(n?.id ?? "").trim(),
        name: String(n?.name ?? n?.id ?? "").trim(),
      }))
      .filter((n) => n.id.length > 0);
  } catch {
    return [];
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
