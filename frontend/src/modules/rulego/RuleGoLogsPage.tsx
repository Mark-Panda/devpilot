import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listExecutionLogs, deleteExecutionLog } from "./useRuleGoApi";
import type { RuleGoExecutionLog } from "./useRuleGoApi";

const PAGE_SIZE = 20;
const LIST_REFRESH_MS = 5000;

function formatTime(iso: string) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortExecutionId(id: string) {
  const t = id?.trim() ?? "";
  if (t.length <= 14) return t;
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

function formatDuration(startedAt: string, finishedAt: string): { label: string; live?: boolean } {
  const s = startedAt?.trim();
  const f = finishedAt?.trim();
  if (!s) return { label: "—" };
  if (!f) return { label: "进行中", live: true };
  try {
    const a = new Date(s).getTime();
    const b = new Date(f).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return { label: "—" };
    const sec = Math.round((b - a) / 1000);
    if (sec < 60) return { label: `${sec}s` };
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return { label: r ? `${m}m ${r}s` : `${m}m` };
  } catch {
    return { label: "—" };
  }
}

function triggerLabel(t: string) {
  const map: Record<string, string> = {
    manual: "手动执行",
    test: "测试运行",
    api: "API",
    endpoint: "端点触发",
  };
  return map[t] ?? t;
}

export default function RuleGoLogsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RuleGoExecutionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLog, setConfirmingLog] = useState<RuleGoExecutionLog | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await listExecutionLogs(PAGE_SIZE, page * PAGE_SIZE);
      if (seq !== loadSeq.current) return;
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError((e as Error).message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void load(), LIST_REFRESH_MS);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleDelete = async () => {
    if (!confirmingLog) return;
    try {
      await deleteExecutionLog(confirmingLog.id);
      setConfirmingLog(null);
      setActionFeedback({ msg: "已删除" });
      setTimeout(() => setActionFeedback(null), 2500);
      await load();
    } catch (e) {
      setActionFeedback({ msg: (e as Error).message, isError: true });
      setTimeout(() => setActionFeedback(null), 3500);
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <h2>执行日志</h2>
          <p className="page-subtitle">查看规则链执行记录与各节点入参/出参</p>
        </div>
        <div className="page-actions rulego-logs-header-actions">
          <label className="rulego-logs-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>每 {LIST_REFRESH_MS / 1000}s 自动刷新</span>
          </label>
          <button className="text-button" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>

      <div className="table-card rulego-logs-table">
        <div className="table-head rulego-logs-head">
          <div className="table-cell">规则 / 执行 ID</div>
          <div className="table-cell">触发</div>
          <div className="table-cell">结果</div>
          <div className="table-cell">耗时</div>
          <div className="table-cell">开始时间</div>
          <div className="table-cell table-actions">操作</div>
        </div>
        {loading ? (
          <div className="table-empty table-empty-loading" role="status" aria-live="polite">
            <span className="table-inline-spinner" aria-hidden />
            <span>加载中…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="table-empty rulego-logs-empty">
            <span className="rulego-logs-empty-title">暂无执行记录</span>
            <span className="rulego-logs-empty-hint">在「执行规则」中运行主规则链后，将在此出现可追踪的日志条目。</span>
          </div>
        ) : (
          <div className="table-body">
            {items.map((row) => {
              const dur = formatDuration(row.started_at, row.finished_at);
              return (
                <div className="table-row rulego-logs-row" key={row.id}>
                  <div className="table-cell rulego-logs-cell-rule" data-label="规则">
                    <span className="rulego-logs-rule-name" title={row.rule_name || row.rule_id}>
                      {row.rule_name || row.rule_id || "—"}
                    </span>
                    <code className="rulego-logs-rule-id" title={row.id}>
                      {shortExecutionId(row.id)}
                    </code>
                  </div>
                  <div className="table-cell" data-label="触发">
                    <span className="rulego-log-trigger">{triggerLabel(row.trigger_type)}</span>
                  </div>
                  <div className="table-cell" data-label="结果">
                    <span
                      className={`rulego-log-status ${row.success ? "success" : "failure"}${dur.live ? " pending" : ""}`}
                    >
                      {dur.live ? "进行中" : row.success ? "成功" : "失败"}
                    </span>
                  </div>
                  <div className="table-cell rulego-logs-duration" data-label="耗时">
                    {dur.live ? (
                      <span className="rulego-logs-duration-live">
                        <span className="rulego-exec-live-dot" aria-hidden />
                        {dur.label}
                      </span>
                    ) : (
                      dur.label
                    )}
                  </div>
                  <div className="table-cell rulego-log-time" data-label="开始时间">
                    {formatTime(row.started_at)}
                  </div>
                  <div className="table-cell table-actions" data-label="操作">
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => navigate(`/rulego/logs/${row.id}`)}
                    >
                      明细
                    </button>
                    <button
                      className="text-button danger"
                      type="button"
                      onClick={() => setConfirmingLog(row)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error ? <div className="table-error">{error}</div> : null}
        {actionFeedback ? (
          <div
            className={actionFeedback.isError ? "table-error" : "form-hint"}
            style={{ marginTop: 8 }}
          >
            {actionFeedback.msg}
          </div>
        ) : null}
        {totalPages > 1 ? (
          <div className="rulego-logs-pagination">
            <button
              className="text-button"
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              上一页
            </button>
            <span className="rulego-logs-page-info">
              {page + 1} / {totalPages}（共 {total} 条）
            </span>
            <button
              className="text-button"
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              下一页
            </button>
          </div>
        ) : null}
      </div>

      {confirmingLog ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmingLog(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认删除</h3>
              <button
                className="text-button"
                type="button"
                onClick={() => setConfirmingLog(null)}
              >
                关闭
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                确定要删除该条执行日志吗？规则「
                <strong>{confirmingLog.rule_name || confirmingLog.rule_id}</strong>」、
                开始时间 {formatTime(confirmingLog.started_at)}，删除后不可恢复。
              </p>
            </div>
            <div className="modal-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setConfirmingLog(null)}
              >
                取消
              </button>
              <button
                className="primary-button danger"
                type="button"
                onClick={handleDelete}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
