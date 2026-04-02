import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { getCategoryConfig } from "./categoryConfig";
import type { RuleGoNodeData } from "../converter/types";
import { getBlockDef } from "../../rulego-blocks";

// ─── FlowGram Design Tokens ───────────────────────────────────────────────
const CARD_WIDTH = 360;
const BORDER_COLOR = "rgba(6, 7, 9, 0.15)";
const BORDER_SELECTED = "#4e40e5";
const BOX_SHADOW = "0 2px 6px 0 rgba(0, 0, 0, 0.04), 0 4px 12px 0 rgba(0, 0, 0, 0.02)";
const BOX_SHADOW_SELECTED = "0 0 0 2px rgba(78,64,229,0.18), 0 4px 16px rgba(0,0,0,0.08)";
const HEADER_BG = "linear-gradient(#f2f2ff 0%, rgb(251, 251, 251) 100%)";
const BODY_BG = "rgb(251, 251, 251)";
const PORT_COLOR_DEFAULT = "rgba(6,7,9,0.25)";
const PORT_COLOR_SELECTED = "#4e40e5";

/** 从 BlockTypeDef 获取该节点的输出端口列表 */
function getOutputHandles(blockType: string, data: RuleGoNodeData): Array<{ id: string; label: string }> {
  const def = getBlockDef(blockType);
  if (!def?.getConnectionBranches) {
    return [{ id: "Success", label: "Success" }, { id: "Failure", label: "Failure" }];
  }
  const mockBlock = { getFieldValue: () => "", inputList: [] } as unknown as import("blockly/core").Block;
  const helpers = {
    getFieldValue: (_b: unknown, name: string) => {
      if (name === "CASES_JSON") return JSON.stringify(data.configuration?.cases ?? []);
      return "";
    },
    getBooleanField: () => false,
    parseJsonValue: (v: string, fb: unknown) => { try { return JSON.parse(v); } catch { return fb; } },
  };
  try {
    const branches = def.getConnectionBranches(mockBlock, helpers);
    if (!branches?.length) return [{ id: "Success", label: "Success" }, { id: "Failure", label: "Failure" }];
    return branches
      .filter((b) => b.inputName !== "__next__")
      .map((b) => ({ id: b.connectionType, label: b.connectionType }));
  } catch {
    return [{ id: "Success", label: "Success" }, { id: "Failure", label: "Failure" }];
  }
}

/** 关键配置字段摘要 */
function getConfigSummary(blockType: string, config: Record<string, unknown>): string {
  const c = config ?? {};
  switch (blockType) {
    case "rulego_restApiCall": return String(c.restEndpointUrlPattern ?? "");
    case "rulego_llm": return String(c.model ?? "");
    case "rulego_volcTlsSearchLogs": return String(c.query ?? "");
    case "rulego_opensearchSearch": return String(c.index ?? "");
    case "rulego_jsTransform":
    case "rulego_jsFilter":
    case "rulego_jsSwitch": return "JS 脚本";
    case "rulego_delay": return `${String(c.periodInSeconds ?? 0)}s`;
    case "rulego_dbClient": return String(c.driverName ?? "");
    case "rulego_feishuImMessage": return "飞书消息";
    default: return "";
  }
}

type RuleGoNodeCardProps = NodeProps & { data: RuleGoNodeData };

export const RuleGoNodeCard = memo(function RuleGoNodeCard({ type, data, selected }: RuleGoNodeCardProps) {
  const blockType = type ?? "";
  const catConfig = getCategoryConfig(blockType);
  const outputHandles = getOutputHandles(blockType, data);
  const summary = getConfigSummary(blockType, data.configuration as Record<string, unknown>);
  const totalOut = outputHandles.length;

  const portColor = selected ? PORT_COLOR_SELECTED : PORT_COLOR_DEFAULT;

  return (
    <div
      style={{
        width: CARD_WIDTH,
        background: "#fff",
        borderRadius: 8,
        border: `1px solid ${selected ? BORDER_SELECTED : BORDER_COLOR}`,
        boxShadow: selected ? BOX_SHADOW_SELECTED : BOX_SHADOW,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "border-color 0.15s, box-shadow 0.15s",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {/* ── Header（FlowGram FormHeader 样式） ── */}
      <div
        style={{
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          width: "100%",
          columnGap: 8,
          borderRadius: "8px 8px 0 0",
          background: HEADER_BG,
          overflow: "hidden",
          padding: 10,
        }}
      >
        {/* 节点图标色块（24×24） */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: `${catConfig.color}20`,
            border: `1.5px solid ${catConfig.color}40`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {catConfig.icon}
        </div>

        {/* 节点名 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0f172a",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "20px",
            }}
          >
            {data.name || blockType.replace("rulego_", "")}
          </div>
        </div>

        {/* 分类标签 */}
        <span
          style={{
            fontSize: 11,
            color: catConfig.color,
            background: `${catConfig.color}15`,
            borderRadius: 4,
            padding: "2px 7px",
            fontWeight: 500,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {catConfig.label}
        </span>

        {data.debugMode && (
          <span style={{ fontSize: 10, color: "#f59e0b", background: "#fef3c7", borderRadius: 3, padding: "1px 5px", fontWeight: 600, flexShrink: 0 }}>
            DEBUG
          </span>
        )}
      </div>

      {/* ── Body（FlowGram FormContent 样式） ── */}
      {summary && (
        <div
          style={{
            boxSizing: "border-box",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: BODY_BG,
            borderRadius: "0 0 8px 8px",
            padding: "8px 12px 10px",
          }}
        >
          <div style={{ fontSize: 12, color: "rgba(6,7,9,0.55)", lineHeight: "18px", wordBreak: "break-all" }}>
            {summary}
          </div>
        </div>
      )}

      {/* ── 左侧入端口 ── */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          background: portColor,
          width: 10,
          height: 10,
          left: -5,
          top: "50%",
          transform: "translateY(-50%)",
          border: "2px solid #fff",
          borderRadius: "50%",
          transition: "background 0.15s",
        }}
      />

      {/* ── 右侧出端口 ── */}
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
              transition: "background 0.15s",
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
