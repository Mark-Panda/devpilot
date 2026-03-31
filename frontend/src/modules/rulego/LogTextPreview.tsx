import type { CSSProperties, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function isStrictJson(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** 保守启发式：避免把 JSON / 纯文本误判为 Markdown。 */
export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (isStrictJson(text)) return false;

  if (/^#{1,6}\s+\S/m.test(text)) return true;
  if (/```[\s\S]*?```/.test(text)) return true;
  if (/^\s*[-*+]\s+\S/m.test(text)) return true;
  if (/^\s*\d+\.\s+\S/m.test(text)) return true;
  if (/^>\s+\S/m.test(text)) return true;
  if (/^\|[^\n]+\|\s*$/m.test(text)) return true;
  if (/\[[^\]]{1,200}\]\([^)]+\)/.test(text)) return true;
  if (/!\[[^\]]*\]\([^)]+\)/.test(text)) return true;
  if (/\*\*[^*\n][^*]*\*\*/.test(text)) return true;
  if (/__[^_\n]+__/.test(text)) return true;
  if (/`[^`\n]+`/.test(text) && text.includes("\n")) return true;
  return false;
}

export type LogTextPreviewProps = {
  text: string;
  /** 作为 Markdown 渲染时的外层 class（含滚动与排版） */
  markdownClassName?: string;
  /** 纯文本 / 非 MD 时 pre 的 class */
  preClassName?: string;
  markdownStyle?: CSSProperties;
  preStyle?: CSSProperties;
  emptyContent?: ReactNode;
};

/**
 * 日志/长文本：若内容像 Markdown 且不是合法 JSON，则渲染为预览；否则保持等宽 pre。
 */
export function LogTextPreview(props: LogTextPreviewProps): ReactNode {
  const {
    text,
    markdownClassName = "rulego-log-markdown-body",
    preClassName = "",
    markdownStyle,
    preStyle,
    emptyContent = null,
  } = props;
  const trimmed = text.trim();
  if (!trimmed) return emptyContent;

  if (looksLikeMarkdown(text)) {
    return (
      <div className={markdownClassName.trim()} style={markdownStyle}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  return (
    <pre className={preClassName} style={preStyle}>
      {text}
    </pre>
  );
}
