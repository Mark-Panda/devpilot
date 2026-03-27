import { emptyRuleChainParamsJson, paramNodeToSampleJsonValue, parseRuleChainParamsJson, type RuleChainParamNode } from "./ruleChainRequestParams";

function parseLeafValue(node: RuleChainParamNode, raw: string): unknown {
  const t = raw.trim();
  if (node.type === "number") {
    const x = Number(t);
    return Number.isFinite(x) ? x : 0;
  }
  if (node.type === "boolean") {
    return t === "true" || t === "1" || t === "yes";
  }
  if (node.type === "string") {
    return raw;
  }
  try {
    return JSON.parse(t || "null");
  } catch {
    return raw;
  }
}

/** 将参数树中叶子节点的默认值写入以节点 id 为键的字符串映射（供表单受控） */
export function initLeafStringValuesFromParamTree(nodes: RuleChainParamNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (ns: RuleChainParamNode[]) => {
    for (const n of ns) {
      if (!n.key.trim()) continue;
      if (n.type === "object") {
        walk(n.children);
      } else if (n.type === "array") {
        if (n.children.length > 0) walk(n.children);
      } else {
        const v = paramNodeToSampleJsonValue(n);
        out[n.id] = typeof v === "string" ? v : JSON.stringify(v);
      }
    }
  };
  walk(nodes);
  return out;
}

/** 元数据：嵌套 object 用点号拼接 key；值均为字符串 */
export function buildMetadataStringMap(
  nodes: RuleChainParamNode[],
  leafValues: Record<string, string>,
  keyPrefix: string[] = []
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of nodes) {
    const k = n.key.trim();
    if (!k) continue;
    const parts = [...keyPrefix, k];
    const metaKey = parts.join(".");
    if (n.type === "object") {
      Object.assign(out, buildMetadataStringMap(n.children, leafValues, parts));
    } else if (n.type === "array" && n.children.length > 0) {
      Object.assign(out, buildMetadataStringMap(n.children, leafValues, parts));
    } else {
      out[metaKey] = leafValues[n.id] ?? "";
    }
  }
  return out;
}

/** 消息体 JSON 对象 */
export function buildDataObjectFromParamTree(
  nodes: RuleChainParamNode[],
  leafValues: Record<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const n of nodes) {
    const k = n.key.trim();
    if (!k) continue;
    if (n.type === "object") {
      out[k] = buildDataObjectFromParamTree(n.children, leafValues);
    } else if (n.type === "array") {
      if (n.children.length === 0) {
        out[k] = [];
      } else {
        const first = n.children[0];
        if (first.type === "object") {
          out[k] = [buildDataObjectFromParamTree(first.children, leafValues)];
        } else {
          const raw = leafValues[first.id] ?? "";
          out[k] = [parseLeafValue(first, raw)];
        }
      }
    } else {
      out[k] = parseLeafValue(n, leafValues[n.id] ?? "");
    }
  }
  return out;
}

export function parseMetadataAndBodyParamTrees(metaJson: string | undefined, bodyJson: string | undefined) {
  const metaNodes = parseRuleChainParamsJson((metaJson ?? "").trim() || emptyRuleChainParamsJson());
  const bodyNodes = parseRuleChainParamsJson((bodyJson ?? "").trim() || emptyRuleChainParamsJson());
  return { metaNodes, bodyNodes };
}
