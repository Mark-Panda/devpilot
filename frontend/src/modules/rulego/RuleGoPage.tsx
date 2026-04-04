import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ListModelConfigs } from "../../../wailsjs/go/model_management/Service";
import {
  getRuleChainNameFromDefinition,
  getRuleChainRootKind,
  setDisabledInDefinition,
} from "./dslUtils";
import { getSkillDirNameFromDefinition, parseDevPilotFromDefinition } from "./devpilotDsl";
import RuleGoForm from "./RuleGoForm";
import type { RuleGoRule } from "./types";
import type { RuleGoListLocationState } from "./rulegoListNavigation";
import { humanizeRuleGoLoadFailure } from "./rulegoLoadErrors";
import { useRuleGoRules } from "./useRuleGoRules";

export default function RuleGoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    rules,
    loading,
    error,
    refresh,
    create,
    update,
    remove,
    loadChainAllowDisabled,
    unloadChain,
    generateSkill,
  } = useRuleGoRules({ skipInitialLoad: true });

  useEffect(() => {
    const st = location.state as RuleGoListLocationState | null;
    if (st?.rulegoListRefresh) {
      void refresh({ silent: true });
      navigate("/rulego", { replace: true });
      return;
    }
    void refresh();
    // 仅挂载时决定首屏或「带 state 返回」的加载策略
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 避免 refresh/navigate 引用变化导致重复 List
  }, []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleGoRule | null>(null);
  const [confirmingRule, setConfirmingRule] = useState<RuleGoRule | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [chainKindFilter, setChainKindFilter] = useState<"all" | "root" | "sub">("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  /** 正在生成技能的规则 ID，用于显示“生成中...”并禁用按钮 */
  const [generatingSkillRuleId, setGeneratingSkillRuleId] = useState<string | null>(null);
  /** 正在切换启用状态的规则 ID，防止重复点击 */
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  /** 加载规则链失败时的错误弹框（未加载成功不写 DSL） */
  const [chainLoadError, setChainLoadError] = useState<{
    ruleLabel: string;
    title: string;
    summary: string;
    technicalDetail?: string;
  } | null>(null);

  const withFeedback = async (fn: () => Promise<void>, successMsg: string) => {
    try {
      await fn();
      setActionFeedback({ msg: successMsg });
      setTimeout(() => setActionFeedback(null), 2500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionFeedback({ msg: msg || "操作失败", isError: true });
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  const filteredRules = rules.filter((rule) => {
    const rootKind = getRuleChainRootKind(rule.definition);
    const running = Boolean(rule.definition?.trim()) && rule.engineLoaded === true;

    const kindOk =
      chainKindFilter === "all"
        ? true
        : chainKindFilter === "root"
          ? rootKind === "root"
          : rootKind === "sub";

    const runOk =
      enabledFilter === "all"
        ? true
        : enabledFilter === "enabled"
          ? running
          : !running;
    return kindOk && runOk;
  });

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div>
          <h2>规则管理</h2>
          <p className="page-subtitle">管理规则链定义</p>
        </div>
        <div className="page-actions">
          <div className="dp-filter-bar" role="group" aria-label="规则筛选">
            <label className="dp-filter-field">
              <span className="dp-filter-label">类型</span>
              <select
                className="dp-select"
                value={chainKindFilter}
                onChange={(e) => setChainKindFilter(e.target.value as "all" | "root" | "sub")}
                aria-label="规则链类型筛选"
              >
                <option value="all">全部</option>
                <option value="root">主规则链</option>
                <option value="sub">子规则链</option>
              </select>
            </label>
            <label className="dp-filter-field">
              <span className="dp-filter-label">运行</span>
              <select
                className="dp-select"
                value={enabledFilter}
                onChange={(e) =>
                  setEnabledFilter(e.target.value as "all" | "enabled" | "disabled")
                }
                aria-label="规则链引擎运行状态筛选"
              >
                <option value="all">全部</option>
                <option value="enabled">已加载</option>
                <option value="disabled">未加载</option>
              </select>
            </label>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate("/rulego/editor")}
          >
            新增规则
          </button>
          <button className="text-button" type="button" onClick={refresh}>
            刷新
          </button>
        </div>
      </div>

      <div className="table-card rulego-table">
        <div className="table-head">
          <div className="table-cell">名称</div>
          <div className="table-cell">描述</div>
          <div className="table-cell">主/子</div>
          <div className="table-cell">运行</div>
          <div className="table-cell">操作</div>
        </div>
        {loading ? (
          <div className="table-empty table-empty-loading" role="status" aria-live="polite">
            <span className="table-inline-spinner" aria-hidden />
            <span>加载中…</span>
          </div>
        ) : rules.length === 0 ? (
          <div className="table-empty">暂无数据</div>
        ) : filteredRules.length === 0 ? (
          <div className="table-empty">无匹配规则</div>
        ) : (
          <div className="table-body">
            {filteredRules.map((rule) => {
              const hasDefinition = Boolean(rule.definition);
              const running = hasDefinition && rule.engineLoaded === true;
              const rootKind = getRuleChainRootKind(rule.definition);
              const rootKindLabel = rootKind === "sub" ? "子" : rootKind === "root" ? "主" : "—";
              const displayName = getRuleChainNameFromDefinition(rule.definition) || rule.id;
              const skillDirName = getSkillDirNameFromDefinition(rule.definition);
              return (
              <div className="table-row" key={rule.id}>
                <div className="table-cell">{displayName}</div>
                <div className="table-cell">
                  {parseDevPilotFromDefinition(rule.definition)?.description?.trim() || "-"}
                </div>
                <div className="table-cell">{rootKindLabel}</div>
                <div
                  className="table-cell"
                  title="与左侧开关一致：已加载表示规则链在引擎池中且初始化成功；开启时先加载成功再写入 DSL 启用"
                >
                  {!hasDefinition ? "—" : running ? "已加载" : "未加载"}
                </div>
                <div className="table-cell table-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => navigate(`/rulego/editor/${rule.id}`)}
                  >
                    可视化
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setEditingRule(rule);
                      setModalOpen(true);
                    }}
                  >
                    编辑
                  </button>
                  {hasDefinition ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={running}
                      aria-label={running ? "卸载规则链" : "加载规则链"}
                      className="rulego-enable-switch"
                      disabled={togglingRuleId === rule.id}
                      onClick={() => {
                        if (running) {
                          void withFeedback(async () => {
                            setTogglingRuleId(rule.id);
                            try {
                              await unloadChain(rule.id);
                              await update(rule.id, {
                                definition: setDisabledInDefinition(rule.definition, true),
                              });
                              await refresh({ silent: true });
                            } finally {
                              setTogglingRuleId(null);
                            }
                          }, "已卸载");
                          return;
                        }
                        void (async () => {
                          setTogglingRuleId(rule.id);
                          let persistFailedAfterEngineLoad = false;
                          try {
                            await loadChainAllowDisabled(rule.id);
                            try {
                              await update(rule.id, {
                                definition: setDisabledInDefinition(rule.definition, false),
                              });
                            } catch (updateErr) {
                              persistFailedAfterEngineLoad = true;
                              try {
                                await unloadChain(rule.id);
                              } catch (unloadErr) {
                                console.error(
                                  "[rulego] 启用状态写入失败后回滚卸载失败",
                                  unloadErr
                                );
                              }
                              throw updateErr;
                            }
                            await refresh({ silent: true });
                            setActionFeedback({ msg: "已加载" });
                            setTimeout(() => setActionFeedback(null), 2500);
                          } catch (e) {
                            const raw =
                              (e instanceof Error ? e.message : String(e)).trim() || "操作失败";
                            if (persistFailedAfterEngineLoad) {
                              setChainLoadError({
                                ruleLabel: displayName,
                                title: "保存启用状态失败",
                                summary:
                                  "规则链已在引擎中加载，但写入文件（启用）失败，已从引擎卸载，避免与磁盘上的「停用」状态不一致。请检查权限或稍后重试。",
                                technicalDetail: raw,
                              });
                            } else {
                              const h = humanizeRuleGoLoadFailure(raw);
                              setChainLoadError({
                                ruleLabel: displayName,
                                title: h.title,
                                summary: h.summary,
                                technicalDetail: h.technicalDetail,
                              });
                            }
                          } finally {
                            setTogglingRuleId(null);
                          }
                        })();
                      }}
                    >
                      <span className="rulego-enable-switch-thumb" aria-hidden />
                    </button>
                  ) : null}
                  {running && rootKind === "root" ? (
                    <button
                      className="text-button"
                      type="button"
                      disabled={generatingSkillRuleId !== null}
                      onClick={() =>
                        withFeedback(async () => {
                          setGeneratingSkillRuleId(rule.id);
                          try {
                            const configs = await ListModelConfigs();
                            if (!configs?.length) {
                              throw new Error("请先在模型管理中配置至少一个模型");
                            }
                            const c = configs[0];
                            const model = c.models?.[0]?.trim();
                            if (!model) {
                              throw new Error("该模型配置下没有可用模型");
                            }
                            const fallback = (c.models ?? [])
                              .map((m) => String(m).trim())
                              .filter((m) => m && m !== model);
                            await generateSkill(
                              rule.id,
                              c.base_url || "",
                              c.api_key || "",
                              model,
                              fallback
                            );
                            await refresh({ silent: true });
                          } finally {
                            setGeneratingSkillRuleId(null);
                          }
                        }, skillDirName ? "技能已更新" : "技能已创建")
                      }
                    >
                      {generatingSkillRuleId === rule.id
                        ? "生成中…"
                        : skillDirName
                          ? "更新技能"
                          : "创建技能"}
                    </button>
                  ) : null}
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => setConfirmingRule(rule)}
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
            role={actionFeedback.isError ? "alert" : undefined}
          >
            {actionFeedback.msg}
          </div>
        ) : null}
      </div>

      {modalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalOpen(false)}
        >
          <div className="modal modal--rulego-edit" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRule ? "编辑规则" : "新增规则"}</h3>
              <button
                className="text-button"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                关闭
              </button>
            </div>
            <RuleGoForm
              mode={editingRule ? "edit" : "create"}
              initial={editingRule}
              showEditorJson={false}
              showDefinition={!editingRule}
              onCancel={() => setModalOpen(false)}
              onSubmit={async (values) => {
                if (editingRule) {
                  await update(editingRule.id, values);
                  setModalOpen(false);
                  setEditingRule(null);
                  await refresh({ silent: true });
                } else {
                  // 新增时先关闭弹窗再请求，避免用户再次点击保存产生重复创建
                  setModalOpen(false);
                  setEditingRule(null);
                  try {
                    await create(values);
                    await refresh({ silent: true });
                  } catch (e) {
                    setActionFeedback({
                      msg: e instanceof Error ? e.message : String(e),
                      isError: true,
                    });
                    setTimeout(() => setActionFeedback(null), 5000);
                  }
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {chainLoadError ? (
        <div
          className="modal-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="rulego-load-error-title"
          aria-describedby="rulego-load-error-desc"
          onClick={() => setChainLoadError(null)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 id="rulego-load-error-title">{chainLoadError.title}</h3>
              <button
                className="text-button"
                type="button"
                onClick={() => setChainLoadError(null)}
              >
                关闭
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text" style={{ marginBottom: 10 }}>
                规则：<strong>{chainLoadError.ruleLabel}</strong>
              </p>
              <p
                id="rulego-load-error-desc"
                className="confirm-text"
                style={{ margin: "0 0 12px", lineHeight: 1.55 }}
              >
                {chainLoadError.summary}
              </p>
              {chainLoadError.technicalDetail ? (
                <details className="rulego-load-error-details">
                  <summary className="text-button" style={{ cursor: "pointer", marginBottom: 8 }}>
                    查看技术详情（供排查）
                  </summary>
                  <pre
                    className="form-hint"
                    style={{
                      margin: 0,
                      padding: 10,
                      borderRadius: 8,
                      background: "var(--color-surface-muted, #f1f5f9)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 12,
                      maxHeight: 200,
                      overflow: "auto",
                    }}
                  >
                    {chainLoadError.technicalDetail}
                  </pre>
                </details>
              ) : null}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => setChainLoadError(null)}
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmingRule ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmingRule(null)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>确认删除</h3>
              <button
                className="text-button"
                type="button"
                onClick={() => setConfirmingRule(null)}
              >
                关闭
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                确定要删除规则{" "}
                <strong>{getRuleChainNameFromDefinition(confirmingRule.definition) || confirmingRule.id}</strong>{" "}
                吗？
              </p>
            </div>
            <div className="modal-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setConfirmingRule(null)}
              >
                取消
              </button>
              <button
                className="primary-button danger"
                type="button"
                onClick={async () => {
                  await remove(confirmingRule.id);
                  setConfirmingRule(null);
                  await refresh({ silent: true });
                }}
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
