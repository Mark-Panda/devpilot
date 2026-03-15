import { useEffect, useMemo, useState } from "react";
import type { RuleGoRule } from "./types";

type FormValues = {
  name: string;
  description: string;
  enabled: boolean;
  definition: string;
  editorJson: string;
};

type RuleGoFormProps = {
  mode: "create" | "edit";
  initial?: RuleGoRule | null;
  onCancel: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
  showEditorJson?: boolean;
};

export default function RuleGoForm({
  mode,
  initial,
  onCancel,
  onSubmit,
  showEditorJson = true,
}: RuleGoFormProps) {
  const [values, setValues] = useState<FormValues>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    enabled: initial?.enabled ?? true,
    definition: initial?.definition ?? "",
    editorJson: initial?.editorJson ?? "",
  });

  useEffect(() => {
    setValues({
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      enabled: initial?.enabled ?? true,
      definition: initial?.definition ?? "",
      editorJson: initial?.editorJson ?? "",
    });
  }, [initial]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!values.name.trim()) return false;
    if (!values.definition.trim()) return false;
    if (showEditorJson && !values.editorJson.trim()) return false;
    return true;
  }, [showEditorJson, values]);

  const validate = () => {
    if (!values.name.trim()) return "规则名称不能为空";
    if (!values.definition.trim()) return "规则定义不能为空";
    if (showEditorJson && !values.editorJson.trim()) return "编辑器 JSON 不能为空";
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
        name: values.name.trim(),
        description: values.description.trim(),
        enabled: values.enabled,
        definition: values.definition.trim(),
        editorJson: values.editorJson.trim(),
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
          <span>规则名称</span>
          <input
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            placeholder="RuleGo 规则名称"
          />
          <small className="form-hint">示例：订单审批规则</small>
        </label>
        <label className="form-field">
          <span>规则描述</span>
          <input
            value={values.description}
            onChange={(event) => setValues({ ...values, description: event.target.value })}
            placeholder="规则用途说明"
          />
          <small className="form-hint">用于说明该规则的使用场景</small>
        </label>
        <label className="form-field">
          <span>规则定义</span>
          <textarea
            value={values.definition}
            onChange={(event) => setValues({ ...values, definition: event.target.value })}
            placeholder="JSON / DSL"
            rows={6}
          />
          <small className="form-hint">保存为 RuleGo DSL</small>
        </label>
        {showEditorJson ? (
          <label className="form-field">
            <span>编辑器 JSON</span>
            <textarea
              value={values.editorJson}
              onChange={(event) => setValues({ ...values, editorJson: event.target.value })}
              placeholder="Scratch JSON"
              rows={6}
            />
            <small className="form-hint">保存 Scratch workspace JSON</small>
          </label>
        ) : null}
        <label className="form-field">
          <span>是否启用</span>
          <select
            value={values.enabled ? "true" : "false"}
            onChange={(event) =>
              setValues({ ...values, enabled: event.target.value === "true" })
            }
          >
            <option value="true">启用</option>
            <option value="false">停用</option>
          </select>
          <small className="form-hint">控制规则是否生效</small>
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
