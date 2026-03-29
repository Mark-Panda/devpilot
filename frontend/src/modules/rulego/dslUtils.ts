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
/** 与表单/编辑器一致：ruleChain.root === false 为子规则链，缺省或非 false 为根规则链；无定义或 JSON 无效为 unknown */
export function getRuleChainRootKind(definition: string): "root" | "sub" | "unknown" {
  if (!definition?.trim()) return "unknown";
  try {
    const parsed = JSON.parse(definition);
    const chain = parsed?.ruleChain;
    if (chain == null || typeof chain !== "object") return "root";
    if (chain.root === false) return "sub";
    return "root";
  } catch {
    return "unknown";
  }
}

export function isSubRuleChain(definition: string): boolean {
  return getRuleChainRootKind(definition) === "sub";
}

/** 从规则链 definition JSON 中解析 metadata.nodes，供 ref 节点 targetId 下拉（跨链 `chainId:nodeId`）等使用 */
/** 从子规则链 DSL 提取节点类型/名称短摘要，供 Agent 规划判断是否可复用 flow/targetId */
export function summarizeRuleNodesForAgent(definition: string, maxNodes = 20): string {
  if (!definition?.trim()) return "";
  try {
    const parsed = JSON.parse(definition);
    const nodes = parsed?.metadata?.nodes;
    if (!Array.isArray(nodes)) return "";
    const parts: string[] = [];
    for (let i = 0; i < nodes.length && i < maxNodes; i++) {
      const n = nodes[i] as { type?: string; name?: string };
      const t = String(n?.type ?? "").trim();
      const nm = String(n?.name ?? "").trim();
      if (!t && !nm) continue;
      parts.push(nm ? `${t}(${nm})` : t);
    }
    const suffix = nodes.length > maxNodes ? ` …共${nodes.length}个节点` : "";
    return parts.length ? `${parts.join("、")}${suffix}` : "";
  } catch {
    return "";
  }
}

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
