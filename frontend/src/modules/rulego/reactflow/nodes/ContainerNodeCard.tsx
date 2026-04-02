import { memo, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import { getCategoryConfig } from "./categoryConfig";
import type { RuleGoNodeData } from "../converter/types";

// ─── FlowGram Design Tokens ───────────────────────────────────────────────
const BORDER_COLOR = "rgba(6, 7, 9, 0.10)";
const BORDER_SELECTED = "#4e40e5";
const HEADER_BG = "linear-gradient(180deg, #f2f2ff 0%, rgb(251, 251, 251) 100%)";
const BOX_SHADOW = "0 2px 8px 0 rgba(0,0,0,0.04), 0 4px 16px 0 rgba(0,0,0,0.03)";
const BOX_SHADOW_SELECTED = "0 0 0 3px rgba(78,64,229,0.15), 0 4px 20px rgba(0,0,0,0.08)";
const COLLAPSED_HEIGHT = 60;

type ContainerNodeCardProps = NodeProps & { data: RuleGoNodeData };

export const ContainerNodeCard = memo(function ContainerNodeCard({ id, type, data, selected }: ContainerNodeCardProps) {
  const { setNodes } = useReactFlow();
  const catConfig = getCategoryConfig(type ?? "");
  const expanded = data.expanded !== false;

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

  const outputHandles: Array<{ id: string; label: string }> =
    type === "rulego_switch" || type === "rulego_jsSwitch"
      ? (((data.configuration?.cases as Array<{ then: string }>) ?? [])
          .map((c) => ({ id: c.then || "Case1", label: c.then || "Case1" })))
          .concat([{ id: "Failure", label: "Failure" }])
      : [{ id: "Success", label: "Success" }, { id: "Failure", label: "Failure" }];

  const totalOut = outputHandles.length;

  const summary =
    type === "rulego_switch" || type === "rulego_jsSwitch"
      ? `${((data.configuration?.cases as unknown[]) ?? []).length} 条分支`
      : type === "rulego_fork"
        ? "并行网关"
        : `${((data.configuration?.nodeIds as unknown[]) ?? []).length} 个节点`;

  const portColor = selected ? "#4e40e5" : "rgba(6,7,9,0.25)";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 12,
        border: `1.5px solid ${selected ? BORDER_SELECTED : BORDER_COLOR}`,
        background: "#fff",
        boxShadow: selected ? BOX_SHADOW_SELECTED : BOX_SHADOW,
        overflow: "visible",
        position: "relative",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {expanded && (
        <NodeResizer
          minWidth={400}
          minHeight={160}
          isVisible={selected}
          lineStyle={{ borderColor: BORDER_SELECTED, opacity: 0.4, borderWidth: 1 }}
          handleStyle={{ background: BORDER_SELECTED, width: 7, height: 7, borderRadius: 2 }}
        />
      )}

      {/* ── Header（FlowGram FormHeader 样式） ── */}
      <div
        style={{
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          columnGap: 8,
          borderRadius: expanded ? "10px 10px 0 0" : 10,
          background: HEADER_BG,
          overflow: "hidden",
          padding: "8px 10px",
          borderBottom: expanded ? "1px solid rgba(6,7,9,0.08)" : "none",
          flexShrink: 0,
        }}
      >
        {/* 展开/折叠 */}
        <button
          onClick={toggleExpand}
          title={expanded ? "折叠" : "展开"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(6,7,9,0.45)",
            fontSize: 11,
            padding: 2,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {expanded ? "▼" : "▶"}
        </button>

        {/* 图标 */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            background: `${catConfig.color}20`,
            border: `1.5px solid ${catConfig.color}40`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {catConfig.icon}
        </div>

        {/* 标题 */}
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
          {data.name || (type ?? "").replace("rulego_", "")}
        </div>

        {/* 摘要 badge */}
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
          <span style={{ fontSize: 11, color: "rgba(6,7,9,0.65)", fontWeight: 500 }}>{summary}</span>
        </div>
      </div>

      {/* ── 展开时内容占位区（子节点通过 parentId 悬浮其中） ── */}
      {expanded && <div style={{ flex: 1, minHeight: 100 }} />}

      {/* ── 折叠时摘要 body ── */}
      {!expanded && (
        <div
          style={{
            padding: "8px 12px 10px",
            background: "rgb(251,251,251)",
            borderRadius: "0 0 10px 10px",
            fontSize: 12,
            color: "rgba(6,7,9,0.55)",
          }}
        >
          {summary}
        </div>
      )}

      {/* 左侧入端口 */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          background: portColor,
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

      {/* 右侧出端口 */}
      {outputHandles.map((h, i) => {
        const pct = totalOut === 1 ? 50 : 20 + (60 / (totalOut - 1)) * i;
        return (
          <Handle
            key={h.id}
            type="source"
            position={Position.Right}
            id={h.id}
            style={{
              background: portColor,
              width: 10,
              height: 10,
              right: -5,
              top: `${pct}%`,
              transform: "translateY(-50%)",
              border: "2px solid #fff",
              borderRadius: "50%",
            }}
          />
        );
      })}

      {/* 多分支端口标签 */}
      {totalOut > 1 && (
        <div
          style={{
            position: "absolute",
            right: 14,
            top: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            paddingTop: "20%",
            paddingBottom: "20%",
            pointerEvents: "none",
          }}
        >
          {outputHandles.map((h) => (
            <span key={h.id} style={{ fontSize: 10, color: "rgba(6,7,9,0.35)", textAlign: "right", lineHeight: 1 }}>
              {h.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
