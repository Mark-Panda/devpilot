/** 节点/日志 payload 展示用格式化 */
export function prettyJsonForDisplay(raw: string, emptyPlaceholder: string): string {
  const t = raw?.trim() ?? "";
  if (!t) return emptyPlaceholder;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return t;
  }
}
