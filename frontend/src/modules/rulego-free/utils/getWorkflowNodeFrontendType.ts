/**
 * Flowgram 画布上的 node 实体在运行时 `node.type` 常为构造函数名（如 FlowNodeEntity），
 * 与 document JSON 中的业务类型（如 llm、rest-api-call）不一致。
 * 优先使用 toJSON().type，与 buildRuleGoDsl / DSL 约定一致。
 */
export function getWorkflowNodeFrontendType(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  try {
    if (typeof n.toJSON === 'function') {
      const j = n.toJSON() as { type?: string };
      if (typeof j?.type === 'string' && j.type.trim()) {
        return j.type.trim();
      }
    }
  } catch {
    /* ignore */
  }
  const flowType = n.flowNodeType;
  if (typeof flowType === 'string' && flowType.trim()) return flowType.trim();
  const raw = n.type;
  if (typeof raw === 'string' && raw && raw !== 'FlowNodeEntity' && !raw.endsWith('Entity')) {
    return raw;
  }
  return '';
}
