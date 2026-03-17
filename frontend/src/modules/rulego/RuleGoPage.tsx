import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListModelConfigs } from "../../../wailsjs/go/model_management/Service";
import { getEnabledFromDefinition, setDisabledInDefinition } from "./dslUtils";
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
  /** 正在生成技能的规则 ID，用于显示“生成中...”并禁用按钮 */
  const [generatingSkillRuleId, setGeneratingSkillRuleId] = useState<string | null>(null);

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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>RuleGo 规则管理</h2>
          <p className="page-subtitle">管理 RuleGo 规则定义</p>
        </div>
        <div className="page-actions">
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
          <div className="table-cell">状态</div>
          <div className="table-cell">操作</div>
        </div>
        {loading ? (
          <div className="table-empty">加载中...</div>
        ) : rules.length === 0 ? (
          <div className="table-empty">暂无数据</div>
        ) : (
          <div className="table-body">
            {rules.map((rule) => {
              // 状态以 definition 中 DSL 的 ruleChain.disabled 为准（表中已无 enabled 字段）
              const effectiveEnabled = getEnabledFromDefinition(rule.definition);
              const hasDefinition = Boolean(rule.definition);
              const basePayload = {
                name: rule.name,
                description: rule.description,
                definition: rule.definition,
                editorJson: rule.editorJson,
              };
              return (
              <div className="table-row" key={rule.id}>
                <div className="table-cell">{rule.name}</div>
                <div className="table-cell">{rule.description || "-"}</div>
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
                    编辑
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setEditingRule(rule);
                      setModalOpen(true);
                    }}
                  >
                    表单编辑
                  </button>
                  {hasDefinition ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        effectiveEnabled
                          ? withFeedback(async () => {
                              await update(rule.id, {
                                ...basePayload,
                                definition: setDisabledInDefinition(rule.definition, true),
                              });
                              await unloadChain(rule.id);
                            }, "已关闭")
                          : withFeedback(async () => {
                              await update(rule.id, {
                                ...basePayload,
                                definition: setDisabledInDefinition(rule.definition, false),
                              });
                              await loadChain(rule.id);
                            }, "已开启")
                      }
                    >
                      {effectiveEnabled ? "关闭" : "开启"}
                    </button>
                  ) : null}
                  {effectiveEnabled && hasDefinition ? (
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
                            await generateSkill(rule.id, c.base_url || "", c.api_key || "", model);
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
          <div className="modal" onClick={(event) => event.stopPropagation()}>
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
