import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { JsonEditor } from "../../shared/components";
import { extractNodesFromRuleDefinition, getEnabledFromDefinition, getRuleChainRootKind } from "./dslUtils";
import type { RuleChainParamNode } from "./ruleChainRequestParams";
import {
  buildDataObjectFromParamTree,
  buildMetadataStringMap,
  initLeafStringValuesFromParamTree,
  parseMetadataAndBodyParamTrees,
} from "./ruleGoExecuteParamMaps";
import { formatRelationTypeForDisplay } from "./relationLabels";
import type { RuleGoRule } from "./types";
import {
  getExecutionLog,
  startExecuteRuleGoRule,
  type RuleGoExecutionLog,
  type RuleGoExecutionNodeLog,
} from "./useRuleGoApi";
import { useRuleGoRules } from "./useRuleGoRules";

function prettyJsonForDisplay(raw: string, emptyPlaceholder: string): string {
  const t = raw?.trim() ?? "";
  if (!t) return emptyPlaceholder;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return t;
  }
}

type ChainVisual = "idle" | "waiting" | "running" | "done" | "error";

function dslNodeVisual(
  execId: string | null,
  runningExec: boolean,
  finishedExec: boolean,
  log: RuleGoExecutionNodeLog | undefined
): ChainVisual {
  if (!execId) return "idle";
  if (!log) return finishedExec ? "idle" : "waiting";
  const done = Boolean((log.finished_at ?? "").trim());
  if (!done) return "running";
  if ((log.error_message ?? "").trim()) return "error";
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

function RuleParamFields({
  nodes,
  values,
  onChange,
  depth = 0,
}: {
  nodes: RuleChainParamNode[];
  values: Record<string, string>;
  onChange: (id: string, v: string) => void;
  depth?: number;
}) {
  return (
    <div style={depth ? { marginLeft: 10 } : undefined}>
      {nodes.map((n) => {
        if (!n.key.trim()) return null;
        if (n.type === "object") {
          return (
            <fieldset key={n.id} className="rulego-exec-nested-fieldset">
              <legend>{n.key}</legend>
              <RuleParamFields nodes={n.children} values={values} onChange={onChange} depth={depth + 1} />
            </fieldset>
          );
        }
        if (n.type === "array" && n.children.length > 0) {
          return (
            <div key={n.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#334155" }}>{n.key}（数组元素）</div>
              <RuleParamFields nodes={n.children} values={values} onChange={onChange} depth={depth + 1} />
            </div>
          );
        }
        return (
          <label key={n.id} className="form-field" style={{ marginBottom: 10 }}>
            <span>
              {n.key}
              {n.required ? " *" : ""}
              {n.description ? (
                <span style={{ fontWeight: 400, color: "var(--color-muted, #64748b)" }}> — {n.description}</span>
              ) : null}
            </span>
            {n.type === "boolean" ? (
              <select
                value={values[n.id] ?? "false"}
                onChange={(e) => onChange(n.id, e.target.value)}
                className="form-input"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type={n.type === "number" ? "number" : "text"}
                className="form-input"
                value={values[n.id] ?? ""}
                onChange={(e) => onChange(n.id, e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

export default function RuleGoExecuteRulePage() {
  const navigate = useNavigate();
  const { rules, loading, error: rulesError, refresh } = useRuleGoRules();

  const mainEnabledRules = useMemo(
    () =>
      rules.filter(
        (r) =>
          Boolean(r.definition?.trim()) &&
          getEnabledFromDefinition(r.definition) &&
          getRuleChainRootKind(r.definition) === "root"
      ),
    [rules]
  );

  const [selectedId, setSelectedId] = useState("");
  const [msgType, setMsgType] = useState("default");
  const [metaNodes, setMetaNodes] = useState<RuleChainParamNode[]>([]);
  const [bodyNodes, setBodyNodes] = useState<RuleChainParamNode[]>([]);
  const [metaLeaves, setMetaLeaves] = useState<Record<string, string>>({});
  const [bodyLeaves, setBodyLeaves] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mainEnabledRules.length === 0) {
      setSelectedId("");
      return;
    }
    setSelectedId((prev) => (prev && mainEnabledRules.some((r) => r.id === prev) ? prev : mainEnabledRules[0].id));
  }, [mainEnabledRules]);

  useEffect(() => {
    if (!selectedId) {
      setMetaNodes([]);
      setBodyNodes([]);
      setMetaLeaves({});
      setBodyLeaves({});
      return;
    }
    const rule = rules.find((r) => r.id === selectedId);
    if (!rule) return;
    const { metaNodes: mn, bodyNodes: bn } = parseMetadataAndBodyParamTrees(
      rule.requestMetadataParamsJson,
      rule.requestMessageBodyParamsJson
    );
    setMetaNodes(mn);
    setBodyNodes(bn);
    setMetaLeaves(initLeafStringValuesFromParamTree(mn));
    setBodyLeaves(initLeafStringValuesFromParamTree(bn));
  }, [selectedId, rules]);

  const updateMetaLeaf = useCallback((id: string, v: string) => {
    setMetaLeaves((p) => ({ ...p, [id]: v }));
  }, []);
  const updateBodyLeaf = useCallback((id: string, v: string) => {
    setBodyLeaves((p) => ({ ...p, [id]: v }));
  }, []);

  const [execId, setExecId] = useState<string | null>(null);
  const [pollLog, setPollLog] = useState<RuleGoExecutionLog | null>(null);
  const [pollNodes, setPollNodes] = useState<RuleGoExecutionNodeLog[]>([]);
  const [selectedNode, setSelectedNode] = useState<RuleGoExecutionNodeLog | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const startPoll = useCallback(
    (id: string) => {
      stopPoll();
      const tick = async () => {
        try {
          const { log, nodes } = await getExecutionLog(id);
          setPollLog(log);
          const sorted = [...(nodes ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
          setPollNodes(sorted);
          const fin = (log?.finished_at ?? "").trim();
          if (fin) stopPoll();
        } catch {
          // 轮询直到结束或用户离开
        }
      };
      void tick();
      pollRef.current = setInterval(() => void tick(), 400);
    },
    [stopPoll]
  );

  const handleExecute = async () => {
    if (!selectedId) return;
    setRunError(null);
    setSelectedNode(null);
    setPollLog(null);
    setPollNodes([]);
    setExecId(null);
    stopPoll();
    setStarting(true);
    try {
      const metaMap = buildMetadataStringMap(metaNodes, metaLeaves);
      const dataObj = buildDataObjectFromParamTree(bodyNodes, bodyLeaves);
      const data = JSON.stringify(dataObj);
      const { execution_id } = await startExecuteRuleGoRule(selectedId, {
        message_type: msgType || "default",
        metadata: metaMap,
        data,
      });
      if (!execution_id) {
        setRunError("未返回 execution_id，请确认执行日志存储已启用");
        return;
      }
      setExecId(execution_id);
      startPoll(execution_id);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const selectedRule: RuleGoRule | undefined = rules.find((r) => r.id === selectedId);

  const dslNodes = useMemo(() => {
    if (!selectedRule?.definition) return [];
    return extractNodesFromRuleDefinition(selectedRule.definition);
  }, [selectedRule]);

  const latestLogByNodeId = useMemo(() => {
    const m = new Map<string, RuleGoExecutionNodeLog>();
    for (const n of pollNodes) {
      const nid = (n.node_id ?? "").trim();
      if (!nid) continue;
      const prev = m.get(nid);
      if (!prev || (n.order_index ?? 0) >= (prev.order_index ?? 0)) {
        m.set(nid, n);
      }
    }
    return m;
  }, [pollNodes]);

  const running = Boolean(execId && pollLog && !(pollLog.finished_at ?? "").trim());
  const finished = Boolean((pollLog?.finished_at ?? "").trim());

  const selectLogForDslNode = useCallback(
    (nodeId: string) => {
      const log = latestLogByNodeId.get(nodeId);
      if (log) setSelectedNode(log);
    },
    [latestLogByNodeId]
  );

  return (
    <div className="page rulego-exec-page animate-fade-in">
      <div className="page-header">
        <div>
          <h2>执行规则</h2>
          <p className="page-subtitle">选择已启用的主规则链，按配置的请求参数执行并查看实时节点日志</p>
        </div>
        <div className="page-actions">
          <button className="text-button" type="button" onClick={() => void refresh()}>
            刷新规则列表
          </button>
        </div>
      </div>

      {rulesError ? <div className="form-error" style={{ marginBottom: 12 }}>{rulesError}</div> : null}

      <div className="rulego-exec-layout">
        <section className="rulego-exec-panel">
          <div className="rulego-exec-panel-header">请求参数</div>
          <div className="rulego-exec-panel-body rulego-exec-panel-body--form">
            {loading ? (
              <p className="table-empty">加载中…</p>
            ) : mainEnabledRules.length === 0 ? (
              <p className="table-empty">暂无已启用的主规则链，请先在规则管理中启用根规则链。</p>
            ) : (
              <>
                <div className="rulego-exec-section">
                  <label className="form-field" style={{ marginBottom: 0 }}>
                    <span>规则链</span>
                    <select
                      className="form-input"
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                    >
                      {mainEnabledRules.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rulego-exec-section">
                  <div className="rulego-exec-section-title">消息</div>
                  <label className="form-field" style={{ marginBottom: 0 }}>
                    <span>消息类型 (message_type)</span>
                    <input
                      className="form-input"
                      value={msgType}
                      onChange={(e) => setMsgType(e.target.value)}
                      placeholder="default"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </label>
                </div>

                <div className="rulego-exec-section">
                  <div className="rulego-exec-section-title">元数据参数</div>
                  {metaNodes.length === 0 ? (
                    <p className="form-hint" style={{ marginBottom: 0 }}>
                      未配置则发送空 metadata（可在规则表单中编辑「请求元数据参数」）
                    </p>
                  ) : (
                    <RuleParamFields nodes={metaNodes} values={metaLeaves} onChange={updateMetaLeaf} />
                  )}
                </div>

                <div className="rulego-exec-section">
                  <div className="rulego-exec-section-title">消息体参数</div>
                  {bodyNodes.length === 0 ? (
                    <p className="form-hint" style={{ marginBottom: 0 }}>
                      未配置则发送 {"{}"}
                    </p>
                  ) : (
                    <RuleParamFields nodes={bodyNodes} values={bodyLeaves} onChange={updateBodyLeaf} />
                  )}
                </div>

                <div className="rulego-exec-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={starting || running}
                    onClick={() => void handleExecute()}
                  >
                    {starting ? "启动中…" : running ? "执行中…" : "执行"}
                  </button>
                  {execId ? (
                    <button type="button" className="text-button" onClick={() => navigate(`/rulego/logs/${execId}`)}>
                      在执行日志中打开
                    </button>
                  ) : null}
                </div>

                {runError ? <div className="form-error" style={{ marginTop: 12 }}>{runError}</div> : null}

                <p className="form-hint" style={{ marginTop: 14, marginBottom: 0 }}>
                  若规则链含 LLM / 技能等，执行可能持续数分钟；可留在本页查看节点进度，或稍后在「执行日志」中查看完整记录。
                </p>
              </>
            )}
          </div>
        </section>

        <section className="rulego-exec-panel">
          <div className="rulego-exec-panel-header">执行与规则链</div>
          <div className="rulego-exec-panel-body">
            {!execId ? (
              <div className="rulego-exec-empty-hint">
                选择左侧规则并点击「执行」后，将在此展示规则链结构、实时执行轨迹与节点入参/出参。
              </div>
            ) : (
              <>
                <div className="rulego-exec-status-bar">
                  {running && <span className="rulego-log-status pending">执行中</span>}
                  {finished && pollLog?.success && <span className="rulego-log-status success">成功</span>}
                  {finished && !pollLog?.success && <span className="rulego-log-status failure">失败</span>}
                  <span className="rulego-exec-exec-id" title="执行记录 ID">
                    ID <code>{execId}</code>
                  </span>
                </div>
                {finished && pollLog?.error_message ? (
                  <div className="form-error" style={{ marginBottom: 16 }}>
                    {pollLog.error_message}
                  </div>
                ) : null}

                {dslNodes.length > 0 ? (
                  <div className="rulego-exec-chain-wrap">
                    <div className="rulego-exec-section-title">规则链结构（按 DSL 顺序）</div>
                    <p className="form-hint" style={{ marginTop: 0, marginBottom: 8, fontSize: 12 }}>
                      横向为画布节点顺序；颜色表示当前执行状态。可点击已出现日志的节点查看详情。
                    </p>
                    <div className="rulego-exec-chain-scroll" aria-label="规则链节点">
                      {dslNodes.map((dn, idx) => {
                        const log = latestLogByNodeId.get(dn.id);
                        const vis = dslNodeVisual(execId, running, finished, log);
                        const cardClass = [
                          "rulego-exec-chain-card",
                          `rulego-exec-chain-card--${vis}`,
                          log ? "is-clickable" : "",
                          selectedNode?.node_id === dn.id ? "is-selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        const badgeClass = `rulego-exec-chain-badge rulego-exec-chain-badge--${vis === "done" ? "done" : vis === "error" ? "error" : vis === "running" ? "running" : vis === "waiting" ? "waiting" : "idle"}`;
                        return (
                          <div key={dn.id} className="rulego-exec-chain-node">
                            <button
                              type="button"
                              className={cardClass}
                              disabled={!log}
                              onClick={() => selectLogForDslNode(dn.id)}
                              title={log ? "查看该节点日志" : "尚未产生节点日志"}
                            >
                              <span className="rulego-exec-chain-index">步骤 {idx + 1}</span>
                              <span className="rulego-exec-chain-name">{dn.name || dn.id}</span>
                              <span className="rulego-exec-chain-id" title={dn.id}>
                                {dn.id}
                              </span>
                              <span className={badgeClass}>{chainVisualLabel(vis)}</span>
                            </button>
                            {idx < dslNodes.length - 1 ? <span className="rulego-exec-chain-connector" aria-hidden /> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : execId ? (
                  <p className="form-hint" style={{ marginBottom: 16 }}>
                    当前规则 DSL 中无 metadata.nodes 列表，仅显示下方执行轨迹。
                  </p>
                ) : null}

                <div className="rulego-exec-section-title">节点执行轨迹</div>
                <p className="form-hint" style={{ marginTop: 0, marginBottom: 8, fontSize: 12 }}>
                  按实际进入顺序排列；蓝色为执行中，绿色为已完成，红色为节点报错。
                </p>
                {pollNodes.length === 0 ? (
                  <div className="rulego-exec-empty-hint" style={{ padding: "16px 12px" }}>
                    等待首个节点日志…
                  </div>
                ) : (
                  <ul className="rulego-exec-timeline" aria-label="节点执行轨迹">
                    {pollNodes.map((n) => {
                      const done = Boolean((n.finished_at ?? "").trim());
                      const hasErr = Boolean((n.error_message ?? "").trim());
                      const active = selectedNode?.id === n.id;
                      const rel = formatRelationTypeForDisplay(n.relation_type);
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            className={`rulego-exec-timeline-item${active ? " is-selected" : ""}${!done ? " is-running" : ""}${done && hasErr ? " is-error" : ""}${done && !hasErr ? " is-done" : ""}`}
                            onClick={() => setSelectedNode(n)}
                          >
                            <span className="rulego-exec-timeline-dot" aria-hidden />
                            <div className="rulego-exec-timeline-head">
                              <span className="rulego-exec-timeline-order">#{n.order_index}</span>
                              <span className="rulego-exec-timeline-title">{n.node_name || n.node_id}</span>
                            </div>
                            <div className="rulego-exec-timeline-meta">
                              {rel ? (
                                <>
                                  <span className="rulego-exec-timeline-relation">{rel}</span>
                                  <span> · </span>
                                </>
                              ) : null}
                              <span>{done ? "已完成" : "执行中"}</span>
                              {hasErr ? <span> · 节点错误</span> : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {selectedNode ? (
                  <div className="rulego-exec-detail-card">
                    <div className="rulego-exec-detail-title">
                      节点详情 · {selectedNode.node_name || selectedNode.node_id}
                    </div>
                    <label className="form-field">
                      <span>入参 data</span>
                      <JsonEditor
                        value={prettyJsonForDisplay(selectedNode.input_data ?? "", "(空)")}
                        onChange={() => {}}
                        readOnly
                        height={140}
                        minHeight={80}
                        showExpandButton
                        expandTitle="节点入参 data"
                      />
                    </label>
                    <label className="form-field">
                      <span>出参 data</span>
                      <JsonEditor
                        value={prettyJsonForDisplay(selectedNode.output_data ?? "", "(空)")}
                        onChange={() => {}}
                        readOnly
                        height={140}
                        minHeight={80}
                        showExpandButton
                        expandTitle="节点出参 data"
                      />
                    </label>
                    {(selectedNode.error_message ?? "").trim() ? (
                      <label className="form-field">
                        <span>错误</span>
                        <pre className="form-error" style={{ whiteSpace: "pre-wrap", fontSize: 12, padding: 8 }}>
                          {selectedNode.error_message}
                        </pre>
                      </label>
                    ) : null}
                  </div>
                ) : pollNodes.length > 0 ? (
                  <p className="form-hint" style={{ marginTop: 8 }}>
                    点击上方轨迹中的某一节点，查看该步的入参、出参与错误信息。
                  </p>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
