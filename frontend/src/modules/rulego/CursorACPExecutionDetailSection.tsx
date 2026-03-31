import type { ReactNode } from "react";
import { LogTextPreview } from "./LogTextPreview";

/** 解析执行日志中的 metadata JSON（值为 string 的扁平 map）。 */
export function parseRuleGoMetadataStringMap(raw: string | undefined): Record<string, string> | null {
  const t = raw?.trim() ?? "";
  if (!t) return null;
  try {
    const o = JSON.parse(t) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export function hasCursorACPMetadata(meta: Record<string, string> | null): boolean {
  if (!meta) return false;
  return Object.keys(meta).some((k) => k.startsWith("cursor_acp_"));
}

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 10,
  borderRadius: 8,
  background: "var(--studio-panel-2, rgba(0,0,0,0.45))",
  border: "1px solid var(--studio-border, rgba(255,255,255,0.12))",
  color: "var(--studio-text, #e8e8f0)",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 320,
  overflow: "auto",
};

/**
 * 执行日志 / 执行页：突出展示 Cursor ACP 节点写入 metadata 的字段与 Agent 文本。
 */
export function CursorACPExecutionDetailSection(props: {
  outputData: string | undefined;
  outputMetadataRaw: string | undefined;
}): ReactNode {
  const meta = parseRuleGoMetadataStringMap(props.outputMetadataRaw);
  if (!hasCursorACPMetadata(meta)) return null;

  const dataText = (props.outputData ?? "").trim();
  const streamFromMeta = (meta?.cursor_acp_stream_text ?? "").trim();
  const lastRound = (meta?.cursor_acp_last_stream_text ?? "").trim();
  const bodyText = dataText || streamFromMeta || lastRound;

  const rounds = meta?.cursor_acp_agent_rounds ?? "";
  const reason = meta?.cursor_acp_stop_reason ?? "";
  const stderr = (meta?.cursor_acp_stderr_tail ?? "").trim();

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="rulego-exec-section-title" style={{ marginBottom: 8 }}>
        Cursor / ACP 输出
      </div>
      <p className="form-hint" style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.5 }}>
        Agent 流式正文来自 ACP <code>agent_message_chunk</code>；长任务执行中会约每 0.5s 把当前预览写入执行日志，请保持本页轮询或重新选中节点。完成后出参 metadata 会含完整字段；CLI 进度与报错见下方「标准错误」。
      </p>
      {meta?.cursor_acp_progress === "true" ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--studio-hot, #e94560)" }}>流式预览写入中…</p>
      ) : null}
      {(rounds || reason) && (
        <div style={{ fontSize: 12, marginBottom: 10, color: "var(--color-muted, #94a3b8)" }}>
          {rounds ? (
            <span>
              轮次：<strong>{rounds}</strong>
            </span>
          ) : null}
          {rounds && reason ? <span> · </span> : null}
          {reason ? (
            <span>
              结束原因：<code>{reason}</code>
            </span>
          ) : null}
        </div>
      )}
      {bodyText ? (
        <label className="form-field" style={{ marginBottom: 12 }}>
          <span>Agent 文本（出参 data 与流式汇总）</span>
          <LogTextPreview
            text={bodyText}
            preStyle={preStyle}
            markdownClassName="rulego-log-markdown-body rulego-log-markdown-body--dark rulego-log-markdown-body--acp-embed"
            markdownStyle={{
              margin: preStyle.margin ?? 0,
              padding: preStyle.padding,
              borderRadius: preStyle.borderRadius,
              background: preStyle.background,
              border: preStyle.border,
              fontSize: preStyle.fontSize,
              lineHeight: preStyle.lineHeight,
              maxHeight: preStyle.maxHeight,
              overflow: preStyle.overflow,
              wordBreak: preStyle.wordBreak,
              color: "var(--studio-text, #e8e8f0)",
            }}
          />
        </label>
      ) : (
        <p className="form-hint" style={{ margin: "0 0 10px", fontSize: 12 }}>
          当前无流式文本（部分 CLI 版本可能仅在 session/prompt 的 result 中返回结构化字段，请仍查看下方「出参 data」JSON）。
        </p>
      )}
      {stderr ? (
        <label className="form-field" style={{ marginBottom: 0 }}>
          <span>Cursor CLI 标准错误（尾部，最多约 64KB）</span>
          <pre style={{ ...preStyle, maxHeight: 200 }}>{stderr}</pre>
        </label>
      ) : null}
    </div>
  );
}
