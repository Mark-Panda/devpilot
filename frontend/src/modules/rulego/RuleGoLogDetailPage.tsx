import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getExecutionLog } from "./useRuleGoApi";
import type { RuleGoExecutionLog, RuleGoExecutionNodeLog } from "./useRuleGoApi";
import { formatRelationTypeForDisplay } from "./relationLabels";

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

function tryFormatJson(s: string): string {
  if (!s || !s.trim()) return "";
  try {
    const parsed = JSON.parse(s);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return s;
  }
}

function JsonBlock({ title, raw, emptyLabel = "无" }: { title: string; raw: string; emptyLabel?: string }) {
  const [open, setOpen] = useState(true);
  const text = raw?.trim() ? tryFormatJson(raw) : "";
  return (
    <div className="rulego-log-json-block">
      <button
        type="button"
        className="rulego-log-json-title"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="rulego-log-json-chevron">{open ? "▼" : "▶"}</span>
        {title}
      </button>
      {open && (
        <pre className="rulego-log-json-body">
          {text || emptyLabel}
        </pre>
      )}
    </div>
  );
}

function NodeStepCard({ node, index }: { node: RuleGoExecutionNodeLog; index: number }) {
  const [open, setOpen] = useState(true);
  const hasError = !!node.error_message;

  return (
    <div className={`rulego-log-node-card ${hasError ? "has-error" : ""}`}>
      <button
        type="button"
        className="rulego-log-node-header"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="rulego-log-node-chevron">{open ? "▼" : "▶"}</span>
        <span className="rulego-log-node-index">#{index + 1}</span>
        <span className="rulego-log-node-title">
          {node.node_name?.trim() || node.node_id}
        </span>
        {node.node_name?.trim() ? (
          <span className="rulego-log-node-id-secondary">{node.node_id}</span>
        ) : null}
        {node.relation_type ? (
          <span className="rulego-log-node-relation">{formatRelationTypeForDisplay(node.relation_type)}</span>
        ) : null}
        {hasError ? (
          <span className="rulego-log-node-error-badge">错误</span>
        ) : null}
      </button>
      {open && (
        <div className="rulego-log-node-body">
          <div className="rulego-log-node-section">
            <JsonBlock title="入参 Data" raw={node.input_data} />
            <JsonBlock title="入参 Metadata" raw={node.input_metadata} />
          </div>
          <div className="rulego-log-node-section">
            <JsonBlock title="出参 Data" raw={node.output_data} />
            <JsonBlock title="出参 Metadata" raw={node.output_metadata} />
          </div>
          {hasError ? (
            <div className="rulego-log-node-error">
              <strong>错误信息：</strong>
              <pre>{node.error_message}</pre>
            </div>
          ) : null}
          <div className="rulego-log-node-meta">
            开始: {formatTime(node.started_at)} · 结束: {formatTime(node.finished_at)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RuleGoLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [log, setLog] = useState<RuleGoExecutionLog | null>(null);
  const [nodes, setNodes] = useState<RuleGoExecutionNodeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getExecutionLog(id)
      .then((res) => {
        setLog(res.log);
        setNodes(res.nodes ?? []);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) {
    return (
      <div className="page animate-fade-in">
        <p className="table-error">缺少执行 ID</p>
        <button className="text-button" type="button" onClick={() => navigate("/rulego/logs")}>
          返回列表
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page animate-fade-in">
        <div className="table-empty table-empty-loading" role="status" aria-live="polite">
          <span className="table-inline-spinner" aria-hidden />
          <span>加载中…</span>
        </div>
      </div>
    );
  }

  if (error || !log) {
    return (
      <div className="page animate-fade-in">
        <p className="table-error">{error || "未找到该执行记录"}</p>
        <button className="text-button" type="button" onClick={() => navigate("/rulego/logs")}>
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="page rulego-log-detail-page animate-fade-in">
      <div className="page-header">
        <div>
          <h2>执行明细</h2>
          <p className="page-subtitle">
            {log.rule_name || log.rule_id} · {log.success ? "成功" : "失败"} · {formatTime(log.started_at)}
          </p>
        </div>
        <div className="page-actions">
          <button className="text-button" type="button" onClick={() => navigate("/rulego/logs")}>
            返回列表
          </button>
        </div>
      </div>

      <div className="rulego-log-detail-summary">
        <div className="rulego-log-detail-grid">
          <div className="rulego-log-detail-item">
            <span className="rulego-log-detail-label">规则</span>
            <span className="rulego-log-detail-value">{log.rule_name || log.rule_id}</span>
          </div>
          <div className="rulego-log-detail-item">
            <span className="rulego-log-detail-label">触发方式</span>
            <span className="rulego-log-detail-value">
              {log.trigger_type === "manual" ? "手动" : log.trigger_type === "test" ? "测试" : log.trigger_type}
            </span>
          </div>
          <div className="rulego-log-detail-item">
            <span className="rulego-log-detail-label">结果</span>
            <span className={`rulego-log-status ${log.success ? "success" : "failure"}`}>
              {log.success ? "成功" : "失败"}
            </span>
          </div>
          <div className="rulego-log-detail-item">
            <span className="rulego-log-detail-label">开始 / 结束</span>
            <span className="rulego-log-detail-value">
              {formatTime(log.started_at)} → {formatTime(log.finished_at)}
            </span>
          </div>
        </div>
        {log.error_message ? (
          <div className="rulego-log-detail-error">
            <strong>执行错误：</strong>
            <pre>{log.error_message}</pre>
          </div>
        ) : null}
        <div className="rulego-log-detail-io">
          <JsonBlock title="整体入参 Data" raw={log.input_data} />
          <JsonBlock title="整体入参 Metadata" raw={log.input_metadata} />
          <JsonBlock title="整体出参 Data" raw={log.output_data} />
          <JsonBlock title="整体出参 Metadata" raw={log.output_metadata} />
        </div>
      </div>

      <div className="rulego-log-detail-nodes">
        <h3 className="rulego-log-nodes-title">节点执行顺序（{nodes.length} 个）</h3>
        {nodes.length === 0 ? (
          <p className="rulego-log-nodes-empty">无节点步骤记录</p>
        ) : (
          <div className="rulego-log-nodes-list">
            {nodes.map((node, i) => (
              <NodeStepCard key={node.id} node={node} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
