/**
 * JsFilter 配置（与 Blockly `jsFilter.ts` 的 getConfiguration 对齐）
 */
export interface JsFilterConfig {
  /** 条件表达式，求值应为 boolean（与引擎约定一致） */
  jsScript: string;
}
