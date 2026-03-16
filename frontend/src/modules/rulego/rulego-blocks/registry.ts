import type { BlockTypeDef } from "./types";

const blockDefsByBlockType = new Map<string, BlockTypeDef>();
const nodeTypeToBlockType = new Map<string, string>();

export function registerBlockType(def: BlockTypeDef): void {
  blockDefsByBlockType.set(def.blockType, def);
  nodeTypeToBlockType.set(def.nodeType, def.blockType);
}

export function getBlockDef(blockType: string): BlockTypeDef | undefined {
  return blockDefsByBlockType.get(blockType);
}

export function getNodeType(blockType: string): string {
  return getBlockDef(blockType)?.nodeType ?? "";
}

export function getBlockTypeFromNodeType(nodeType: string): string {
  return nodeTypeToBlockType.get(nodeType) ?? "";
}

export function getAllBlockTypes(): string[] {
  return Array.from(blockDefsByBlockType.keys());
}
