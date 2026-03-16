/**
 * 脚本输入框：纯 textarea，不依赖 Monaco。
 */
export function ScriptTextarea({
  value,
  onChange,
  height = 220,
}: {
  value: string;
  onChange: (v: string) => void;
  height?: number;
}) {
  return (
    <textarea
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder="JavaScript"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      style={{
        height,
        width: "100%",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: 8,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.5,
        resize: "vertical",
      }}
    />
  );
}
