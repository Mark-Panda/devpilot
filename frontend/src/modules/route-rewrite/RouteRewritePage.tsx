import { useState } from "react";
import RouteRewriteForm from "./RouteRewriteForm";
import type { RouteRewriteRule } from "./types";
import { useRouteRewriteRules } from "./useRouteRewriteRules";

export default function RouteRewritePage() {
  const { rules, loading, error, refresh, remove, create, update } =
    useRouteRewriteRules();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RouteRewriteRule | null>(null);
  const [confirmingRule, setConfirmingRule] = useState<RouteRewriteRule | null>(null);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>重构路由管理</h2>
          <p className="page-subtitle">维护接口路由的重构指向</p>
        </div>
        <div className="page-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditingRule(null);
              setModalOpen(true);
            }}
          >
            新增规则
          </button>
          <button className="text-button" type="button" onClick={refresh}>
            刷新
          </button>
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="table-cell">路由</div>
          <div className="table-cell">方法</div>
          <div className="table-cell">原始接口域名</div>
          <div className="table-cell">重构指向接口域名</div>
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
                <div className="table-cell">{rule.route}</div>
                <div className="table-cell">
                  <span className="method-chip">{rule.method}</span>
                </div>
                <div className="table-cell">{rule.sourceDomain}</div>
                <div className="table-cell">{rule.targetDomain}</div>
                <div className="table-cell table-actions">
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
            <RouteRewriteForm
              mode={editingRule ? "edit" : "create"}
              initial={editingRule}
              onCancel={() => setModalOpen(false)}
              onSubmit={async (values) => {
                if (editingRule) {
                  await update(editingRule.id, {
                    route: values.route,
                    method: values.method,
                    source_domain: values.sourceDomain,
                    target_domain: values.targetDomain,
                  });
                } else {
                  await create({
                    route: values.route,
                    method: values.method,
                    source_domain: values.sourceDomain,
                    target_domain: values.targetDomain,
                  });
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
                确定要删除路由 <strong>{confirmingRule.route}</strong> 吗？
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
