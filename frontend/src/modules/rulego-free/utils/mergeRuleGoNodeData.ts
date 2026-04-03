/**
 * 合并节点 data 补丁（供弹窗/侧栏写回），对常见嵌套对象做一层展开合并，避免 params 等被整对象覆盖。
 */
export function mergeRuleGoNodeData(
  cur: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...cur, ...patch };
  const nestedKeys = ['params', 'headers', 'query'] as const;
  for (const key of nestedKeys) {
    const p = patch[key];
    const c = cur[key];
    if (p && typeof p === 'object' && !Array.isArray(p) && c && typeof c === 'object' && !Array.isArray(c)) {
      next[key] = { ...(c as Record<string, unknown>), ...(p as Record<string, unknown>) };
    }
  }
  return next;
}
