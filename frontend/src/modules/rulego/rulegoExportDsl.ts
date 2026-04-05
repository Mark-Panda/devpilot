import { SaveExportedTextFileDialog } from "../../../wailsjs/go/main/App";

/** Windows / 通用文件名非法字符 */
const INVALID_FILE_CHARS = /[/\\?%*:|"<>]/g;

/**
 * 将规则链 definition 格式化为缩进 JSON；解析失败时返回原文。
 */
export function formatRuleDefinitionForExport(definition: string): string {
  const t = definition.trim();
  if (!t) return "";
  try {
    return `${JSON.stringify(JSON.parse(t), null, 2)}\n`;
  } catch {
    return t.endsWith("\n") ? t : `${t}\n`;
  }
}

/**
 * 生成下载用文件名：可读名称 + 规则 ID，避免重名与非法字符。
 */
export function ruleGoDslExportFilename(displayName: string, ruleId: string): string {
  const stem = String(displayName || "rulego")
    .trim()
    .replace(INVALID_FILE_CHARS, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const safeStem = stem || "rulego";
  return `${safeStem}-${ruleId}.json`;
}

export function downloadTextAsFile(filename: string, content: string, mimeType = "application/json"): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ExportRuleGoDslResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" }
  | { status: "browser_download" }
  | { status: "error"; message: string };

/**
 * 桌面端（Wails）使用系统「另存为」并写入磁盘；浏览器 / 纯前端回退为 Blob 下载。
 */
export async function exportRuleGoDslToFile(
  filename: string,
  content: string
): Promise<ExportRuleGoDslResult> {
  const wailsSave = (window as unknown as { go?: { main?: { App?: Record<string, unknown> } } }).go?.main
    ?.App?.SaveExportedTextFileDialog;
  if (typeof wailsSave === "function") {
    try {
      const path = (await SaveExportedTextFileDialog(filename, content)).trim();
      if (!path) return { status: "cancelled" };
      return { status: "saved", path };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { status: "error", message: message || "导出失败" };
    }
  }
  downloadTextAsFile(filename, content);
  return { status: "browser_download" };
}
