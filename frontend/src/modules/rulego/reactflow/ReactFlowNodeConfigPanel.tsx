import { useRef, useCallback } from "react";
import type { RuleGoNodeData } from "./converter/types";
import { getBlockDef } from "../rulego-blocks";

/**
 * ReactFlow 模式的节点配置面板。
 *
 * 策略：不改动 BlockConfigModal 内部，而是通过构造一个"伪 Block 对象"
 * 桥接到现有 BlockConfigModal 的 blockly 模式。
 *
 * 伪 Block：
 * - getFieldValue / setFieldValue → 读写内部 state（`nodeData.configuration` 解包而来）
 * - type → blockType
 * - 保存时通过 onDataChange 回调把 configuration 写回 ReactFlow node.data
 */
type ReactFlowNodeConfigPanelProps = {
  nodeId: string;
  blockType: string;
  nodeData: RuleGoNodeData;
  onDataChange: (nodeId: string, data: Partial<RuleGoNodeData>) => void;
  onClose: () => void;
  subRuleChains?: Array<{ id: string; name: string }>;
  refContextRules?: Array<{ id: string; name: string; definition: string }>;
  currentRuleId?: string;
};

/**
 * 从 configuration 构建 Blockly 字段 ↔ 值 的双向映射，
 * 复用 BlockTypeDef.setConfiguration 的写块逻辑。
 */
function buildFakeFieldStore(blockType: string, nodeData: RuleGoNodeData): Map<string, string | boolean> {
  const store = new Map<string, string | boolean>();

  // 通用字段
  store.set("NODE_ID", String((nodeData.configuration as Record<string, unknown>)?.id ?? nodeData.name ?? ""));
  store.set("NODE_NAME", nodeData.name ?? "");
  store.set("DEBUG", nodeData.debugMode ? "TRUE" : "FALSE");

  const def = getBlockDef(blockType);
  if (!def?.setConfiguration) return store;

  // 构造一个支持 setFieldValue 的伪 Block，把 setConfiguration 的写操作捕获到 store
  const fakeBlock = {
    type: blockType,
    getFieldValue: (name: string) => {
      const v = store.get(name);
      if (v === undefined) return "";
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      return String(v);
    },
    setFieldValue: (value: string, name: string) => {
      store.set(name, value);
    },
    getField: (name: string) => store.has(name) ? { getValue: () => store.get(name) } : null,
    inputList: [],
  } as unknown as import("blockly/core").Block;

  const helpers = {
    getFieldValue: (_b: unknown, name: string) => {
      const v = store.get(name);
      return v !== undefined ? String(v) : "";
    },
    getBooleanField: (_b: unknown, name: string) => store.get(name) === "TRUE" || store.get(name) === true,
    parseJsonValue: (v: string, fb: unknown) => { try { return JSON.parse(v); } catch { return fb; } },
  };

  try {
    def.setConfiguration(fakeBlock, { configuration: nodeData.configuration ?? {} }, helpers);
  } catch {
    // setConfiguration 可能访问 DOM API（mutation），静默忽略
  }

  return store;
}

/**
 * 从伪 Block store + blockType 重建 configuration（通过 getConfiguration）。
 */
function extractConfigurationFromStore(
  blockType: string,
  store: Map<string, string | boolean>
): Record<string, unknown> {
  const def = getBlockDef(blockType);
  if (!def?.getConfiguration) return {};

  const fakeBlock = {
    type: blockType,
    getFieldValue: (name: string) => {
      const v = store.get(name);
      return v !== undefined ? String(v) : "";
    },
    getInputTargetBlock: () => null,
    inputList: [],
  } as unknown as import("blockly/core").Block;

  const helpers = {
    getFieldValue: (_b: unknown, name: string) => {
      const v = store.get(name);
      return v !== undefined ? String(v) : "";
    },
    getBooleanField: (_b: unknown, name: string) => store.get(name) === "TRUE" || store.get(name) === true,
    parseJsonValue: (v: string, fb: unknown) => { try { return JSON.parse(v); } catch { return fb; } },
  };

  try {
    return def.getConfiguration(fakeBlock, helpers);
  } catch {
    return {};
  }
}

export function useReactFlowNodeConfig(props: ReactFlowNodeConfigPanelProps) {
  const { nodeId, blockType, nodeData, onDataChange } = props;

  // 构造一个稳定的 fake workspace + fake block，供 BlockConfigModal 使用
  const storeRef = useRef<Map<string, string | boolean>>(new Map());

  // 重新初始化 store（当 nodeId 变化时）
  const initStore = useCallback(() => {
    storeRef.current = buildFakeFieldStore(blockType, nodeData);
  }, [blockType, nodeData]);

  const fakeBlock = useRef({
    type: blockType,
    id: nodeId,
    getFieldValue: (name: string) => {
      const v = storeRef.current.get(name);
      if (v === undefined) return "";
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      return String(v);
    },
    setFieldValue: (value: string, name: string) => {
      storeRef.current.set(name, value);
    },
    getField: (name: string) =>
      storeRef.current.has(name) ? { getValue: () => storeRef.current.get(name) } : null,
    inputList: [],
  } as unknown as import("blockly/core").Block & { id: string });

  // 当 blockType 变化时更新 type
  fakeBlock.current.type = blockType;

  const fakeWorkspace = useRef({
    getBlockById: (id: string) => (id === nodeId ? fakeBlock.current : null),
    getAllBlocks: () => [fakeBlock.current],
  } as unknown as import("blockly/core").WorkspaceSvg);

  const workspaceRef = { current: fakeWorkspace.current } as React.RefObject<import("blockly/core").WorkspaceSvg>;

  /** 保存时：从 store 重建 configuration，回调给父组件 */
  const handleSaved = useCallback(() => {
    const configuration = extractConfigurationFromStore(blockType, storeRef.current);
    const name = String(storeRef.current.get("NODE_NAME") ?? nodeData.name ?? "");
    const debugMode = storeRef.current.get("DEBUG") === "TRUE";
    onDataChange(nodeId, { name, debugMode, configuration });
  }, [nodeId, blockType, nodeData.name, onDataChange]);

  return { workspaceRef, blockId: nodeId, initStore, handleSaved };
}
