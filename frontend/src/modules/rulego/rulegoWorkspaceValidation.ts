import type { Block, WorkspaceSvg } from "blockly/core";
import { getBlockDef } from "./rulego-blocks";

export function isRuleGoTriggerBlockType(blockType: string): boolean {
  if (!blockType.startsWith("rulego_")) return false;
  if (blockType === "rulego_startTrigger") return true;
  return Boolean(getBlockDef(blockType)?.metadataEndpoint);
}

/**
 * 规则链触发器约束：画布上必须有且仅有一个触发器积木，且必须作为语句链首块（无上一块衔接）。
 * 触发器包括「开始」与各类 Endpoint 触发器（metadata.endpoints 对应块）。
 */
export function validateRuleGoTriggerLayout(workspace: WorkspaceSvg): string | null {
  const all = workspace.getAllBlocks(false) as Block[];
  const triggers: Block[] = [];
  for (const b of all) {
    if (isRuleGoTriggerBlockType(b.type)) {
      triggers.push(b);
    }
  }
  if (triggers.length === 0) {
    return "规则链开头必须有一个触发器：请放置「开始」或一种 Endpoint 触发器作为链首。";
  }
  if (triggers.length > 1) {
    return "整个画布只能有一个触发器（「开始」与 Endpoint 触发器不可同时出现多块）。";
  }
  const head = triggers[0];
  const prev = head.previousConnection?.targetBlock?.() ?? null;
  if (prev) {
    return "触发器只能放在规则链最前端，不能接在其他积木下方。";
  }
  return null;
}
