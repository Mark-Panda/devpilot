import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { BlockLibraryPanel, DRAG_TYPE_BLOCK } from "./BlockLibraryPanel";
import { useRuleGoRules } from "./useRuleGoRules";
import { dslToReactFlow, applyDagreLayout, reactFlowToDsl } from "./reactflow/converter";
import type { RuleGoFlowNode, RuleGoFlowEdge, RuleGoNodeData, RuleGoDsl } from "./reactflow/converter";
import { buildNodeTypes } from "./reactflow/nodes";
import { registerAllBlocks } from "./rulego-blocks";
import * as ScratchBlocks from "scratch-blocks";
import type { WorkspaceSvg } from "blockly/core";

registerAllBlocks(ScratchBlocks, ScratchBlocks);

const NODE_TYPES = buildNodeTypes();

// ────────────────────────────────────────────────────────────
// defaultDataFor：为每种节点类型生成默认 configuration
// ────────────────────────────────────────────────────────────
function defaultDataFor(blockType: string): RuleGoNodeData {
  const nodeType = blockType.replace(/^rulego_/, "");
  return {
    nodeType,
    name: blockType.replace("rulego_", "").replace(/_/g, " "),
    debugMode: false,
    configuration: {},
    expanded: true,
  };
}

// ────────────────────────────────────────────────────────────
// 内层编辑器（需要在 ReactFlowProvider 内）
// ────────────────────────────────────────────────────────────
function EditorInner({
  ruleId,
  definition,
  onSave,
  isSaving,
}: {
  ruleId: string;
  definition: string;
  onSave: (newDef: string) => void;
  isSaving: boolean;
}) {
  const navigate = useNavigate();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<RuleGoFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RuleGoFlowEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const initializedRef = useRef(false);

  // 解析 DSL 并初始化画布
  useEffect(() => {
    if (!definition || initializedRef.current) return;
    try {
      const dsl = JSON.parse(definition) as RuleGoDsl;
      const { nodes: rfNodes, edges: rfEdges, hasPositions } = dslToReactFlow(dsl);
      const laidNodes = hasPositions ? rfNodes : applyDagreLayout(rfNodes, rfEdges);
      setNodes(laidNodes);
      setEdges(rfEdges);
      initializedRef.current = true;
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
    } catch {
      // DSL 解析失败：空画布
    }
  }, [definition, setNodes, setEdges, fitView]);

  // 选中节点
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // 连线
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: "smoothstep", label: connection.sourceHandle ?? "Success" }, eds));
      setIsDirty(true);
    },
    [setEdges]
  );

  // 拖入新节点（来自 BlockLibraryPanel）
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const blockType = e.dataTransfer.getData(DRAG_TYPE_BLOCK);
      if (!blockType) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNode: RuleGoFlowNode = {
        id: `${blockType}_${Date.now()}`,
        type: blockType,
        position,
        data: defaultDataFor(blockType),
      };
      setNodes((nds) => [...nds, newNode]);
      setIsDirty(true);
    },
    [screenToFlowPosition, setNodes]
  );

  // 节点数据变更（来自配置面板 onDataChange）
  const handleNodeDataChange = useCallback(
    (nodeId: string, data: Partial<RuleGoNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
      );
      setIsDirty(true);
    },
    [setNodes]
  );

  // 保存
  const handleSave = useCallback(() => {
    const metadata = reactFlowToDsl(nodes, edges);
    let dsl: RuleGoDsl;
    try {
      dsl = JSON.parse(definition) as RuleGoDsl;
    } catch {
      dsl = { metadata: { nodes: [], connections: [] } };
    }
    dsl.metadata = metadata;
    onSave(JSON.stringify(dsl, null, 2));
    setIsDirty(false);
  }, [nodes, edges, definition, onSave]);

  // 切换到 Scratch 编辑器
  const handleSwitchToScratch = useCallback(() => {
    if (isDirty) {
      if (!confirm("有未保存的修改，切换后将丢失。是否继续？")) return;
    }
    navigate(`/rulego/editor/${ruleId}`);
  }, [isDirty, navigate, ruleId]);

  // 配置面板本地 state
  const [configText, setConfigText] = useState("");
  const [configName, setConfigName] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);

  // 当选中节点变化时，同步配置面板 state
  useEffect(() => {
    if (!selectedNode) return;
    setConfigName(selectedNode.data.name ?? "");
    setConfigText(JSON.stringify(selectedNode.data.configuration ?? {}, null, 2));
    setConfigError(null);
  }, [selectedNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfigApply = useCallback(() => {
    if (!selectedNode) return;
    try {
      const parsed = JSON.parse(configText) as Record<string, unknown>;
      handleNodeDataChange(selectedNode.id, { name: configName, configuration: parsed });
      setConfigError(null);
    } catch {
      setConfigError("JSON 格式错误");
    }
  }, [selectedNode, configText, configName, handleNodeDataChange]);

  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      {/* 左侧组件库 */}
      <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid #e2e8f0", overflow: "auto" }}>
        <BlockLibraryPanel workspaceRef={{ current: null } as React.RefObject<WorkspaceSvg | null>} />
      </div>

      {/* 主画布区 */}
      <div style={{ flex: 1, position: "relative" }}>
        {/* 顶部工具栏 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.95)",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", flex: 1 }}>
            流程图编辑器
            {isDirty && <span style={{ color: "#f59e0b", marginLeft: 6 }}>●</span>}
          </span>
          <button
            type="button"
            onClick={handleSwitchToScratch}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 5,
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              cursor: "pointer",
              color: "#475569",
            }}
          >
            切换到积木编辑器
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            style={{
              fontSize: 12,
              padding: "4px 14px",
              borderRadius: 5,
              border: "none",
              background: isDirty ? "#3b82f6" : "#cbd5e1",
              color: "#fff",
              cursor: isDirty ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            {isSaving ? "保存中…" : "保存"}
          </button>
        </div>

        {/* ReactFlow 画布 */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => { onNodesChange(changes); setIsDirty(true); }}
          onEdgesChange={(changes) => { onEdgesChange(changes); setIsDirty(true); }}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={NODE_TYPES}
          fitView
          style={{ paddingTop: 48 }}
        >
          {/* FlowGram 风格：浅色点阵背景 */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="rgba(6,7,9,0.10)" />
          <Controls style={{ borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }} />
          <MiniMap
            nodeColor="rgba(6,7,9,0.08)"
            maskColor="rgba(248,250,252,0.85)"
            style={{ borderRadius: 8, border: "1px solid rgba(6,7,9,0.08)" }}
          />
        </ReactFlow>
      </div>

      {/* 右侧配置面板 */}
      {selectedNode && (
        <div
          style={{
            width: 340,
            flexShrink: 0,
            borderLeft: "1px solid #e2e8f0",
            overflow: "auto",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 面板标题栏 */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
              节点配置
            </span>
            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#94a3b8" }}
            >
              ×
            </button>
          </div>

          {/* 节点名称 */}
          <div style={{ padding: "12px 14px 0" }}>
            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500, display: "block", marginBottom: 4 }}>
              节点名称
            </label>
            <input
              type="text"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #e2e8f0",
                borderRadius: 5,
                fontSize: 13,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          {/* 节点类型（只读） */}
          <div style={{ padding: "10px 14px 0" }}>
            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500, display: "block", marginBottom: 4 }}>
              节点类型
            </label>
            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", padding: "4px 0" }}>
              {selectedNode.data.nodeType || selectedNode.type}
            </div>
          </div>

          {/* configuration JSON 编辑 */}
          <div style={{ padding: "10px 14px 0", flex: 1, display: "flex", flexDirection: "column" }}>
            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 500, display: "block", marginBottom: 4 }}>
              configuration（JSON）
            </label>
            {configError && (
              <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 4 }}>{configError}</div>
            )}
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              style={{
                flex: 1,
                minHeight: 200,
                width: "100%",
                padding: "8px",
                border: `1px solid ${configError ? "#ef4444" : "#e2e8f0"}`,
                borderRadius: 5,
                fontSize: 12,
                fontFamily: "monospace",
                resize: "vertical",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          {/* 应用按钮 */}
          <div style={{ padding: "12px 14px", flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleConfigApply}
              style={{
                width: "100%",
                padding: "8px",
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              应用
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { Suspense } from "react";

// ────────────────────────────────────────────────────────────
// 外层页面（接入数据层）
// ────────────────────────────────────────────────────────────
export function RuleGoReactFlowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { rules, update } = useRuleGoRules();
  const [isSaving, setIsSaving] = useState(false);

  const rule = rules.find((r) => r.id === id);

  const handleSave = useCallback(
    async (newDef: string) => {
      if (!rule || !id) return;
      setIsSaving(true);
      try {
        await update(id, { ...rule, definition: newDef });
      } finally {
        setIsSaving(false);
      }
    },
    [rule, id, update]
  );

  if (!rule) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <span style={{ color: "#94a3b8" }}>加载中…</span>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <Suspense fallback={null}>
        <EditorInner
          ruleId={rule.id}
          definition={rule.definition ?? ""}
          onSave={handleSave}
          isSaving={isSaving}
        />
      </Suspense>
    </ReactFlowProvider>
  );
}
