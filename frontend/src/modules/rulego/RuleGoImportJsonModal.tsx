import { useEffect, useRef, useState } from "react";
import { getRuleChainNameFromDefinition } from "./dslUtils";
import { buildRuleDefinitionFromImport } from "./rulegoImportJsonUtils";

export type RuleGoImportJsonModalProps = {
  open: boolean;
  onClose: () => void;
  /** 持久化新规则并返回 id */
  onCreate: (definition: string) => Promise<{ id: string }>;
  /** 勾选「打开编辑器」时跳转 */
  navigateToEditor?: (ruleId: string) => void;
  /** 未跳转编辑器时的列表提示（可选） */
  onNotify?: (message: string) => void;
};

export default function RuleGoImportJsonModal({
  open,
  onClose,
  onCreate,
  navigateToEditor,
  onNotify,
}: RuleGoImportJsonModalProps) {
  const [jsonText, setJsonText] = useState("");
  const [nameFallback, setNameFallback] = useState("");
  const [openEditorAfter, setOpenEditorAfter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setJsonText("");
      setNameFallback("");
      setOpenEditorAfter(true);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setJsonText(String(reader.result ?? ""));
      setError(null);
    };
    reader.onerror = () => setError("读取文件失败");
    reader.readAsText(f, "UTF-8");
    e.target.value = "";
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const definition = buildRuleDefinitionFromImport(jsonText, {
        nameFallback: nameFallback.trim() || undefined,
      });
      const { id } = await onCreate(definition);
      const label = getRuleChainNameFromDefinition(definition) || id;
      onClose();
      if (openEditorAfter && navigateToEditor && id) {
        navigateToEditor(id);
      } else {
        onNotify?.(`已创建规则「${label}」`);
      }
    } catch (err) {
      setError((err as Error).message || "导入失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const previewName = (() => {
    if (!jsonText.trim()) return "—";
    try {
      const def = buildRuleDefinitionFromImport(jsonText, {
        nameFallback: nameFallback.trim() || undefined,
      });
      return getRuleChainNameFromDefinition(def) || "（解析后可见）";
    } catch {
      return "—";
    }
  })();

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rulego-import-json-title"
      onClick={onClose}
    >
      <div
        className="modal"
        style={{ maxWidth: 720 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="rulego-import-json-title">导入规则链</h3>
          <button type="button" className="text-button" onClick={onClose} aria-label="关闭">
            关闭
          </button>
        </div>
        <div className="modal-body">
          <p className="form-hint" style={{ marginBottom: 10, lineHeight: 1.55 }}>
            粘贴完整规则链 DSL（含 <code>ruleChain</code> 与 <code>metadata</code>），或选择{" "}
            <code>.json</code> 文件。将创建一条新规则（新 ID），与「新增规则」写入方式相同。
          </p>
          <label className="form-field" style={{ marginBottom: 12 }}>
            <span>规则名称（可选，仅当 JSON 内无 ruleChain.name 时使用）</span>
            <input
              value={nameFallback}
              onChange={(e) => {
                setNameFallback(e.target.value);
                if (error) setError(null);
              }}
              placeholder="例如：从文件导入的规则"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          {error ? (
            <div className="form-error" style={{ marginBottom: 8 }} role="alert">
              {error}
            </div>
          ) : null}
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              if (error) setError(null);
            }}
            rows={16}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
            placeholder='{"ruleChain":{"name":"…",...},"metadata":{...}}'
            spellCheck={false}
            aria-label="规则链 JSON"
          />
          <label className="form-field" style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={openEditorAfter}
              onChange={(e) => setOpenEditorAfter(e.target.checked)}
            />
            <span>创建成功后打开可视化编辑器</span>
          </label>
          <p className="form-hint" style={{ marginTop: 8 }}>
            解析后名称预览：<strong>{previewName}</strong>
          </p>
        </div>
        <div className="modal-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            aria-hidden
            onChange={handleFile}
          />
          <button type="button" className="text-button" onClick={() => fileRef.current?.click()}>
            选择 JSON 文件
          </button>
          <button type="button" className="text-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={submitting || !jsonText.trim()}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "创建中…" : "创建规则链"}
          </button>
        </div>
      </div>
    </div>
  );
}
