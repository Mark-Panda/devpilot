import { SaveExecutionLogExportDialog, SaveExportedTextFileDialog } from "../../../wailsjs/go/main/App";
import { downloadTextAsFile } from "./rulegoExportDsl";
import type { RuleGoExecutionLog, RuleGoExecutionNodeLog } from "./useRuleGoApi";

export type RuleGoExecutionLogExport = {
  exported_at: string;
  execution_id: string;
  execution: RuleGoExecutionLog | null;
  nodes: RuleGoExecutionNodeLog[];
};

/** 将当前执行摘要与节点步骤序列化为可下载的 JSON 结构（深拷贝，避免引用泄漏）。 */
export function buildExecutionLogExport(
  executionId: string,
  log: RuleGoExecutionLog | null,
  nodes: RuleGoExecutionNodeLog[],
): RuleGoExecutionLogExport {
  return {
    exported_at: new Date().toISOString(),
    execution_id: executionId,
    execution: log ? (JSON.parse(JSON.stringify(log)) as RuleGoExecutionLog) : null,
    nodes: JSON.parse(JSON.stringify(nodes)) as RuleGoExecutionNodeLog[],
  };
}

function safeFilenameSegment(id: string): string {
  const t = id.trim() || "unknown";
  return t.replace(/[^\w.-]+/g, "_").slice(0, 80);
}

export function executionLogExportFilename(executionId: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  return `rulego-execution-${safeFilenameSegment(executionId)}-${stamp}.json`;
}

export type ExportExecutionLogResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" }
  | { status: "browser_download" }
  | { status: "error"; message: string };

/**
 * 导出执行日志 JSON。桌面端（Wails）走系统「另存为」；纯浏览器 / Vite 开发环境回退为 Blob 下载。
 * 说明：Wails WebView 内 `<a download>` + Blob 往往无效，必须与 DSL 导出一致走 Go 侧 SaveFileDialog。
 */
export async function exportExecutionLogToFile(
  executionId: string,
  log: RuleGoExecutionLog | null,
  nodes: RuleGoExecutionNodeLog[],
): Promise<ExportExecutionLogResult> {
  const json = JSON.stringify(buildExecutionLogExport(executionId, log, nodes), null, 2);
  const filename = executionLogExportFilename(executionId);
  const App = (window as unknown as { go?: { main?: { App?: Record<string, unknown> } } }).go?.main?.App;
  const useLogDialog = typeof App?.SaveExecutionLogExportDialog === "function";
  const useDslDialog = typeof App?.SaveExportedTextFileDialog === "function";
  if (useLogDialog || useDslDialog) {
    try {
      const path = (
        useLogDialog
          ? await SaveExecutionLogExportDialog(filename, json)
          : await SaveExportedTextFileDialog(filename, json)
      ).trim();
      if (!path) return { status: "cancelled" };
      return { status: "saved", path };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { status: "error", message: message || "导出失败" };
    }
  }
  downloadTextAsFile(filename, json);
  return { status: "browser_download" };
}
