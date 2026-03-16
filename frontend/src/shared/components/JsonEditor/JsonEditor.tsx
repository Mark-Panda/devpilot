import { useRef, useCallback } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  minHeight?: number;
  readOnly?: boolean;
  /** 可选：右侧展示“格式化”按钮，点击后对内容执行 JSON 格式化 */
  showFormatButton?: boolean;
  onFormatError?: (message: string) => void;
  className?: string;
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
  onFormatError,
  className,
}: JsonEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount: OnMount = useCallback((editorInstance) => {
    editorRef.current = editorInstance;
  }, []);

  const handleFormat = useCallback(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;
    try {
      const model = editorInstance.getModel();
      if (!model) return;
      const text = model.getValue();
      const trimmed = text.trim();
      if (!trimmed) {
        model.setValue("{}");
        onChange("{}");
        return;
      }
      const parsed = JSON.parse(trimmed);
      const formatted = JSON.stringify(parsed, null, 2);
      model.setValue(formatted);
      onChange(formatted);
    } catch (err) {
      onFormatError?.((err as Error).message ?? "不是合法 JSON，无法格式化");
    }
  }, [onChange, onFormatError]);

  return (
    <div className={className}>
      {showFormatButton && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
          <button type="button" className="text-button" style={{ padding: "4px 10px", fontSize: 12 }} onClick={handleFormat}>
            格式化
          </button>
        </div>
      )}
      <Editor
        height={height}
        defaultLanguage="json"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleEditorMount}
        loading={null}
        readOnly={readOnly}
        options={{
          minimap: { enabled: false },
          lineNumbers: "on",
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
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
        }}
        style={{
          minHeight: typeof minHeight === "number" ? minHeight : undefined,
          border: "1px solid var(--color-border, #e2e8f0)",
          borderRadius: 8,
        }}
      />
    </div>
  );
}
