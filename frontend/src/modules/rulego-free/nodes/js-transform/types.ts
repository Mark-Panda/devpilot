/**
 * JsTransform 配置（与 Blockly `jsTransform.ts` 的 getConfiguration 对齐）
 */
export interface JsTransformConfig {
  /** JavaScript 脚本，约定返回 `{ msg, metadata, msgType }` */
  jsScript: string;
}
