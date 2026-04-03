/** 标准动作节点：Success / Failure 输出（与 Blockly 分支一致） */
export const SF_PORTS = [
  { type: 'input', location: 'left', portID: 'input' },
  { type: 'output', location: 'right', portID: 'success' },
  { type: 'output', location: 'bottom', portID: 'failure' },
] as const;

export const BREAK_PORTS = [
  { type: 'input', location: 'left', portID: 'input' },
  { type: 'output', location: 'right', portID: 'success' },
] as const;
