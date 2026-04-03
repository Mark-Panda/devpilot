/**
 * Fork 并行网关（后端 fork）
 */

export interface ForkConfig {
  /** 并行分支数 1–8（与 Blockly forkCount 一致） */
  branchCount: number;
}
