import { useRef, useCallback } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

const SQL_EDITOR_THEME = "sql-editor-light";

const sqlKeywords = [
  "select", "from", "where", "and", "or", "not", "in", "is", "null", "like", "between", "as",
  "insert", "into", "values", "update", "set", "delete", "create", "drop", "table", "index",
  "join", "left", "right", "inner", "outer", "on", "group", "by", "order", "asc", "desc",
  "having", "limit", "offset", "union", "all", "distinct", "case", "when", "then", "else", "end",
  "primary", "key", "foreign", "references", "constraint", "unique", "default",
  "alter", "add", "column", "modify", "rename", "to", "database", "schema", "view",
  "grant", "revoke", "exec", "execute", "procedure", "function", "return", "trigger",
  "begin", "commit", "rollback", "transaction", "with", "exists", "any", "some",
];

const sqlTokenizerRoot = [
  { include: "@ws" },
  { include: "@num" },
  { include: "@str" },
  { include: "@comment" },
  [/[;,.]/, "delimiter"],
  [/[()]/, "delimiter.paren"],
  [/\[/, "delimiter.square"],
  [/]/, "delimiter.square"],
  [/[{}]/, "delimiter.curly"],
  [/[=<>!+\-*/|&^~]/, "operator"],
  [/\?/, "variable.parameter"],
  [/[a-zA-Z_][a-zA-Z0-9_]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } } as const],
];

/** 使用 Monarch 为 SQL 注册语法高亮（Monaco 无内置 SQL） */
function registerSqlLanguage(monaco: typeof import("monaco-editor")) {
  const langId = "sql";
  const existing = (monaco.languages as { getLanguages?: () => { id: string }[] }).getLanguages?.();
  if (existing?.some((l) => l.id === langId)) return;

  monaco.languages.register({ id: langId });

  const tokenizer = {
    root: sqlTokenizerRoot,
    ws: [[/\s+/, "white"]] as const,
    num: [
      [/\d*\.\d+([eE][+-]?\d+)?/, "number.float"],
      [/\d+/, "number"],
    ] as const,
    str: [
      [/'([^'\\]|\\.)*'/, "string"],
      [/"[^"\\]*(?:\\.[^"\\]*)*"/, "string"],
      [/`[^`\\]*(?:\\.[^`\\]*)*`/, "string"],
    ] as const,
    comment: [
      [/--.*$/, "comment"],
      [/\/\*/, "comment", "@blockComment"],
    ] as const,
    blockComment: [
      [/[^*/]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[*\/]/, "comment"],
    ] as const,
  };

  monaco.languages.setMonarchTokensProvider(langId, {
    defaultToken: "",
    tokenPostfix: ".sql",
    ignoreCase: true,
    brackets: [
      { open: "[", close: "]", token: "delimiter.square" },
      { open: "(", close: ")", token: "delimiter.paren" },
      { open: "{", close: "}", token: "delimiter.curly" },
    ],
    keywords: sqlKeywords,
    operators: ["=", ">", "<", "!", "+", "-", "*", "/", "||", "&", "|", "^", "~", "=>", "<=", "<>", "!="],
    tokenizer,
  });
}

function defineSqlEditorTheme(monaco: typeof import("monaco-editor")) {
  monaco.editor.defineTheme(SQL_EDITOR_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "0000ff", fontStyle: "bold" },
      { token: "string", foreground: "a31515" },
      { token: "comment", foreground: "008000", fontStyle: "italic" },
      { token: "number", foreground: "098658" },
      { token: "identifier", foreground: "001080" },
      { token: "variable.parameter", foreground: "af00db", fontStyle: "bold" },
      { token: "operator", foreground: "000000" },
      { token: "delimiter", foreground: "000000" },
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
  registerSqlLanguage(monaco);
  defineSqlEditorTheme(monaco);
};

type SqlEditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  minHeight?: number;
  readOnly?: boolean;
  className?: string;
};

/**
 * 基于 Monaco Editor 的 SQL 输入框，支持 SQL 语法高亮与占位符 ? 高亮。
 */
export function SqlEditor({
  value,
  onChange,
  height = 140,
  minHeight = 80,
  readOnly = false,
  className,
}: SqlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monaco.editor.setTheme(SQL_EDITOR_THEME);
  }, []);

  return (
    <div className={[`sql-editor-root`, className].filter(Boolean).join(" ")}>
      <Editor
        height={height}
        defaultLanguage="sql"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleEditorMount}
        beforeMount={beforeMount}
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
          suggest: { showWords: true },
          quickSuggestions: { other: true, comments: false, strings: false },
          folding: true,
          bracketPairColorization: { enabled: true },
          padding: { top: 8, bottom: 8 },
          fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
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
