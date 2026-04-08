import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { extractNodesFromRuleDefinition } from "./dslUtils";
import { getExecutionLog, getRuleGoRule } from "./useRuleGoApi";
import type { RuleGoExecutionLog, RuleGoExecutionNodeLog } from "./useRuleGoApi";
import { formatRelationTypeForDisplay } from "./relationLabels";
import { CursorACPExecutionDetailSection } from "./CursorACPExecutionDetailSection";
import { LogTextPreview, isStrictJson } from "./LogTextPreview";
import { NodePayloadPreview } from "./NodePayloadPreview";
import { exportExecutionLogToFile } from "./rulegoExecutionLogExport";

type ChainVisual = "idle" | "waiting" | "running" | "done" | "error";

function dslNodeVisual(
  executionId: string | null,
  runningExec: boolean,
  finishedExec: boolean,
  log: RuleGoExecutionNodeLog | undefined
): ChainVisual {
  if (!executionId) return "idle";
  if (!log) return finishedExec ? "idle" : "waiting";
  const done = Boolean((log.finished_at ?? "").trim());
  if (!done) return "running";
  if ((log.error_message ?? "").trim()) return "error";
  return "done";
}

function pathStepVisual(n: RuleGoExecutionNodeLog): ChainVisual {
  const done = Boolean((n.finished_at ?? "").trim());
  if (!done) return "running";
  if ((n.error_message ?? "").trim()) return "error";
  return "done";
}

function chainVisualLabel(v: ChainVisual): string {
  const map: Record<ChainVisual, string> = {
    idle: "未执行",
    waiting: "待执行",
    running: "执行中",
    done: "完成",
    error: "失败",
  };
  return map[v];
}

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
  const [copyTip, setCopyTip] = useState<string | null>(null);
  const rawTrim = raw?.trim() ?? "";
  const text = rawTrim ? tryFormatJson(raw) : "";
  const bodyText = text || emptyLabel;
  const isJson = !!rawTrim && isStrictJson(rawTrim);

  const handleCopy = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(bodyText);
      setCopyTip("已复制");
    } catch {
      setCopyTip("复制失败");
    }
    window.setTimeout(() => setCopyTip(null), 2000);
  };

  return (
    <div className="rulego-log-json-block">
      <div className="rulego-log-json-header">
        <button
          type="button"
          className="rulego-log-json-title"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <span className="rulego-log-json-chevron">{open ? "▼" : "▶"}</span>
          {title}
        </button>
        <div className="rulego-log-json-header-actions">
          <button type="button" className="text-button rulego-log-json-copy" onClick={(ev) => void handleCopy(ev)}>
            复制
          </button>
          {copyTip ? (
            <span className="form-hint rulego-log-json-copy-tip" role="status">
              {copyTip}
            </span>
          ) : null}
        </div>
      </div>
      {open &&
        (isJson ? (
          <pre className="rulego-log-json-body">{bodyText}</pre>
        ) : (
          <LogTextPreview text={bodyText} preClassName="rulego-log-json-body" markdownClassName="rulego-log-markdown-body" />
        ))}
    </div>
  );
}

function ExecutionNodeLogDetail({ node }: { node: RuleGoExecutionNodeLog }) {
  const hasError = !!(node.error_message ?? "").trim();

  return (
    <div className="rulego-exec-detail-card rulego-log-detail-node-panel">
      <div className="rulego-exec-detail-title">
        节点日志 · {node.node_name?.trim() || node.node_id}
        {node.relation_type ? (
          <span className="rulego-log-detail-node-panel-relation">
            {" "}
            · {formatRelationTypeForDisplay(node.relation_type)}
          </span>
        ) : null}
      </div>
      <p className="rulego-log-detail-node-panel-meta">
        顺序 #{node.order_index} · 开始 {formatTime(node.started_at)} · 结束 {formatTime(node.finished_at)}
      </p>
      <CursorACPExecutionDetailSection outputData={node.output_data} outputMetadataRaw={node.output_metadata} />
      <label className="form-field">
        <span>入参 data</span>
        <NodePayloadPreview
          raw={node.input_data}
          emptyPlaceholder="(空)"
          height={140}
          minHeight={80}
          expandTitle="节点入参 data"
        />
      </label>
      <label className="form-field">
        <span>入参 metadata</span>
        <NodePayloadPreview
          raw={node.input_metadata}
          emptyPlaceholder="(空)"
          height={120}
          minHeight={72}
          expandTitle="节点入参 metadata"
        />
      </label>
      <label className="form-field">
        <span>出参 data</span>
        <NodePayloadPreview
          raw={node.output_data}
          emptyPlaceholder="(空)"
          height={160}
          minHeight={88}
          expandTitle="节点出参 data"
        />
      </label>
      <label className="form-field">
        <span>出参 metadata</span>
        <NodePayloadPreview
          raw={node.output_metadata}
          emptyPlaceholder="(空)"
          height={120}
          minHeight={72}
          expandTitle="节点出参 metadata"
        />
      </label>
      {hasError ? (
        <label className="form-field">
          <span>错误</span>
          <LogTextPreview
            text={(node.error_message ?? "").trim()}
            preClassName="form-error"
            preStyle={{ whiteSpace: "pre-wrap", fontSize: 12, padding: 8, margin: 0 }}
            markdownClassName="rulego-log-markdown-body rulego-log-markdown--danger"
          />
        </label>
      ) : null}
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
  const [ruleDefinition, setRuleDefinition] = useState<string | null>(null);
  const [ruleDefHint, setRuleDefHint] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<RuleGoExecutionNodeLog | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setLog(null);
    setNodes([]);
    setRuleDefinition(null);
    setRuleDefHint(null);
    setSelectedNode(null);
    getExecutionLog(id)
      .then((res) => {
        setLog(res.log);
        setNodes(res.nodes ?? []);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const isLive = Boolean(log && !(log.finished_at ?? "").trim());

  useEffect(() => {
    if (!id || !isLive) return;
    const tick = () => {
      void getExecutionLog(id)
        .then((res) => {
          setLog(res.log);
          setNodes(res.nodes ?? []);
        })
        .catch(() => {});
    };
    const t = setInterval(tick, 400);
    return () => clearInterval(t);
  }, [id, isLive]);

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [nodes],
  );

  useEffect(() => {
    if (!log?.rule_id?.trim()) {
      setRuleDefinition(null);
      setRuleDefHint(null);
      return;
    }
    let cancelled = false;
    void getRuleGoRule(log.rule_id)
      .then((r) => {
        if (cancelled) return;
        setRuleDefinition(r.definition?.trim() ? r.definition : "");
        setRuleDefHint(null);
      })
      .catch(() => {
        if (cancelled) return;
        setRuleDefinition(null);
        setRuleDefHint("无法加载当前规则定义（规则可能已删除或仅测试执行），下方仅展示实际执行路径。");
      });
    return () => {
      cancelled = true;
    };
  }, [log?.rule_id]);

  const dslNodes = useMemo(() => extractNodesFromRuleDefinition(ruleDefinition ?? ""), [ruleDefinition]);

  const latestLogByNodeId = useMemo(() => {
    const m = new Map<string, RuleGoExecutionNodeLog>();
    for (const n of sortedNodes) {
      const nid = (n.node_id ?? "").trim();
      if (!nid) continue;
      const prev = m.get(nid);
      if (!prev || (n.order_index ?? 0) >= (prev.order_index ?? 0)) {
        m.set(nid, n);
      }
    }
    return m;
  }, [sortedNodes]);

  useEffect(() => {
    setSelectedNode((prev) => {
      if (!prev?.id) return prev;
      const u = sortedNodes.find((n) => n.id === prev.id);
      return u ?? prev;
    });
  }, [sortedNodes]);

  const selectLogForDslNode = useCallback(
    (nodeId: string) => {
      const row = latestLogByNodeId.get(nodeId);
      if (row) setSelectedNode(row);
    },
    [latestLogByNodeId],
  );

  const runningExec = isLive;
  const finishedExec = !isLive;

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
          {isLive ? (
            <span className="rulego-log-detail-live-badge" title="执行未完成，本页自动轮询刷新">
              <span className="rulego-exec-live-dot" aria-hidden />
              实时更新
            </span>
          ) : null}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              void (async () => {
                const res = await exportExecutionLogToFile(id!, log, sortedNodes);
                if (res.status === "error") {
                  window.alert(res.message);
                }
              })();
            }}
          >
            导出日志
          </button>
          <button className="text-button" type="button" onClick={() => navigate("/rulego/logs")}>
            返回列表
          </button>
        </div>
      </div>

      {isLive ? (
        <p className="rulego-log-detail-live-hint">
          该次执行尚未结束，节点与出参会随引擎写入自动刷新；完成后停止轮询。
        </p>
      ) : null}

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
            <LogTextPreview text={log.error_message} markdownClassName="rulego-log-markdown-body" />
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
        <h3 className="rulego-log-nodes-title">节点链路</h3>
        {ruleDefHint ? <p className="form-hint rulego-log-detail-chain-hint">{ruleDefHint}</p> : null}

        {dslNodes.length > 0 ? (
          <div className="rulego-log-detail-chain-block">
            <div className="rulego-exec-section-title">规则链结构（DSL 顺序，与「执行规则」页一致）</div>
            <p className="form-hint rulego-log-detail-chain-subhint">
              横向为画布 metadata.nodes 顺序；颜色对应当次执行状态。点击已有日志的节点可查看下方详情。
            </p>
            <div className="rulego-log-chain-scroll--horizontal" aria-label="规则链 DSL 节点">
              {dslNodes.map((dn, idx) => {
                const row = latestLogByNodeId.get(dn.id);
                const vis = dslNodeVisual(id, runningExec, finishedExec, row);
                const cardClass = [
                  "rulego-exec-chain-card",
                  `rulego-exec-chain-card--${vis}`,
                  row ? "is-clickable" : "",
                  selectedNode?.node_id === dn.id ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const badgeClass = `rulego-exec-chain-badge rulego-exec-chain-badge--${vis === "done" ? "done" : vis === "error" ? "error" : vis === "running" ? "running" : vis === "waiting" ? "waiting" : "idle"}`;
                return (
                  <div key={dn.id} className="rulego-log-chain-node--horizontal">
                    <button
                      type="button"
                      className={cardClass}
                      disabled={!row}
                      onClick={() => selectLogForDslNode(dn.id)}
                      title={row ? "查看该节点日志" : "该节点在本次执行中尚未产生日志"}
                    >
                      <span className="rulego-exec-chain-index">DSL {idx + 1}</span>
                      <span className="rulego-exec-chain-name">{dn.name || dn.id}</span>
                      <span className="rulego-exec-chain-id" title={dn.id}>
                        {dn.id}
                      </span>
                      <span className={badgeClass}>{chainVisualLabel(vis)}</span>
                    </button>
                    {idx < dslNodes.length - 1 ? <span className="rulego-log-chain-connector-h" aria-hidden /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : log.rule_id?.trim() && !ruleDefHint ? (
          <p className="form-hint rulego-log-detail-chain-hint">当前规则 DSL 中无 metadata.nodes 列表，仅展示实际执行路径。</p>
        ) : null}

        <div className="rulego-log-detail-chain-block">
          <div className="rulego-exec-section-title">实际执行路径（按进入顺序 · 横向）</div>
          <p className="form-hint rulego-log-detail-chain-subhint">
            与引擎记录的消息流经顺序一致；点击某一节点在下方展开该步入参、出参与错误信息。
          </p>
          {sortedNodes.length === 0 ? (
            <p className="rulego-log-nodes-empty">无节点步骤记录</p>
          ) : (
            <div className="rulego-log-chain-scroll--horizontal" aria-label="实际执行路径">
              {sortedNodes.map((n, idx) => {
                const vis = pathStepVisual(n);
                const cardClass = [
                  "rulego-exec-chain-card",
                  `rulego-exec-chain-card--${vis}`,
                  "is-clickable",
                  selectedNode?.id === n.id ? "is-selected" : "",
                ].join(" ");
                const badgeClass = `rulego-exec-chain-badge rulego-exec-chain-badge--${vis === "done" ? "done" : vis === "error" ? "error" : "running"}`;
                const rel = formatRelationTypeForDisplay(n.relation_type);
                return (
                  <div key={n.id} className="rulego-log-chain-node--horizontal">
                    <button type="button" className={cardClass} onClick={() => setSelectedNode(n)} title="查看该节点日志">
                      <span className="rulego-exec-chain-index">#{n.order_index}</span>
                      <span className="rulego-exec-chain-name">{n.node_name?.trim() || n.node_id}</span>
                      <span className="rulego-exec-chain-id" title={n.node_id}>
                        {n.node_id}
                      </span>
                      {rel ? <span className="rulego-log-path-relation">{rel}</span> : null}
                      <span className={badgeClass}>{chainVisualLabel(vis)}</span>
                    </button>
                    {idx < sortedNodes.length - 1 ? <span className="rulego-log-chain-connector-h" aria-hidden /> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedNode ? (
          <ExecutionNodeLogDetail node={selectedNode} />
        ) : sortedNodes.length > 0 ? (
          <p className="form-hint rulego-log-detail-select-hint">点击上方「实际执行路径」中的节点，查看该步详细日志。</p>
        ) : null}
      </div>
    </div>
  );
}
