/**
 * Switch 多分支节点配置（与 Blockly `rulego_switch` / 后端 `switch` 对齐）
 */

export interface SwitchCaseItem {
  /** 分支条件表达式（JS） */
  case: string;
}

export interface SwitchConfig {
  cases: SwitchCaseItem[];
}
