import { useRef, useCallback, useState } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

const JS_EDITOR_THEME = "js-editor-light";

function defineJsEditorTheme(monaco: typeof import("monaco-editor")) {
  monaco.editor.defineTheme(JS_EDITOR_THEME, {
    base: "vs",
    inherit: false,
    rules: [
      { token: "", foreground: "1e293b" },
      { token: "keyword", foreground: "0f172a", fontStyle: "bold" },
      { token: "keyword.control", foreground: "0f172a", fontStyle: "bold" },
      { token: "keyword.operator", foreground: "0f172a", fontStyle: "bold" },
      { token: "string", foreground: "b91c1c" },
      { token: "string.quoted", foreground: "b91c1c" },
      { token: "comment", foreground: "15803d", fontStyle: "italic" },
      { token: "number", foreground: "0d9488" },
      { token: "identifier", foreground: "1e293b" },
      { token: "delimiter", foreground: "1e293b" },
      { token: "operator", foreground: "1e293b" },
      { token: "variable", foreground: "1e40af" },
      { token: "type", foreground: "7c3aed" },
      { token: "regexp", foreground: "c2410c" },
    ],
    colors: {
      "editor.foreground": "#1e293b",
      "editor.background": "#ffffff",
      "editorLineNumber.foreground": "#64748b",
      "editorLineNumber.activeForeground": "#0f172a",
    },
  });
}

const beforeMount: BeforeMount = (monaco) => {
  defineJsEditorTheme(monaco);
};

const EDITOR_FONT_SIZE = 15;
const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  lineNumbers: "on" as const,
  lineNumbersMinChars: 3,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  automaticLayout: true,
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: true,
  formatOnPaste: true,
  formatOnType: false,
  suggest: { showKeywords: true, showSnippets: true, showFunctions: true, showVariables: true },
  quickSuggestions: { other: true, comments: false, strings: true },
  folding: true,
  bracketPairColorization: { enabled: true },
  padding: { top: 8, bottom: 8 },
  fontSize: EDITOR_FONT_SIZE,
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
  fontWeight: "500",
};

type JsEditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  minHeight?: number;
  readOnly?: boolean;
  /** 是否显示“格式化”按钮 */
  showFormatButton?: boolean;
  /** 是否显示“放大”按钮，点击后在弹窗中全屏编辑 */
  showExpandButton?: boolean;
  className?: string;
};

/**
 * 基于 Monaco Editor 的 JavaScript 脚本输入框，原生支持语法高亮、括号匹配、缩进与基础补全。
 * 用于 jsFilter / jsTransform / jsSwitch 等脚本配置。
 */
export function JsEditor({
  value,
  onChange,
  height = 220,
  minHeight = 120,
  readOnly = false,
  showFormatButton = false,
  showExpandButton = true,
  className,
}: JsEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleEditorMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance;
    defineJsEditorTheme(monaco);
    monaco.editor.setTheme(JS_EDITOR_THEME);
    editorInstance.getModel()?.detectIndentation(false, 2);
  }, []);

  const handleFormat = useCallback(() => {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }, []);

  const editorStyle: React.CSSProperties = {
    minHeight: typeof minHeight === "number" ? minHeight : undefined,
    border: "1px solid var(--color-border, #e2e8f0)",
    borderRadius: 8,
    color: "#1e293b",
    background: "#ffffff",
  };

  const renderEditor = (editorHeight: number | string, extraStyle?: React.CSSProperties) => (
    <Editor
      height={editorHeight}
      defaultLanguage="javascript"
      theme={JS_EDITOR_THEME}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      beforeMount={beforeMount}
      onMount={handleEditorMount}
      loading={null}
      readOnly={readOnly}
      options={EDITOR_OPTIONS}
      style={{ ...editorStyle, ...extraStyle }}
    />
  );

  const showToolbar = showFormatButton || showExpandButton;

  return (
    <div className={`js-editor-root ${className ?? ""}`.trim()} data-js-editor>
      {showToolbar && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 4 }}>
          {showFormatButton && (
            <button type="button" className="text-button" style={{ padding: "4px 10px", fontSize: 12 }} onClick={handleFormat}>
              格式化
            </button>
          )}
          {showExpandButton && (
            <button type="button" className="text-button" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setExpanded(true)}>
              放大
            </button>
          )}
        </div>
      )}
      {renderEditor(height)}

      {expanded && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setExpanded(false)}
        >
          <div
            style={{
              width: "90vw",
              maxWidth: 960,
              maxHeight: "85vh",
              background: "var(--color-bg, #fff)",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>
              <span style={{ fontWeight: 600 }}>脚本编辑（放大）</span>
              <button type="button" className="text-button" onClick={() => setExpanded(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
              {renderEditor("70vh", { minHeight: 320 })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
