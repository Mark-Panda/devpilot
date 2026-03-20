/** Wails / 部分运行时下抛出的不是标准 Error，统一抽出可读文案 */
export function errorMessageFromUnknown(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message
  }
  if (typeof err === 'string' && err.trim()) {
    return err
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === 'string' && m.trim()) {
      return m
    }
  }
  return fallback
}
