import { useEffect, useMemo, useState } from "react";
import type { RuleGoRule } from "./types";

/** 从 DSL definition JSON 中解析 ruleChain.debugMode / ruleChain.root */
function parseRuleChainFlags(definition: string): { debugMode: boolean; root: boolean } {
  try {
    const parsed = JSON.parse(definition);
    const chain = parsed?.ruleChain;
    return {
      debugMode: Boolean(chain?.debugMode),
      root: chain?.root !== false,
    };
  } catch {
    return { debugMode: false, root: true };
  }
}

/** 将 debugMode/root 写回 definition JSON（用于表单编辑同步到 DSL） */
function mergeRuleChainFlags(
  definition: string,
  debugMode: boolean,
  root: boolean
): string {
  try {
    const parsed = JSON.parse(definition);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (!parsed.ruleChain) parsed.ruleChain = {};
      parsed.ruleChain.debugMode = debugMode;
      parsed.ruleChain.root = root;
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // ignore
  }
  return definition;
}

type FormValues = {
  name: string;
  description: string;
  enabled: boolean;
  definition: string;
  editorJson: string;
  debugMode: boolean;
  root: boolean;
};

type RuleGoFormProps = {
  mode: "create" | "edit";
  initial?: RuleGoRule | null;
  onCancel: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
  /** 是否展示编辑器 JSON 字段 */
  showEditorJson?: boolean;
  /** 是否展示规则定义（DSL）字段，表单编辑时可设为 false，仅改名称/描述/启用状态 */
  showDefinition?: boolean;
};

export default function RuleGoForm({
  mode,
  initial,
  onCancel,
  onSubmit,
  showEditorJson = true,
  showDefinition = true,
}: RuleGoFormProps) {
  const [values, setValues] = useState<FormValues>(() => {
    const def = initial?.definition ?? "";
    const flags = def ? parseRuleChainFlags(def) : { debugMode: false, root: true };
    return {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      enabled: initial?.enabled ?? true,
      definition: initial?.definition ?? "",
      editorJson: initial?.editorJson ?? "",
      debugMode: flags.debugMode,
      root: flags.root,
    };
  });

  useEffect(() => {
    const def = initial?.definition ?? "";
    const flags = def ? parseRuleChainFlags(def) : { debugMode: false, root: true };
    setValues({
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      enabled: initial?.enabled ?? true,
      definition: initial?.definition ?? "",
      editorJson: initial?.editorJson ?? "",
      debugMode: flags.debugMode,
      root: flags.root,
    });
  }, [initial]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!values.name.trim()) return false;
    if (showDefinition && !values.definition.trim()) return false;
    if (showEditorJson && !values.editorJson.trim()) return false;
    return true;
  }, [showEditorJson, showDefinition, values]);

  const validate = () => {
    if (!values.name.trim()) return "规则名称不能为空";
    if (showDefinition && !values.definition.trim()) return "规则定义不能为空";
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
    let definitionOut = showDefinition ? values.definition.trim() : (initial?.definition ?? "");
    if (!showDefinition && initial?.definition && definitionOut) {
      definitionOut = mergeRuleChainFlags(definitionOut, values.debugMode, values.root);
    }
    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      enabled: values.enabled,
      definition: definitionOut,
      editorJson: showEditorJson ? values.editorJson.trim() : (initial?.editorJson ?? ""),
    };
    try {
      await onSubmit(payload);
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
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
          />
          <small className="form-hint">示例：订单审批规则</small>
        </label>
        <label className="form-field">
          <span>规则描述</span>
          <input
            value={values.description}
            onChange={(event) => setValues({ ...values, description: event.target.value })}
            placeholder="规则用途说明"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
          />
          <small className="form-hint">用于说明该规则的使用场景</small>
        </label>
        {showDefinition ? (
          <label className="form-field">
            <span>规则定义</span>
            <textarea
              value={values.definition}
              onChange={(event) => setValues({ ...values, definition: event.target.value })}
              placeholder="JSON / DSL"
              rows={6}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
            <small className="form-hint">保存为 RuleGo DSL</small>
          </label>
        ) : null}
        {showEditorJson ? (
          <label className="form-field">
            <span>编辑器 JSON</span>
            <textarea
              value={values.editorJson}
              onChange={(event) => setValues({ ...values, editorJson: event.target.value })}
              placeholder="Scratch JSON"
              rows={6}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
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
        {initial?.definition ? (
          <>
            <label className="form-field form-field-checkbox">
              <input
                type="checkbox"
                checked={values.debugMode}
                onChange={(e) => setValues({ ...values, debugMode: e.target.checked })}
              />
              <span>调试</span>
              <small className="form-hint">与 DSL ruleChain.debugMode 一致，保存时同步到规则定义</small>
            </label>
            <label className="form-field form-field-checkbox">
              <input
                type="checkbox"
                checked={values.root}
                onChange={(e) => setValues({ ...values, root: e.target.checked })}
              />
              <span>是否根规则链</span>
              <small className="form-hint">与 DSL ruleChain.root 一致，保存时同步到规则定义</small>
            </label>
          </>
        ) : null}
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
