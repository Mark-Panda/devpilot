import { useEffect, useMemo, useRef, useState } from "react";
import { mergeDevPilotIntoDefinitionString, parseDevPilotFromDefinition } from "./devpilotDsl";
import { getEnabledFromDefinition, getRuleChainNameFromDefinition, mergeRuleChainName } from "./dslUtils";
import RuleChainRequestParamsEditor from "./RuleChainRequestParamsEditor";
import { emptyRuleChainParamsJson } from "./ruleChainRequestParams";
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

/** 将 debugMode/root/enabled 写回 definition JSON（用于表单编辑同步到 DSL 的 ruleChain 状态） */
function mergeRuleChainFlags(
  definition: string,
  debugMode: boolean,
  root: boolean,
  enabled?: boolean
): string {
  try {
    const parsed = JSON.parse(definition);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (!parsed.ruleChain) parsed.ruleChain = {};
      parsed.ruleChain.debugMode = debugMode;
      parsed.ruleChain.root = root;
      if (enabled !== undefined) parsed.ruleChain.disabled = !enabled;
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
  requestMetadataParamsJson: string;
  requestMessageBodyParamsJson: string;
  responseMessageBodyParamsJson: string;
  debugMode: boolean;
  root: boolean;
};

type RuleGoFormProps = {
  mode: "create" | "edit";
  initial?: RuleGoRule | null;
  onCancel: () => void;
  onSubmit: (payload: { definition: string }) => Promise<void>;
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
  const hydrateFromDefinition = (def: string): FormValues => {
    const flags = def ? parseRuleChainFlags(def) : { debugMode: false, root: true };
    const dp = parseDevPilotFromDefinition(def);
    return {
      name: getRuleChainNameFromDefinition(def),
      description: dp?.description ?? "",
      enabled: def ? getEnabledFromDefinition(def) : true,
      definition: def,
      editorJson: dp?.editorJson ?? "",
      requestMetadataParamsJson: dp?.requestMetadataParamsJson?.trim() || emptyRuleChainParamsJson(),
      requestMessageBodyParamsJson: dp?.requestMessageBodyParamsJson?.trim() || emptyRuleChainParamsJson(),
      responseMessageBodyParamsJson: dp?.responseMessageBodyParamsJson?.trim() || emptyRuleChainParamsJson(),
      debugMode: flags.debugMode,
      root: flags.root,
    };
  };

  const [values, setValues] = useState<FormValues>(() => hydrateFromDefinition(initial?.definition ?? ""));

  useEffect(() => {
    setValues(hydrateFromDefinition(initial?.definition ?? ""));
  }, [initial]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
    if (submittingRef.current) return;
    const message = validate();
    if (message) {
      setError(message);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    let definitionOut = showDefinition ? values.definition.trim() : (initial?.definition ?? "");
    if (definitionOut) {
      definitionOut = mergeRuleChainFlags(
        definitionOut,
        values.debugMode,
        values.root,
        values.enabled
      );
      definitionOut = mergeRuleChainName(definitionOut, values.name);
      const editorForDevPilot = showEditorJson
        ? values.editorJson.trim()
        : parseDevPilotFromDefinition(initial?.definition ?? "")?.editorJson?.trim() ?? "";
      const skillKeep =
        parseDevPilotFromDefinition(initial?.definition ?? "")?.skillDirName?.trim() ?? "";
      definitionOut = mergeDevPilotIntoDefinitionString(definitionOut, {
        description: values.description.trim(),
        requestMetadataParamsJson: values.requestMetadataParamsJson.trim(),
        requestMessageBodyParamsJson: values.requestMessageBodyParamsJson.trim(),
        responseMessageBodyParamsJson: values.responseMessageBodyParamsJson.trim(),
        editorScratchJson: editorForDevPilot,
        skillDirName: skillKeep,
      });
    }
    try {
      await onSubmit({ definition: definitionOut });
    } catch (err) {
      setError((err as Error).message || "提交失败");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form className="modal-body modal-body-form" onSubmit={handleSubmit}>
      <div className="modal-body-scroll">
        <div className="form-grid">
        <label className="form-field">
          <span>规则名称</span>
          <input
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            placeholder="规则名称"
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
        <div className="form-field form-field-full">
          <span>规则链请求参数 — 元数据</span>
          <RuleChainRequestParamsEditor
            title="元数据（metadata）"
            value={values.requestMetadataParamsJson}
            onChange={(json) => setValues({ ...values, requestMetadataParamsJson: json })}
          />
          <small className="form-hint">
            对应执行时的 metadata；生成技能时会与说明一并写入技能 description
          </small>
        </div>
        <div className="form-field form-field-full">
          <span>规则链请求参数 — 消息体</span>
          <RuleChainRequestParamsEditor
            title="消息体（data）"
            value={values.requestMessageBodyParamsJson}
            onChange={(json) => setValues({ ...values, requestMessageBodyParamsJson: json })}
          />
          <small className="form-hint">
            对应执行时的 data 载荷字段说明；可与元数据配合描述入参
          </small>
        </div>
        <div className="form-field form-field-full">
          <span>规则链响应参数 — 消息体（JSON 结构说明）</span>
          <RuleChainRequestParamsEditor
            title="响应消息体（输出 data）"
            value={values.responseMessageBodyParamsJson}
            onChange={(json) => setValues({ ...values, responseMessageBodyParamsJson: json })}
          />
          <small className="form-hint">
            与请求体使用同一套参数表格式，描述规则链成功执行后输出消息体（data）的字段含义；供文档与生成技能时写入 description，不参与执行时校验
          </small>
        </div>
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
            <small className="form-hint">保存为规则链 DSL</small>
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
          <button
            type="button"
            role="switch"
            aria-checked={values.enabled}
            aria-label={values.enabled ? "已启用" : "已停用"}
            className="rulego-enable-switch"
            onClick={() => setValues({ ...values, enabled: !values.enabled })}
          >
            <span className="rulego-enable-switch-thumb" aria-hidden />
          </button>
          <small className="form-hint">控制规则是否生效</small>
        </label>
        {initial?.definition ? (
          <label className="form-field">
            <span>是否根规则链</span>
            <button
              type="button"
              role="switch"
              aria-checked={values.root}
              aria-label={values.root ? "根规则链" : "子规则链"}
              className="rulego-enable-switch"
              onClick={() => setValues({ ...values, root: !values.root })}
            >
              <span className="rulego-enable-switch-thumb" aria-hidden />
            </button>
            <small className="form-hint">与 DSL ruleChain.root 一致，保存时同步到规则定义</small>
          </label>
        ) : null}
        </div>
      </div>

      {error ? <div className="form-error rulego-form-error-below-scroll">{error}</div> : null}

      <div className="modal-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          取消
        </button>
        <button className="primary-button" type="submit" disabled={!canSubmit || submitting}>
          {submitting ? (mode === "create" ? "创建中…" : "保存中…") : mode === "create" ? "创建" : "保存"}
        </button>
      </div>
    </form>
  );
}
