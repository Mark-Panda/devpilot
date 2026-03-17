import { useState } from "react";
import ModelConfigForm, { type FormValues } from "./ModelConfigForm";
import type { ModelConfig } from "./types";
import { useModelConfigs } from "./useModelConfigs";

export default function ModelManagementPage() {
  const { configs, loading, error, refresh, create, update, remove } = useModelConfigs();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null);
  const [confirmingConfig, setConfirmingConfig] = useState<ModelConfig | null>(null);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>模型管理</h2>
          <p className="page-subtitle">管理模型接入配置</p>
        </div>
        <div className="page-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditingConfig(null);
              setModalOpen(true);
            }}
          >
            新增配置
          </button>
          <button className="text-button" type="button" onClick={refresh}>
            刷新
          </button>
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="table-cell">Base URL</div>
          <div className="table-cell">站点描述</div>
          <div className="table-cell">Models</div>
          <div className="table-cell">API Key</div>
          <div className="table-cell">操作</div>
        </div>
        {loading ? (
          <div className="table-empty">加载中...</div>
        ) : configs.length === 0 ? (
          <div className="table-empty">暂无数据</div>
        ) : (
          <div className="table-body">
            {configs.map((config) => (
              <div className="table-row" key={config.id}>
                <div className="table-cell">{config.baseUrl}</div>
                <div className="table-cell">{config.siteDescription || "—"}</div>
                <div className="table-cell">
                  {config.models.length
                    ? config.models.join(", ")
                    : "—"}
                </div>
                <div className="table-cell">{config.apiKey}</div>
                <div className="table-cell table-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setEditingConfig(config);
                      setModalOpen(true);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => setConfirmingConfig(config)}
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
              <h3>{editingConfig ? "编辑配置" : "新增配置"}</h3>
              <button
                className="text-button"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                关闭
              </button>
            </div>
            <ModelConfigForm
              mode={editingConfig ? "edit" : "create"}
              initial={editingConfig}
              onCancel={() => setModalOpen(false)}
              onSubmit={async (values: FormValues) => {
                if (editingConfig) {
                  await update(editingConfig.id, values);
                } else {
                  await create(values);
                }
                setModalOpen(false);
                setEditingConfig(null);
                await refresh();
              }}
            />
          </div>
        </div>
      ) : null}

      {confirmingConfig ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmingConfig(null)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>确认删除</h3>
              <button
                className="text-button"
                type="button"
                onClick={() => setConfirmingConfig(null)}
              >
                关闭
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                确定要删除该配置吗？
                {confirmingConfig.siteDescription && (
                  <>（{confirmingConfig.siteDescription}）</>
                )}
              </p>
            </div>
            <div className="modal-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setConfirmingConfig(null)}
              >
                取消
              </button>
              <button
                className="primary-button danger"
                type="button"
                onClick={async () => {
                  await remove(confirmingConfig.id);
                  setConfirmingConfig(null);
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
