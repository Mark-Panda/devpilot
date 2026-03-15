import { useMemo, useState } from "react";
import type { ModelConfig } from "./types";

type FormValues = {
  baseUrl: string;
  model: string;
  apiKey: string;
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
  const [values, setValues] = useState<FormValues>({
    baseUrl: initial?.baseUrl ?? "",
    model: initial?.model ?? "",
    apiKey: initial?.apiKey ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!values.baseUrl.trim()) return false;
    if (!values.model.trim()) return false;
    if (!values.apiKey.trim()) return false;
    return true;
  }, [values]);

  const validate = () => {
    if (!values.baseUrl.trim()) return "Base URL 不能为空";
    if (!isValidUrl(values.baseUrl.trim())) return "Base URL 格式不正确";
    if (!values.model.trim()) return "模型不能为空";
    if (!values.apiKey.trim()) return "API Key 不能为空";
    return null;
  };

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
      await onSubmit({
        baseUrl: values.baseUrl.trim(),
        model: values.model.trim(),
        apiKey: values.apiKey.trim(),
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
            value={values.baseUrl}
            onChange={(event) => setValues({ ...values, baseUrl: event.target.value })}
            placeholder="https://api.example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="form-hint">示例：https://api.openai.com</small>
        </label>
        <label className="form-field">
          <span>Model</span>
          <input
            value={values.model}
            onChange={(event) => setValues({ ...values, model: event.target.value })}
            placeholder="gpt-4.1"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="form-hint">示例：gpt-4.1 / claude-opus-4-6</small>
        </label>
        <label className="form-field">
          <span>API Key</span>
          <input
            value={values.apiKey}
            onChange={(event) => setValues({ ...values, apiKey: event.target.value })}
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
