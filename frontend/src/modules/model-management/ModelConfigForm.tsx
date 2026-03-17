import { useMemo, useState } from "react";
import type { ModelConfig } from "./types";

export type FormValues = {
  baseUrl: string;
  apiKey: string;
  siteDescription: string;
  models: string[];
};

type ModelConfigFormProps = {
  mode: "create" | "edit";
  initial?: ModelConfig | null;
  onCancel: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
};

const isValidUrl = (value: string) => {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

export default function ModelConfigForm({
  mode,
  initial,
  onCancel,
  onSubmit,
}: ModelConfigFormProps) {
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [siteDescription, setSiteDescription] = useState(initial?.siteDescription ?? "");
  const [models, setModels] = useState<string[]>(
    initial?.models?.length ? [...initial.models] : [""]
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!baseUrl.trim() || !apiKey.trim() || !siteDescription.trim()) return false;
    const filled = models.filter((m) => m.trim());
    return filled.length > 0;
  }, [baseUrl, apiKey, siteDescription, models]);

  const validate = (): string | null => {
    if (!baseUrl.trim()) return "Base URL 不能为空";
    if (!isValidUrl(baseUrl.trim())) return "Base URL 格式不正确";
    if (!apiKey.trim()) return "API Key 不能为空";
    if (!siteDescription.trim()) return "站点描述不能为空";
    const filled = models.filter((m) => m.trim());
    if (filled.length === 0) return "至少填写一个模型";
    return null;
  };

  const addModel = () => setModels((prev) => [...prev, ""]);
  const removeModel = (index: number) =>
    setModels((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  const setModelAt = (index: number, value: string) =>
    setModels((prev) => prev.map((m, i) => (i === index ? value : m)));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = validate();
    if (message) {
      setError(message);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const toSubmit = models.map((m) => m.trim()).filter(Boolean);
      await onSubmit({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        siteDescription: siteDescription.trim(),
        models: toSubmit,
      });
    } catch (err) {
      setError((err as Error).message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="modal-body" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="form-field">
          <span>Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="form-hint">示例：https://api.openai.com</small>
        </label>
        <label className="form-field">
          <span>站点描述</span>
          <input
            value={siteDescription}
            onChange={(e) => setSiteDescription(e.target.value)}
            placeholder="如：OpenAI 官方、自建代理"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="form-hint">便于区分不同接入来源</small>
        </label>
        <label className="form-field form-field-full">
          <span>Models（可配置多个）</span>
          {models.map((m, index) => (
            <div key={index} className="form-row-with-action">
              <input
                value={m}
                onChange={(e) => setModelAt(index, e.target.value)}
                placeholder="gpt-4.1"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="text-button danger"
                onClick={() => removeModel(index)}
                disabled={models.length <= 1}
                title="移除"
              >
                移除
              </button>
            </div>
          ))}
          <button type="button" className="text-button" onClick={addModel}>
            + 添加模型
          </button>
          <small className="form-hint">示例：gpt-4.1、claude-opus-4-6</small>
        </label>
        <label className="form-field">
          <span>API Key</span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="form-hint">明文保存，仅本地开发使用</small>
        </label>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="modal-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          取消
        </button>
        <button className="primary-button" type="submit" disabled={!canSubmit || submitting}>
          {mode === "create" ? "创建" : "保存"}
        </button>
      </div>
    </form>
  );
}
