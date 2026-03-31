import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

function copyText(text: string): Promise<void> {
  const t = text ?? "";
  if (!t.trim()) return Promise.resolve();
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(t);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (!ok) reject(new Error("copy failed"));
      else resolve();
    } catch (e) {
      reject(e);
    }
  });
}

const preStyle: CSSProperties = {
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

  const [copiedHint, setCopiedHint] = useState("");
  const [stderrOpen, setStderrOpen] = useState(false);

  const tailAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stderr) {
      setStderrOpen(false);
      return;
    }
    const r = reason.trim();
    const suspicious = /error|panic|fatal|exception/i.test(stderr) || r === "refusal" || r === "cancelled";
    if (suspicious) setStderrOpen(true);
  }, [stderr, reason]);

  useEffect(() => {
    tailAnchorRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [bodyText]);

  useEffect(() => {
    if (!copiedHint) return;
    const t = window.setTimeout(() => setCopiedHint(""), 1400);
    return () => window.clearTimeout(t);
  }, [copiedHint]);

  return (
    <div className="cursor-acp-exec" style={{ marginBottom: 16 }}>
      <div className="rulego-exec-section-title" style={{ marginBottom: 8 }}>
        Cursor / ACP 输出
      </div>
      <p className="form-hint" style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.5 }}>
        Agent 流式正文来自 ACP <code>agent_message_chunk</code>；长任务执行中会约每 0.5s 把当前预览写入执行日志，请保持本页轮询或重新选中节点。完成后出参 metadata 会含完整字段；CLI 进度与报错见下方「标准错误」。
      </p>

      <div className="cursor-acp-toolbar" style={{ marginBottom: 10 }}>
        <div className="cursor-acp-toolbar-group">
          <div className="cursor-acp-toolbar-label">导出</div>
          <button
            type="button"
            className="text-button cursor-acp-toolbar-btn"
            onClick={async () => {
              const t = lastRound || bodyText;
              try {
                await copyText(t);
                setCopiedHint("已复制本轮");
              } catch {
                setCopiedHint("复制失败");
              }
            }}
            disabled={!bodyText}
          >
            复制：本轮
          </button>
          <button
            type="button"
            className="text-button cursor-acp-toolbar-btn"
            onClick={async () => {
              try {
                await copyText(bodyText);
                setCopiedHint("已复制全部");
              } catch {
                setCopiedHint("复制失败");
              }
            }}
            disabled={!bodyText}
          >
            复制：全部
          </button>
          <button
            type="button"
            className="text-button cursor-acp-toolbar-btn"
            onClick={() => tailAnchorRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })}
            disabled={!bodyText}
            title="滚动到尾部"
          >
            只看尾部
          </button>
          <div className="cursor-acp-copy-hint">{copiedHint}</div>
        </div>
      </div>

      {bodyText ? (
        <label className="form-field" style={{ marginBottom: 0 }}>
          <span>Agent 文本（出参 data 与流式汇总）</span>
          <div>
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
            <div ref={tailAnchorRef} style={{ height: 1 }} />
          </div>
        </label>
      ) : (
        <p className="form-hint" style={{ margin: "0 0 10px", fontSize: 12 }}>
          当前无流式文本（部分 CLI 版本可能仅在 session/prompt 的 result 中返回结构化字段，请仍查看下方「出参 data」JSON）。
        </p>
      )}

      {stderr ? (
        <details className="cursor-acp-stderr-details" open={stderrOpen} onToggle={(e) => setStderrOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-acp-stderr-summary">标准错误（stderr tail）</summary>
          <pre className="cursor-acp-stderr-pre">{stderr}</pre>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="text-button cursor-acp-toolbar-btn"
              onClick={async () => {
                try {
                  await copyText(stderr);
                  setCopiedHint("已复制 stderr");
                } catch {
                  setCopiedHint("复制失败");
                }
              }}
            >
              复制 stderr
            </button>
            {(rounds || reason) ? (
              <span style={{ marginLeft: 10, fontSize: 12, color: "var(--studio-muted, #a8a8c0)" }}>
                {rounds ? `轮次：${rounds}` : ""}
                {rounds && reason ? " · " : ""}
                {reason ? `结束原因：${reason}` : ""}
              </span>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
