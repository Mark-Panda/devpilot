import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListModelConfigs } from "../../../wailsjs/go/model_management/Service";
import { getEnabledFromDefinition, getRuleChainRootKind, setDisabledInDefinition } from "./dslUtils";
import RuleGoForm from "./RuleGoForm";
import type { RuleGoRule } from "./types";
import { useRuleGoRules } from "./useRuleGoRules";

export default function RuleGoPage() {
  const navigate = useNavigate();
  const { rules, loading, error, refresh, create, update, remove, loadChain, unloadChain, generateSkill } =
    useRuleGoRules();
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
    const effectiveEnabled = getEnabledFromDefinition(rule.definition);

    const kindOk =
      chainKindFilter === "all"
        ? true
        : chainKindFilter === "root"
          ? rootKind === "root"
          : rootKind === "sub";

    const enabledOk =
      enabledFilter === "all"
        ? true
        : enabledFilter === "enabled"
          ? effectiveEnabled
          : !effectiveEnabled;
    return kindOk && enabledOk;
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
              <span className="dp-filter-label">状态</span>
              <select
                className="dp-select"
                value={enabledFilter}
                onChange={(e) =>
                  setEnabledFilter(e.target.value as "all" | "enabled" | "disabled")
                }
                aria-label="规则开启状态筛选"
              >
                <option value="all">全部</option>
                <option value="enabled">已开启</option>
                <option value="disabled">已关闭</option>
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
          <div className="table-cell">状态</div>
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
              // 状态以 definition 中 DSL 的 ruleChain.disabled 为准（表中已无 enabled 字段）
              const effectiveEnabled = getEnabledFromDefinition(rule.definition);
              const hasDefinition = Boolean(rule.definition);
              const rootKind = getRuleChainRootKind(rule.definition);
              const rootKindLabel = rootKind === "sub" ? "子" : rootKind === "root" ? "主" : "—";
              const basePayload = {
                name: rule.name,
                description: rule.description,
                definition: rule.definition,
                editorJson: rule.editorJson,
                requestMetadataParamsJson: rule.requestMetadataParamsJson ?? "[]",
                requestMessageBodyParamsJson: rule.requestMessageBodyParamsJson ?? "[]",
                responseMessageBodyParamsJson: rule.responseMessageBodyParamsJson ?? "[]",
              };
              return (
              <div className="table-row" key={rule.id}>
                <div className="table-cell">{rule.name}</div>
                <div className="table-cell">{rule.description || "-"}</div>
                <div className="table-cell">{rootKindLabel}</div>
                <div className="table-cell">
                  {hasDefinition
                    ? effectiveEnabled
                      ? "已开启"
                      : "已关闭"
                    : effectiveEnabled
                      ? "启用"
                      : "停用"}
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
                      aria-checked={effectiveEnabled}
                      aria-label={effectiveEnabled ? "关闭规则" : "开启规则"}
                      className="rulego-enable-switch"
                      disabled={togglingRuleId === rule.id}
                      onClick={() =>
                        effectiveEnabled
                          ? withFeedback(async () => {
                              setTogglingRuleId(rule.id);
                              try {
                                await update(rule.id, {
                                  ...basePayload,
                                  definition: setDisabledInDefinition(rule.definition, true),
                                });
                                await unloadChain(rule.id);
                              } finally {
                                setTogglingRuleId(null);
                              }
                            }, "已关闭")
                          : withFeedback(async () => {
                              setTogglingRuleId(rule.id);
                              try {
                                await update(rule.id, {
                                  ...basePayload,
                                  definition: setDisabledInDefinition(rule.definition, false),
                                });
                                await loadChain(rule.id);
                              } finally {
                                setTogglingRuleId(null);
                              }
                            }, "已开启")
                      }
                    >
                      <span className="rulego-enable-switch-thumb" aria-hidden />
                    </button>
                  ) : null}
                  {effectiveEnabled && hasDefinition && rootKind === "root" ? (
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
                            await refresh();
                          } finally {
                            setGeneratingSkillRuleId(null);
                          }
                        }, rule.skillDirName ? "技能已更新" : "技能已创建")
                      }
                    >
                      {generatingSkillRuleId === rule.id
                        ? "生成中…"
                        : rule.skillDirName
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
                  await refresh();
                } else {
                  // 新增时先关闭弹窗再请求，避免用户再次点击保存产生重复创建
                  setModalOpen(false);
                  setEditingRule(null);
                  try {
                    await create(values);
                    await refresh();
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
                确定要删除规则 <strong>{confirmingRule.name}</strong> 吗？
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
                  await refresh();
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
