import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { LogTextPreview } from "./LogTextPreview";

export type CursorACPAfterRoundEvent = {
  request_id: string;
  rule_id?: string;
  rule_name?: string;
  execution_id?: string;
  round: number;
  max_rounds: number;
  session_id: string;
  cwd: string;
  last_stream_text: string;
};

export type CursorACPAskQuestionEvent = {
  request_id: string;
  rule_id?: string;
  rule_name?: string;
  execution_id?: string;
  title: string;
  options: Array<{ id: string; label: string }>;
};

type PendingAfterRound = {
  kind: "after-round";
  requestId: string;
  data: CursorACPAfterRoundEvent;
  draft: string;
};

type PendingAsk = {
  kind: "ask";
  requestId: string;
  data: CursorACPAskQuestionEvent;
  selectedOpt: string;
};

type PendingItem = PendingAfterRound | PendingAsk;

/** 与全局 .studio-pixel / :root 深色主题一致，避免白底 + 浅色字导致对比度崩溃 */
const acp = {
  cardBg: "var(--studio-panel-2, #222236)",
  cardBorder: "var(--studio-border, #4a4d6a)",
  text: "var(--studio-text, #e8e8f0)",
  muted: "var(--studio-muted, #a8a8c0)",
  codeBg: "var(--studio-code, #12121c)",
  bannerBg: "rgba(59, 130, 246, 0.14)",
  bannerBorder: "rgba(125, 180, 255, 0.4)",
} as const;

function TaskContextBanner(props: {
  ruleId?: string;
  ruleName?: string;
  executionId?: string;
}): ReactNode {
  const { ruleId, ruleName, executionId } = props;
  if (!ruleId?.trim() && !ruleName?.trim() && !executionId?.trim()) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: acp.muted }}>
        未携带规则上下文（非引擎执行或旧版消息）；若多链并发请依赖执行日志核对。
      </p>
    );
  }
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.55,
        padding: "10px 12px",
        borderRadius: 8,
        color: acp.text,
        background: acp.bannerBg,
        border: `1px solid ${acp.bannerBorder}`,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: acp.text }}>所属任务</div>
      {ruleName?.trim() ? (
        <div style={{ color: acp.text }}>
          规则名称：<span>{ruleName.trim()}</span>
        </div>
      ) : null}
      {ruleId?.trim() ? (
        <div style={{ color: acp.text }}>
          规则 ID：<code style={{ fontSize: 11, color: "#c4d4ff" }}>{ruleId.trim()}</code>
        </div>
      ) : null}
      {executionId?.trim() ? (
        <div style={{ color: acp.text }}>
          执行 ID：<code style={{ fontSize: 11, color: "#c4d4ff" }}>{executionId.trim()}</code>
          （可与「执行日志」页对照）
        </div>
      ) : null}
    </div>
  );
}

function wailsRuntime(): { EventsOn?: (name: string, cb: (data: unknown) => void) => () => void } | undefined {
  return (window as unknown as { runtime?: { EventsOn?: (n: string, cb: (d: unknown) => void) => () => void } })
    .runtime;
}

function resolveAfterRoundCall(requestId: string, nextPrompt: string, stop: boolean, endMarker: boolean): void {
  const fn = (window as unknown as {
    go?: { main?: { App?: { ResolveCursorACPAfterRound?: (a: string, b: string, c: boolean, d: boolean) => void } } };
  }).go?.main?.App?.ResolveCursorACPAfterRound;
  if (typeof fn === "function") {
    fn(requestId, nextPrompt, stop, endMarker);
  }
}

function resolveAskQuestionCall(requestId: string, optionId: string): void {
  const fn = (window as unknown as {
    go?: { main?: { App?: { ResolveCursorACPAskQuestion?: (a: string, b: string) => void } } };
  }).go?.main?.App?.ResolveCursorACPAskQuestion;
  if (typeof fn === "function") {
    fn(requestId, optionId);
  }
}

function normalizeAskPayload(d: CursorACPAskQuestionEvent): CursorACPAskQuestionEvent {
  const opts = Array.isArray(d.options) ? d.options : [];
  return {
    request_id: d.request_id,
    rule_id: typeof d.rule_id === "string" ? d.rule_id : undefined,
    rule_name: typeof d.rule_name === "string" ? d.rule_name : undefined,
    execution_id: typeof d.execution_id === "string" ? d.execution_id : undefined,
    title: typeof d.title === "string" ? d.title : "",
    options: opts
      .filter((o) => o && typeof o.id === "string")
      .map((o) => ({ id: o.id, label: typeof o.label === "string" ? o.label : o.id })),
  };
}

function AfterRoundCard(props: {
  item: PendingAfterRound;
  onRemove: (requestId: string) => void;
  onDraftChange: (requestId: string, draft: string) => void;
}): ReactNode {
  const { item, onRemove, onDraftChange } = props;
  const ev = item.data;
  const rid = item.requestId;
  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [ev.last_stream_text]);

  return (
    <section className="cursor-acp-card">
      <div className="cursor-acp-card-head">
        <span className="cursor-acp-card-title">续聊 · 第 {ev.round + 1}/{ev.max_rounds} 轮</span>
        <code className="cursor-acp-req-id">{rid}</code>
      </div>
      <TaskContextBanner ruleId={ev.rule_id} ruleName={ev.rule_name} executionId={ev.execution_id} />
      <p className="cursor-acp-meta-line">
        session <code className="cursor-acp-code">{ev.session_id}</code>
        {ev.cwd ? (
          <>
            <br />
            工作目录：<span style={{ color: acp.text }}>{ev.cwd}</span>
          </>
        ) : null}
      </p>
      <div className="cursor-acp-block">
        <span className="cursor-acp-block-label">本轮输出预览</span>
        <p className="cursor-acp-block-hint">流式推送时会实时更新本区域（同一 request 多次事件合并）。</p>
        <div className="cursor-acp-stream-scroll">
          <LogTextPreview
            text={ev.last_stream_text || "（无文本）"}
            markdownClassName="rulego-log-markdown-body rulego-log-markdown-body--dark cursor-acp-md"
            markdownStyle={{ maxHeight: "none" }}
            preStyle={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              background: acp.codeBg,
              color: acp.text,
              border: `1px solid ${acp.cardBorder}`,
              fontSize: 13,
              lineHeight: 1.55,
              maxHeight: "none",
              overflow: "visible",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          />
          <div ref={streamEndRef} className="cursor-acp-stream-anchor" aria-hidden />
        </div>
      </div>
      <label className="form-field cursor-acp-field">
        <span className="cursor-acp-field-label">下一轮发给 Agent（空则用 continuationPrompt）</span>
        <textarea
          value={item.draft}
          onChange={(e) => onDraftChange(rid, e.target.value)}
          rows={3}
          className="cursor-acp-textarea"
          spellCheck={false}
        />
      </label>
      <p className="cursor-acp-footnote">
        下面两种都会<strong>停止多轮对话</strong>。未在规则里按「结束原因」分支时，选「主动结束」即可；若规则需区分「人为停」和「按约定算完成」，选「完成标记结束」（metadata{" "}
        <code className="cursor-acp-code-sm">cursor_acp_stop_reason</code> 分别为{" "}
        <code className="cursor-acp-code-sm">user_end</code> / <code className="cursor-acp-code-sm">end_marker</code>）。
      </p>
      <div className="modal-actions cursor-acp-actions">
        <button
          type="button"
          className="text-button"
          title="停止多轮；cursor_acp_stop_reason = user_end（用户主动结束）"
          onClick={() => {
            resolveAfterRoundCall(rid, "", true, false);
            onRemove(rid);
          }}
        >
          主动结束
        </button>
        <button
          type="button"
          className="text-button"
          title="停止多轮；cursor_acp_stop_reason = end_marker（供规则分支识别为约定完成）"
          onClick={() => {
            resolveAfterRoundCall(rid, "", true, true);
            onRemove(rid);
          }}
        >
          完成标记结束
        </button>
        <button type="button" className="primary-button" onClick={() => { resolveAfterRoundCall(rid, item.draft, false, false); onRemove(rid); }}>
          发送并继续下一轮
        </button>
      </div>
    </section>
  );
}

function AskCard(props: {
  item: PendingAsk;
  onRemove: (requestId: string) => void;
  onSelectChange: (requestId: string, opt: string) => void;
}): ReactNode {
  const { item, onRemove, onSelectChange } = props;
  const ask = item.data;
  const rid = item.requestId;
  const radioName = `cursor-acp-ask-${rid}`;

  return (
    <section className="cursor-acp-card">
      <div className="cursor-acp-card-head">
        <span className="cursor-acp-card-title">Agent 提问</span>
        <code className="cursor-acp-req-id">{rid}</code>
      </div>
      <TaskContextBanner ruleId={ask.rule_id} ruleName={ask.rule_name} executionId={ask.execution_id} />
      <div className="cursor-acp-ask-title-wrap">
        {ask.title?.trim() ? (
          <LogTextPreview
            text={ask.title}
            markdownClassName="rulego-log-markdown-body rulego-log-markdown-body--dark cursor-acp-md cursor-acp-ask-md"
            markdownStyle={{ maxHeight: 200 }}
            preStyle={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              background: acp.codeBg,
              color: acp.text,
              border: `1px solid ${acp.cardBorder}`,
              fontSize: 14,
              lineHeight: 1.55,
              maxHeight: 200,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          />
        ) : (
          <p className="cursor-acp-muted-only">（无题目文案）</p>
        )}
      </div>
      {ask.options.length > 0 ? (
        <div className="cursor-acp-options">
          {ask.options.map((o) => (
            <label key={o.id} className="cursor-acp-option">
              <input
                type="radio"
                name={radioName}
                checked={item.selectedOpt === o.id}
                onChange={() => onSelectChange(rid, o.id)}
                className="cursor-acp-radio"
              />
              <span className="cursor-acp-option-text">
                <code className="cursor-acp-code">{o.id}</code>
                {o.label !== o.id ? <> — {o.label}</> : null}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="cursor-acp-muted-only">未解析到选项，请用自动下标。</p>
      )}
      <div className="modal-actions cursor-acp-actions">
        <button type="button" className="text-button" onClick={() => { resolveAskQuestionCall(rid, ""); onRemove(rid); }}>
          使用节点自动下标
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={ask.options.length > 0 && !item.selectedOpt}
          onClick={() => {
            resolveAskQuestionCall(rid, item.selectedOpt);
            onRemove(rid);
          }}
        >
          确认所选选项
        </button>
      </div>
    </section>
  );
}

/**
 * 全局挂载：cursor-acp:after-round、cursor-acp:ask-question。
 * 多条并发时在单窗内堆叠卡片，按条提交后从列表移除。
 */
export default function CursorACPAfterRoundHost() {
  const [pending, setPending] = useState<PendingItem[]>([]);

  const removeByRequestId = useCallback((requestId: string) => {
    setPending((prev) => prev.filter((p) => p.requestId !== requestId));
  }, []);

  const setDraft = useCallback((requestId: string, draft: string) => {
    setPending((prev) =>
      prev.map((p) => (p.kind === "after-round" && p.requestId === requestId ? { ...p, draft } : p)),
    );
  }, []);

  const setSelectedOpt = useCallback((requestId: string, selectedOpt: string) => {
    setPending((prev) => prev.map((p) => (p.kind === "ask" && p.requestId === requestId ? { ...p, selectedOpt } : p)));
  }, []);

  useEffect(() => {
    const rt = wailsRuntime();
    const off1 = rt?.EventsOn?.("cursor-acp:after-round", (data: unknown) => {
      const d = data as CursorACPAfterRoundEvent;
      if (!d || typeof d.request_id !== "string") return;
      const requestId = d.request_id.trim();
      if (!requestId) return;
      setPending((prev) => {
        const ix = prev.findIndex((p) => p.kind === "after-round" && p.requestId === requestId);
        if (ix === -1) {
          return [...prev, { kind: "after-round", requestId, data: d, draft: "" }];
        }
        const next = [...prev];
        const cur = next[ix] as PendingAfterRound;
        next[ix] = { ...cur, data: { ...d, request_id: requestId } };
        return next;
      });
    });
    const off2 = rt?.EventsOn?.("cursor-acp:ask-question", (data: unknown) => {
      const d = data as CursorACPAskQuestionEvent;
      if (!d || typeof d.request_id !== "string") return;
      const requestId = d.request_id.trim();
      if (!requestId) return;
      const payload = normalizeAskPayload(d);
      setPending((prev) => {
        const ix = prev.findIndex((p) => p.kind === "ask" && p.requestId === requestId);
        if (ix === -1) {
          const first = payload.options[0]?.id ?? "";
          return [...prev, { kind: "ask", requestId, data: payload, selectedOpt: first }];
        }
        const next = [...prev];
        const cur = next[ix] as PendingAsk;
        const sel = payload.options.some((o) => o.id === cur.selectedOpt)
          ? cur.selectedOpt
          : (payload.options[0]?.id ?? "");
        next[ix] = { ...cur, data: payload, selectedOpt: sel };
        return next;
      });
    });
    return () => {
      off1?.();
      off2?.();
    };
  }, []);

  if (pending.length === 0) return null;

  return (
    <div className="modal-overlay cursor-acp-overlay" role="presentation" aria-modal="true">
      <div className="modal cursor-acp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header cursor-acp-modal-header">
          <h2 className="modal-title cursor-acp-modal-title">Cursor ACP 待处理 · {pending.length} 条</h2>
        </div>
        <p className="cursor-acp-lead">
          每条可单独操作；提交后该条会从列表消失，其它任务保留。请按执行 ID 区分并发规则链。
        </p>
        <div className="modal-body cursor-acp-modal-body">
          {pending.map((item) =>
            item.kind === "after-round" ? (
              <AfterRoundCard key={item.requestId} item={item} onRemove={removeByRequestId} onDraftChange={setDraft} />
            ) : (
              <AskCard key={item.requestId} item={item} onRemove={removeByRequestId} onSelectChange={setSelectedOpt} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
