/** 将 Unix 毫秒转为 datetime-local 用的字符串（本地时区，精度到分钟） */
export function msToDatetimeLocal(ms: number): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 字符串转 Unix 毫秒；无效返回 0 */
export function datetimeLocalToMs(s: string): number {
  const t = s?.trim();
  if (!t) return 0;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
