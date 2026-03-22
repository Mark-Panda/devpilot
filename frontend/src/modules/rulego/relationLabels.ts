/** 界面展示用文案；规则链 DSL / 后端 relation_type 仍为 Failure、False */
export const UI_RELATION_FAILURE = "执行异常";

export function formatRelationTypeForDisplay(t: string | undefined | null): string {
  if (t == null || t === "") return "";
  if (t === "Failure" || t === "False") return UI_RELATION_FAILURE;
  return t;
}
