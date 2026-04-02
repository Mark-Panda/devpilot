import { memo, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import type { RuleGoNodeData } from "../converter/types";

// ─── FlowGram Loop Design Tokens ─────────────────────────────────────────
// Loop 容器：size 424×244，padding top:120 bottom:80 left:80 right:80
// Header: linear-gradient(#f2f2ff 0%, rgb(251,251,251) 100%)
// BlockStart/End: 100×100 圆形，border-radius 12，borderWidth 2

const BORDER_COLOR = "rgba(6, 7, 9, 0.10)";
const BORDER_SELECTED = "#4e40e5";
const HEADER_BG = "linear-gradient(180deg, #f2f2ff 0%, rgb(251, 251, 251) 100%)";
const BLOCK_NODE_BG = "linear-gradient(135deg, #6366f1 0%, #4e40e5 100%)";
const COLLAPSED_HEIGHT = 60;
const MIN_WIDTH = 424;
const MIN_HEIGHT = 220;

type ForLoopNodeProps = NodeProps & { data: RuleGoNodeData };

/**
 * ForLoopNode — 严格复刻 FlowGram.ai Loop 节点样式。
 *
 * Loop 容器结构：
 * ┌──────────────────────────────────────────────┐
 * │ [▶] Loop_name  [.]loopFor: range  [tabs...]  │ ← Header (FormHeader 样式)
 * │──────────────────────────────────────────────│
 * │        ┌────┐                     ┌────┐     │
 * │   ●──→ │ ↺  │ ──→ [子节点链] ──→ │ ↩  │ →● │
 * │        └────┘                     └────┘     │
 * └──────────────────────────────────────────────┘
 *
 * BlockStart 圆形图标（左）：↺，蓝紫渐变
 * BlockEnd   圆形图标（右）：↩，蓝紫渐变
 * 子节点通过 parentId 水平排列在中间
 */
export const ForLoopNode = memo(function ForLoopNode({ id, data, selected }: ForLoopNodeProps) {
  const { setNodes } = useReactFlow();
  const expanded = data.expanded !== false;
  const range = String(data.configuration?.range ?? "1..3");
  const nodeName = data.name || "Loop";

  const toggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = !expanded;
      setNodes((nodes) =>
        nodes.map((n) => {
          if (n.id === id) {
            return {
              ...n,
              data: { ...n.data, expanded: next },
              style: !next ? { ...(n.style ?? {}), height: COLLAPSED_HEIGHT } : (n.style ?? {}),
            };
          }
          if (n.parentId === id) return { ...n, hidden: !next };
          return n;
        })
      );
    },
    [id, expanded, setNodes]
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 12,
        border: `1.5px solid ${selected ? BORDER_SELECTED : BORDER_COLOR}`,
        background: "#fff",
        boxShadow: selected
          ? `0 0 0 3px rgba(78,64,229,0.15), 0 4px 20px rgba(0,0,0,0.08)`
          : "0 2px 8px 0 rgba(0,0,0,0.04), 0 4px 16px 0 rgba(0,0,0,0.03)",
        overflow: "visible",
        position: "relative",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* NodeResizer：选中展开时可调整大小 */}
      {expanded && (
        <NodeResizer
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          isVisible={selected}
          lineStyle={{ borderColor: BORDER_SELECTED, opacity: 0.5, borderWidth: 1 }}
          handleStyle={{ background: BORDER_SELECTED, width: 7, height: 7, borderRadius: 2 }}
        />
      )}

      {/* ── Header（复刻 FlowGram FormHeader） ── */}
      <div
        style={{
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          width: "100%",
          columnGap: 8,
          borderRadius: expanded ? "10px 10px 0 0" : 10,
          background: HEADER_BG,
          overflow: "hidden",
          padding: "8px 10px",
          borderBottom: expanded ? "1px solid rgba(6,7,9,0.08)" : "none",
          flexShrink: 0,
        }}
      >
        {/* 展开/折叠三角（FlowGram IconSmallTriangleDown/Left） */}
        <button
          onClick={toggleExpand}
          title={expanded ? "折叠" : "展开"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(6,7,9,0.45)",
            fontSize: 11,
            padding: "2px",
            display: "flex",
            alignItems: "center",
            transition: "color 0.15s",
            flexShrink: 0,
          }}
        >
          {expanded ? "▼" : "▶"}
        </button>

        {/* 节点图标（FlowGram: 24×24 img，border-radius 4） */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            background: BLOCK_NODE_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          ↺
        </div>

        {/* 节点标题（FlowGram: font-size 20px flex:1） */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#0f172a",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {nodeName}
        </div>

        {/* loopFor 参数 tab（类似 FlowGram 的 [.] loopFor） */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(6,7,9,0.05)",
            borderRadius: 5,
            padding: "3px 8px",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: "rgba(6,7,9,0.4)", fontFamily: "monospace" }}>[.]</span>
          <span style={{ fontSize: 11, color: "rgba(6,7,9,0.65)", fontWeight: 500 }}>range: {range}</span>
        </div>

        {data.debugMode && (
          <span style={{ fontSize: 9, color: "#f59e0b", background: "#fef3c7", borderRadius: 3, padding: "1px 5px", fontWeight: 600, flexShrink: 0 }}>
            DEBUG
          </span>
        )}
      </div>

      {/* ── 展开时：Loop 子画布区域 ── */}
      {expanded && (
        <div
          style={{
            flex: 1,
            position: "relative",
            display: "flex",
            alignItems: "center",
            // padding 对应 FlowGram Loop 的 padding: top:120 bottom:80 left:80 right:80
            // 但我们的 header 已占去部分 top，所以只需要中间对齐
          }}
        >
          {/* BlockStart 圆形节点（FlowGram: 100×100, borderRadius:12, borderWidth:2） */}
          <div
            style={{
              position: "absolute",
              left: 20,
              top: "50%",
              transform: "translateY(-50%)",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: BLOCK_NODE_BG,
              border: "2.5px solid rgba(255,255,255,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 20,
              boxShadow: "0 3px 12px rgba(78,64,229,0.4)",
              zIndex: 1,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            ↺
          </div>

          {/* BlockEnd 圆形节点 */}
          <div
            style={{
              position: "absolute",
              right: 20,
              top: "50%",
              transform: "translateY(-50%)",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: BLOCK_NODE_BG,
              border: "2.5px solid rgba(255,255,255,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 20,
              boxShadow: "0 3px 12px rgba(78,64,229,0.4)",
              zIndex: 1,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            ↩
          </div>

          {/* BlockStart → 子链首节点 的连线起点（Do 端口） */}
          <Handle
            type="source"
            position={Position.Right}
            id="Do"
            style={{
              background: "#4e40e5",
              width: 9,
              height: 9,
              left: 68,
              top: "50%",
              transform: "translateY(-50%)",
              border: "2px solid #fff",
              borderRadius: "50%",
              zIndex: 2,
            }}
          />
        </div>
      )}

      {/* ── 折叠时摘要 ── */}
      {!expanded && (
        <div
          style={{
            padding: "8px 12px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgb(251,251,251)",
            borderRadius: "0 0 10px 10px",
          }}
        >
          <span style={{ fontSize: 12, color: "rgba(6,7,9,0.45)", fontFamily: "monospace" }}>[.] range:</span>
          <span style={{ fontSize: 12, color: "rgba(6,7,9,0.65)", fontWeight: 500 }}>{range}</span>
        </div>
      )}

      {/* ── 外部左侧入端口（Loop 整体的输入） ── */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          background: selected ? "#4e40e5" : "rgba(6,7,9,0.25)",
          width: 10,
          height: 10,
          left: -5,
          top: expanded ? 28 : "50%",
          transform: expanded ? "none" : "translateY(-50%)",
          border: "2px solid #fff",
          borderRadius: "50%",
          transition: "background 0.15s",
        }}
      />

      {/* ── 外部右侧出端口 Success（Loop 结束后继续） ── */}
      <Handle
        type="source"
        position={Position.Right}
        id="Success"
        style={{
          background: selected ? "#4e40e5" : "rgba(6,7,9,0.25)",
          width: 10,
          height: 10,
          right: -5,
          top: expanded ? 28 : "50%",
          transform: expanded ? "none" : "translateY(-50%)",
          border: "2px solid #fff",
          borderRadius: "50%",
          transition: "background 0.15s",
        }}
      />

      {/* Failure 端口（底部） */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="Failure"
        style={{
          background: "#ef4444",
          width: 10,
          height: 10,
          bottom: -5,
          left: "50%",
          transform: "translateX(-50%)",
          border: "2px solid #fff",
          borderRadius: "50%",
        }}
      />
    </div>
  );
});
