import { JsonEditor } from "../../shared/components";
import { LogTextPreview } from "./LogTextPreview";
import { isStrictJson } from "./LogTextPreview";
import { prettyJsonForDisplay } from "./rulegoPayloadFormat";

type Props = {
  raw: string | undefined;
  emptyPlaceholder: string;
  /** JsonEditor 高度（仅 JSON 时生效） */
  height?: number;
  minHeight?: number;
  expandTitle: string;
};

/**
 * 节点入参/出参：合法 JSON 用只读 JsonEditor；否则用等宽或 Markdown 预览。
 */
export function NodePayloadPreview(props: Props) {
  const { raw, emptyPlaceholder, height = 140, minHeight = 80, expandTitle } = props;
  const t = (raw ?? "").trim();
  if (!t) {
    return <p className="form-hint rulego-exec-payload-empty">{emptyPlaceholder}</p>;
  }
  if (isStrictJson(t)) {
    return (
      <JsonEditor
        value={prettyJsonForDisplay(t, emptyPlaceholder)}
        onChange={() => {}}
        readOnly
        height={height}
        minHeight={minHeight}
        showExpandButton
        showCopyButton
        expandTitle={expandTitle}
      />
    );
  }
  return (
    <div className="rulego-exec-payload-text-wrap" aria-label={expandTitle}>
      <LogTextPreview
        text={t}
        preClassName="rulego-exec-payload-pre"
        markdownClassName="rulego-log-markdown-body rulego-exec-payload-markdown"
      />
    </div>
  );
}
