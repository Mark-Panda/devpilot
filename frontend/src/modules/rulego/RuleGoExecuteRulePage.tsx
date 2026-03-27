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
    <div style={{ marginLeft: depth ? 12 : 0 }}>
      {nodes.map((n) => {
        if (!n.key.trim()) return null;
        if (n.type === "object") {
          return (
            <fieldset key={n.id} style={{ marginBottom: 12, border: "1px solid var(--color-border, #e2e8f0)", borderRadius: 8, padding: "8px 12px" }}>
              <legend style={{ fontSize: 13, fontWeight: 600 }}>{n.key}</legend>
              <RuleParamFields nodes={n.children} values={values} onChange={onChange} depth={depth + 1} />
            </fieldset>
          );
        }
        if (n.type === "array" && n.children.length > 0) {
          return (
            <div key={n.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{n.key}（数组元素）</div>
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

  const nodeIdToLogStatus = useMemo(() => {
    const m = new Map<string, { done: boolean }>();
    for (const n of pollNodes) {
      const nid = (n.node_id ?? "").trim();
      if (!nid) continue;
      const done = Boolean((n.finished_at ?? "").trim());
      const prev = m.get(nid);
      if (!prev || !prev.done) m.set(nid, { done });
    }
    return m;
  }, [pollNodes]);

  const running = Boolean(execId && pollLog && !(pollLog.finished_at ?? "").trim());
  const finished = Boolean((pollLog?.finished_at ?? "").trim());

  return (
    <div className="page">
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

      {rulesError ? <div className="form-error">{rulesError}</div> : null}

      <div
        className="table-card"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1.1fr)",
          gap: 20,
          padding: 20,
          alignItems: "start",
        }}
      >
        <div>
          {loading ? (
            <p className="table-empty">加载中…</p>
          ) : mainEnabledRules.length === 0 ? (
            <p className="table-empty">暂无已启用的主规则链，请先在规则管理中启用根规则链。</p>
          ) : (
            <>
              <label className="form-field">
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

              <label className="form-field">
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

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>元数据参数</div>
                {metaNodes.length === 0 ? (
                  <p className="form-hint" style={{ marginBottom: 12 }}>
                    未配置则发送空 metadata（可在规则表单中编辑「请求元数据参数」）
                  </p>
                ) : (
                  <RuleParamFields nodes={metaNodes} values={metaLeaves} onChange={updateMetaLeaf} />
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>消息体参数</div>
                {bodyNodes.length === 0 ? (
                  <p className="form-hint" style={{ marginBottom: 12 }}>
                    未配置则发送 {"{}"}
                  </p>
                ) : (
                  <RuleParamFields nodes={bodyNodes} values={bodyLeaves} onChange={updateBodyLeaf} />
                )}
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
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

              <p className="form-hint" style={{ marginTop: 16 }}>
                若规则链含 LLM / 技能等，执行可能持续数分钟；可留在本页查看节点进度，或稍后在「执行日志」中查看完整记录。
              </p>
            </>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>执行进度</div>
          {!execId ? (
            <p className="form-hint">选择规则并点击「执行」后，此处显示进度与节点轨迹。</p>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--color-muted, #64748b)", marginBottom: 8 }}>
                execution_id: <code style={{ wordBreak: "break-all" }}>{execId}</code>
              </div>
              <div style={{ marginBottom: 12 }}>
                {running && <span className="rulego-log-status pending">执行中…</span>}
                {finished && pollLog?.success && <span className="rulego-log-status success">成功</span>}
                {finished && !pollLog?.success && <span className="rulego-log-status failure">失败</span>}
                {finished && pollLog?.error_message ? (
                  <div className="form-error" style={{ marginTop: 8 }}>
                    {pollLog.error_message}
                  </div>
                ) : null}
              </div>

              <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>节点执行轨迹</div>
              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  border: "1px solid var(--color-border, #e2e8f0)",
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              >
                {pollNodes.length === 0 ? (
                  <div className="form-hint" style={{ padding: 12 }}>
                    等待首个节点日志…
                  </div>
                ) : (
                  pollNodes.map((n) => {
                    const done = Boolean((n.finished_at ?? "").trim());
                    const active = selectedNode?.id === n.id;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setSelectedNode(n)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          border: "none",
                          borderBottom: "1px solid var(--color-border, #e2e8f0)",
                          background: active ? "var(--color-block-bg, #f1f5f9)" : "transparent",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: "var(--color-muted, #64748b)", marginRight: 8 }}>#{n.order_index}</span>
                        <strong>{n.node_name || n.node_id}</strong>
                        <span style={{ marginLeft: 8, fontSize: 12 }}>
                          {done ? "已完成" : "执行中"}
                          {(n.error_message ?? "").trim() ? " · 错误" : ""}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {dslNodes.length > 0 ? (
                <>
                  <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>规则链节点概览（DSL）</div>
                  <div style={{ fontSize: 12, color: "var(--color-muted, #64748b)", marginBottom: 6 }}>
                    与画布 metadata.nodes 对应，便于对照执行状态
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 120, overflowY: "auto" }}>
                    {dslNodes.map((dn) => {
                      const st = nodeIdToLogStatus.get(dn.id);
                      let label = "待执行";
                      if (st) label = st.done ? "已记录" : "执行中";
                      return (
                        <li key={dn.id}>
                          {dn.name || dn.id}{" "}
                          <span style={{ color: "var(--color-muted, #64748b)" }}>({label})</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}

              {selectedNode ? (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    节点日志 · {selectedNode.node_name || selectedNode.node_id}
                  </div>
                  <label className="form-field">
                    <span>入参 data</span>
                    <JsonEditor
                      value={prettyJsonForDisplay(selectedNode.input_data ?? "", "(空)")}
                      onChange={() => {}}
                      readOnly
                      height={120}
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
                      height={120}
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
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
