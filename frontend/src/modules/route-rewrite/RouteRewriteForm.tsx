import { useMemo, useState } from "react";
import type { HttpMethod, RouteRewriteRule } from "./types";

type FormValues = {
  route: string;
  method: HttpMethod;
  sourceDomain: string;
  targetDomain: string;
};

type RouteRewriteFormProps = {
  mode: "create" | "edit";
  initial?: RouteRewriteRule | null;
  onCancel: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
};

const methodOptions: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
];

const isValidRoute = (value: string) => value.startsWith("/");

const isValidDomain = (value: string) => {
  try {
    const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
    return Boolean(url.hostname);
  } catch {
    return false;
  }
};

export default function RouteRewriteForm({
  mode,
  initial,
  onCancel,
  onSubmit,
}: RouteRewriteFormProps) {
  const [values, setValues] = useState<FormValues>({
    route: initial?.route ?? "",
    method: initial?.method ?? "GET",
    sourceDomain: initial?.sourceDomain ?? "",
    targetDomain: initial?.targetDomain ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!values.route.trim()) return false;
    if (!values.method) return false;
    if (!values.sourceDomain.trim()) return false;
    if (!values.targetDomain.trim()) return false;
    return true;
  }, [values]);

  const validate = () => {
    if (!values.route.trim()) return "路由不能为空";
    if (!isValidRoute(values.route.trim())) return "路由必须以 / 开头";
    if (!values.method || !methodOptions.includes(values.method)) return "方法无效";
    if (!values.sourceDomain.trim()) return "原始接口域名不能为空";
    if (!isValidDomain(values.sourceDomain.trim())) return "原始接口域名格式不正确";
    if (!values.targetDomain.trim()) return "重构指向域名不能为空";
    if (!isValidDomain(values.targetDomain.trim())) return "重构指向域名格式不正确";
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
        route: values.route.trim(),
        method: values.method,
        sourceDomain: values.sourceDomain.trim(),
        targetDomain: values.targetDomain.trim(),
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
          <span>路由</span>
          <input
            value={values.route}
            onChange={(event) => setValues({ ...values, route: event.target.value })}
            placeholder="/api/v1/example"
          />
          <small className="form-hint">示例：/api/v1/users</small>
        </label>
        <label className="form-field">
          <span>方法</span>
          <select
            value={values.method}
            onChange={(event) =>
              setValues({ ...values, method: event.target.value as HttpMethod })
            }
          >
            {methodOptions.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
          <small className="form-hint">支持常见 HTTP 方法</small>
        </label>
        <label className="form-field">
          <span>原始接口域名</span>
          <input
            value={values.sourceDomain}
            onChange={(event) =>
              setValues({ ...values, sourceDomain: event.target.value })
            }
            placeholder="api.origin.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="form-hint">示例：api.origin.com 或 https://api.origin.com</small>
        </label>
        <label className="form-field">
          <span>重构指向接口域名</span>
          <input
            value={values.targetDomain}
            onChange={(event) =>
              setValues({ ...values, targetDomain: event.target.value })
            }
            placeholder="api.new.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="form-hint">示例：api.new.com 或 https://api.new.com</small>
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
