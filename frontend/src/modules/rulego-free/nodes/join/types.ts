/**
 * Join 汇聚节点（后端 join）
 */

export interface JoinConfig {
  timeout: number;
  mergeToMap: boolean;
  /** 除第一条入线外的上游节点 id（由 DSL→Workflow 或编辑器写入） */
  extraIncomings?: string[];
}
