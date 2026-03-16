import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RuleGoForm from "./RuleGoForm";
import type { RuleGoRule } from "./types";
import { useRuleGoRules } from "./useRuleGoRules";

export default function RuleGoPage() {
  const navigate = useNavigate();
  const { rules, loading, error, refresh, create, update, remove, loadChain, unloadChain } = useRuleGoRules();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleGoRule | null>(null);
  const [confirmingRule, setConfirmingRule] = useState<RuleGoRule | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);
  /** 本地记录的“已启用”规则 ID，用于切换按钮展示（与后端实际加载状态可能不同步） */
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());

  const withFeedback = async (fn: () => Promise<void>, successMsg: string) => {
    try {
      await fn();
      setActionFeedback({ msg: successMsg });
      setTimeout(() => setActionFeedback(null), 2500);
    } catch (e) {
      setActionFeedback({ msg: (e as Error).message, isError: true });
      setTimeout(() => setActionFeedback(null), 3500);
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
            {rules.map((rule) => (
              <div className="table-row" key={rule.id}>
                <div className="table-cell">{rule.name}</div>
                <div className="table-cell">{rule.description || "-"}</div>
                <div className="table-cell">{rule.enabled ? "启用" : "停用"}</div>
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
                  {rule.enabled && rule.definition ? (
                    loadedIds.has(rule.id) ? (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          withFeedback(async () => {
                            await unloadChain(rule.id);
                            setLoadedIds((prev) => {
                              const next = new Set(prev);
                              next.delete(rule.id);
                              return next;
                            });
                          }, "已禁用")
                        }
                      >
                        禁用
                      </button>
                    ) : (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          withFeedback(async () => {
                            await loadChain(rule.id);
                            setLoadedIds((prev) => new Set(prev).add(rule.id));
                          }, "已启用")
                        }
                      >
                        启用
                      </button>
                    )
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
            ))}
          </div>
        )}
        {error ? <div className="table-error">{error}</div> : null}
        {actionFeedback ? (
          <div className={actionFeedback.isError ? "table-error" : "form-hint"} style={{ marginTop: 8 }}>
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
                } else {
                  await create(values);
                }
                setModalOpen(false);
                setEditingRule(null);
                await refresh();
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
