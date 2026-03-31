import { useCallback, useEffect, useMemo, useState } from "react";
import { workspaceApi, type WorkspaceDetail, type WorkspaceSummary, type WorkspaceValidationReport } from "./workspaceApi";

function safeStr(v: unknown, fallback = "—"): string {
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

function healthLabel(v: unknown): { text: string; tone: "ok" | "error" | "neutral" } {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s === "ok" || s === "healthy") return { text: "健康", tone: "ok" };
  if (s === "error" || s === "unhealthy") return { text: "异常", tone: "error" };
  return { text: "未知", tone: "neutral" };
}

export default function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  const [addPath, setAddPath] = useState("");
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);

  const [validating, setValidating] = useState(false);
  const [report, setReport] = useState<WorkspaceValidationReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const selectedSummary = useMemo(
    () => workspaces.find((w) => w.id === selectedId) ?? null,
    [selectedId, workspaces]
  );

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const v = await workspaceApi.listWorkspaces();
      setWorkspaces(v ?? []);
      if (!selectedId && v?.length) {
        setSelectedId(v[0].id);
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const v = await workspaceApi.getWorkspace(id);
      setDetail(v);
    } catch (e) {
      setDetail(null);
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setReport(null);
    setReportError(null);
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setListError(null);
    try {
      const created = await workspaceApi.createWorkspace(name);
      setCreateName("");
      await loadList();
      if (created?.id) setSelectedId(created.id);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleAddProject = async () => {
    if (!selectedId) return;
    const p = addPath.trim();
    if (!p) return;
    setAdding(true);
    setDetailError(null);
    try {
      const v = await workspaceApi.addProject(selectedId, p, addName.trim() || "");
      setDetail(v);
      setAddPath("");
      setAddName("");
      await loadList();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const handlePickProjectDir = async () => {
    try {
      const w = window as any;
      const fn =
        w?.go?.main?.App?.OpenWorkspaceProjectDirDialog ??
        w?.go?.main?.App?.OpenAgentWorkspaceDialog;
      if (typeof fn !== "function") {
        throw new Error("当前应用未暴露目录选择对话框接口，请重新编译运行后再试。");
      }
      const p = await fn();
      if (typeof p === "string" && p.trim()) {
        setAddPath(p);
      }
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!selectedId) return;
    setDetailError(null);
    try {
      const v = await workspaceApi.removeProject(selectedId, projectId);
      setDetail(v);
      await loadList();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleValidate = async () => {
    if (!selectedId) return;
    setValidating(true);
    setReport(null);
    setReportError(null);
    try {
      const r = await workspaceApi.validateWorkspace(selectedId);
      setReport(r ?? ({} as WorkspaceValidationReport));
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e));
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <h2>工作区</h2>
          <p className="page-subtitle">管理本地工作区与项目绑定</p>
        </div>
        <div className="page-actions">
          <button className="text-button" type="button" onClick={loadList} disabled={loadingList}>
            刷新
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        {/* 左侧：工作区列表 */}
        <div className="table-card" style={{ overflow: "hidden", minHeight: 520 }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.08))" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="输入工作区名称"
                style={{ flex: 1 }}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
              <button className="primary-button" type="button" onClick={handleCreate} disabled={creating || !createName.trim()}>
                {creating ? "创建中…" : "创建"}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              共 {workspaces.length} 个工作区
            </div>
          </div>

          {loadingList ? (
            <div className="table-empty table-empty-loading" role="status" aria-live="polite">
              <span className="table-inline-spinner" aria-hidden />
              <span>加载中…</span>
            </div>
          ) : workspaces.length === 0 ? (
            <div className="table-empty">暂无工作区，请先创建</div>
          ) : (
            <div className="table-body">
              {workspaces.map((w) => {
                const isSelected = w.id === selectedId;
                const health = healthLabel(w.health);
                const healthBg =
                  health.tone === "ok"
                    ? "rgba(34,197,94,0.12)"
                    : health.tone === "error"
                      ? "rgba(239,68,68,0.12)"
                      : "rgba(148,163,184,0.18)";
                const healthFg =
                  health.tone === "ok"
                    ? "rgb(22,163,74)"
                    : health.tone === "error"
                      ? "rgb(220,38,38)"
                      : "rgb(71,85,105)";
                const count = Array.isArray((w as any).projects) ? (w as any).projects.length : undefined;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedId(w.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.06))",
                      background: isSelected ? "rgba(59,130,246,0.08)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 600 }}>{safeStr(w.name, "(未命名)")}</div>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: healthBg,
                          color: healthFg,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {health.text}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                      项目数：{typeof count === "number" ? count : "—"} · ID：<code>{w.id}</code>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {listError ? <div className="table-error">{listError}</div> : null}
        </div>

        {/* 右侧：工作区详情 */}
        <div className="table-card" style={{ overflow: "hidden", minHeight: 520 }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.08))" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {selectedSummary ? safeStr(selectedSummary.name, "(未命名)") : "未选择工作区"}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                  {selectedId ? (
                    <>
                      Workspace ID：<code>{selectedId}</code>
                    </>
                  ) : (
                    "请在左侧选择一个工作区"
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary-button" type="button" onClick={handleValidate} disabled={!selectedId || validating}>
                  {validating ? "校验中…" : "校验"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(140px, 200px) auto", gap: 8, alignItems: "center" }}>
              <input
                value={addPath}
                onChange={(e) => setAddPath(e.target.value)}
                placeholder="项目绝对路径（必填）"
                style={{ flex: 1 }}
                disabled={!selectedId}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
              <button
                className="text-button"
                type="button"
                onClick={handlePickProjectDir}
                disabled={!selectedId}
                title="选择本地项目目录"
              >
                选择文件夹
              </button>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="项目名（可选）"
                style={{ width: "100%" }}
                disabled={!selectedId}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
              <button
                className="primary-button"
                type="button"
                onClick={handleAddProject}
                disabled={!selectedId || adding || !addPath.trim()}
              >
                {adding ? "添加中…" : "添加项目"}
              </button>
            </div>
          </div>

          {loadingDetail ? (
            <div className="table-empty table-empty-loading" role="status" aria-live="polite">
              <span className="table-inline-spinner" aria-hidden />
              <span>加载详情中…</span>
            </div>
          ) : !selectedId ? (
            <div className="table-empty">请选择一个工作区</div>
          ) : detail ? (
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>项目列表（{detail.projects?.length ?? 0}）</div>
              <div className="table-card" style={{ margin: 0 }}>
                <div className="table-head">
                  <div className="table-cell">名称</div>
                  <div className="table-cell">路径</div>
                  <div className="table-cell">Slug</div>
                  <div className="table-cell">状态</div>
                  <div className="table-cell">操作</div>
                </div>
                {!detail.projects || detail.projects.length === 0 ? (
                  <div className="table-empty">暂无项目，请在上方添加</div>
                ) : (
                  <div className="table-body">
                    {detail.projects.map((p) => (
                      <div className="table-row" key={p.id || p.abs_path}>
                        <div className="table-cell">{safeStr(p.name, "—")}</div>
                        <div className="table-cell">
                          <code>{safeStr((p as any).abs_path, "—")}</code>
                        </div>
                        <div className="table-cell">{safeStr(p.slug, "—")}</div>
                        <div className="table-cell">{String((p as any).enabled ?? "—")}</div>
                        <div className="table-cell table-actions">
                          <button
                            className="text-button danger"
                            type="button"
                            onClick={() => handleRemoveProject(p.id)}
                            disabled={!p.id}
                            title={!p.id ? "缺少 projectId，无法移除" : "移除该项目"}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 600 }}>校验报告</div>
                  {report?.ok === true ? (
                    <span style={{ fontSize: 12, color: "rgb(22,163,74)" }}>OK</span>
                  ) : report?.ok === false ? (
                    <span style={{ fontSize: 12, color: "rgb(220,38,38)" }}>Errors</span>
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.75 }}>—</span>
                  )}
                </div>
                {reportError ? <div className="table-error" style={{ marginTop: 8 }}>{reportError}</div> : null}
                {report ? (
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 10,
                      background: "rgba(15,23,42,0.04)",
                      maxHeight: 260,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {JSON.stringify(report, null, 2)}
                  </pre>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    点击右上角“校验”以生成报告
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="table-empty">未获取到工作区详情</div>
          )}

          {detailError ? <div className="table-error">{detailError}</div> : null}
        </div>
      </div>
    </div>
  );
}

