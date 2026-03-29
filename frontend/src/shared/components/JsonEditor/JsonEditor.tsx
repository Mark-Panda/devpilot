import { useRef, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  minHeight?: number;
  readOnly?: boolean;
  /** 可选：右侧展示「格式化」按钮，点击后对内容执行 JSON 格式化 */
  showFormatButton?: boolean;
  /** 展示「放大编辑」：在弹窗中以更大区域编辑（只读时用于查看与复制） */
  showExpandButton?: boolean;
  /** 展示「复制」：将当前编辑器内容写入剪贴板 */
  showCopyButton?: boolean;
  /** 放大弹窗标题 */
  expandTitle?: string;
  onFormatError?: (message: string) => void;
  className?: string;
};

const MONACO_JSON_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  lineNumbers: "on",
  lineNumbersMinChars: 3,
  scrollBeyondLastLine: false,
  wordWrap: "on",
  automaticLayout: true,
  fixedOverflowWidgets: true,
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: false,
  formatOnPaste: true,
  formatOnType: false,
  suggest: { showWords: false },
  quickSuggestions: false,
  folding: true,
  bracketPairColorization: { enabled: true },
  padding: { top: 8, bottom: 8 },
};

/**
 * 基于 Monaco Editor 的 JSON 表单框，原生支持 JSON 语法高亮、括号匹配与错误提示。
 * 不改变用户输入大小写等，用户输入什么即是什么。
 */
export function JsonEditor({
  value,
  onChange,
  height = 120,
  minHeight = 80,
  readOnly = false,
  showFormatButton = false,
  showExpandButton = false,
  showCopyButton = false,
  expandTitle = "JSON",
  onFormatError,
  className,
}: JsonEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const expandEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const [expandOpen, setExpandOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!expandOpen) expandEditorRef.current = null;
  }, [expandOpen]);

  const handleEditorMount: OnMount = useCallback((editorInstance) => {
    editorRef.current = editorInstance;
    resizeObsRef.current?.disconnect();
    const el = rootRef.current;
    if (el) {
      const ro = new ResizeObserver(() => {
        editorInstance.layout();
      });
      ro.observe(el);
      resizeObsRef.current = ro;
    }
    requestAnimationFrame(() => editorInstance.layout());
  }, []);

  const formatFromString = useCallback(
    (text: string) => {
      try {
        const trimmed = text.trim();
        if (!trimmed) {
          onChange("{}");
          return;
        }
        const parsed = JSON.parse(trimmed);
        const formatted = JSON.stringify(parsed, null, 2);
        onChange(formatted);
      } catch (err) {
        onFormatError?.((err as Error).message ?? "不是合法 JSON，无法格式化");
      }
    },
    [onChange, onFormatError]
  );

  const handleFormat = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;
    formatFromString(model.getValue());
  }, [formatFromString]);

  const handleFormatExpanded = useCallback(() => {
    formatFromString(String(value ?? ""));
  }, [value, formatFromString]);

  const getMainEditorText = useCallback(() => {
    const m = editorRef.current?.getModel();
    if (m) return m.getValue();
    return String(value ?? "");
  }, [value]);

  const handleCopy = useCallback(async () => {
    const text = getMainEditorText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("已复制");
    } catch {
      setCopyFeedback("复制失败");
    }
    window.setTimeout(() => setCopyFeedback(null), 2000);
  }, [getMainEditorText]);

  const handleCopyExpanded = useCallback(async () => {
    const m = expandEditorRef.current?.getModel();
    const text = m ? m.getValue() : String(value ?? "");
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("已复制");
    } catch {
      setCopyFeedback("复制失败");
    }
    window.setTimeout(() => setCopyFeedback(null), 2000);
  }, [value]);

  const showToolbar = showFormatButton || showExpandButton || showCopyButton;

  const expandModal =
    expandOpen &&
    createPortal(
      <div
        className="modal-overlay json-editor-expand-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={expandTitle}
        onClick={() => setExpandOpen(false)}
      >
        <div
          className="modal json-editor-expand-modal"
          style={{ width: "min(920px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header" style={{ paddingBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
            <h3 style={{ flex: 1, margin: 0 }}>{expandTitle}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {showCopyButton ? (
                <button type="button" className="text-button" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => void handleCopyExpanded()}>
                  复制
                </button>
              ) : null}
              {copyFeedback ? (
                <span className="form-hint" style={{ fontSize: 12 }} role="status">
                  {copyFeedback}
                </span>
              ) : null}
              <button type="button" className="text-button" onClick={() => setExpandOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
          </div>
          <div className="modal-body" style={{ flex: 1, minHeight: 0, paddingTop: 0 }}>
            {showFormatButton && !readOnly ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button type="button" className="text-button" style={{ padding: "4px 10px", fontSize: 12 }} onClick={handleFormatExpanded}>
                  格式化
                </button>
              </div>
            ) : null}
            <Editor
              height="65vh"
              defaultLanguage="json"
              value={value}
              onChange={readOnly ? undefined : (v) => onChange(v ?? "")}
              loading={null}
              readOnly={readOnly}
              options={MONACO_JSON_OPTIONS}
              onMount={(ed) => {
                expandEditorRef.current = ed;
                requestAnimationFrame(() => ed.layout());
              }}
              style={{
                border: "1px solid var(--color-border, #e2e8f0)",
                borderRadius: 8,
              }}
            />
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div ref={rootRef} className={[`json-editor-root`, className].filter(Boolean).join(" ")}>
      {showToolbar ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {showExpandButton ? (
              <button
                type="button"
                className="text-button"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => setExpandOpen(true)}
              >
                放大编辑
              </button>
            ) : null}
            {showCopyButton ? (
              <button
                type="button"
                className="text-button"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => void handleCopy()}
              >
                复制
              </button>
            ) : null}
            {copyFeedback && !expandOpen ? (
              <span className="form-hint" style={{ fontSize: 12 }} role="status">
                {copyFeedback}
              </span>
            ) : null}
          </div>
          <div>
            {showFormatButton ? (
              <button type="button" className="text-button" style={{ padding: "4px 10px", fontSize: 12 }} onClick={handleFormat}>
                格式化
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <Editor
        height={height}
        defaultLanguage="json"
        value={value}
        onChange={readOnly ? undefined : (v) => onChange(v ?? "")}
        onMount={handleEditorMount}
        loading={null}
        readOnly={readOnly}
        options={MONACO_JSON_OPTIONS}
        style={{
          minHeight: typeof minHeight === "number" ? minHeight : undefined,
          border: "1px solid var(--color-border, #e2e8f0)",
          borderRadius: 8,
        }}
      />
      {expandModal}
    </div>
  );
}
