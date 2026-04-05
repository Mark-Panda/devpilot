/**
 * 规则管理「从 JSON 导入」与编辑器 DSL 导入共用校验：须为含 ruleChain、metadata 的规则链对象。
 * 返回格式化后的 definition 字符串，供 CreateRuleGoRule 使用。
 */
export function buildRuleDefinitionFromImport(
  raw: string,
  options: { nameFallback?: string }
): string {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    throw new Error("请输入 JSON 或选择 .json 文件");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("JSON 解析失败，请检查格式");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("须为 JSON 对象（不能是数组或原始值）");
  }
  const root = parsed as Record<string, unknown>;
  if (!root.ruleChain || typeof root.ruleChain !== "object" || Array.isArray(root.ruleChain)) {
    throw new Error("须包含 ruleChain 对象");
  }
  const chain = root.ruleChain as Record<string, unknown>;
  let name = String(chain.name ?? "").trim();
  const fb = (options.nameFallback ?? "").trim();
  if (!name) {
    if (!fb) {
      throw new Error("JSON 中 ruleChain.name 为空时，请填写下方「规则名称」");
    }
    chain.name = fb;
    name = fb;
  }
  if (!root.metadata || typeof root.metadata !== "object" || Array.isArray(root.metadata)) {
    root.metadata = {
      firstNodeIndex: 0,
      nodes: [],
      connections: [],
      ruleChainConnections: [],
    };
  } else {
    const md = root.metadata as Record<string, unknown>;
    if (!Array.isArray(md.nodes)) md.nodes = [];
    if (!Array.isArray(md.connections)) md.connections = [];
    if (!Array.isArray(md.ruleChainConnections)) md.ruleChainConnections = [];
    if (typeof md.firstNodeIndex !== "number") md.firstNodeIndex = 0;
  }
  return JSON.stringify(parsed, null, 2);
}
