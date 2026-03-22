/**
 * 单列可折叠积木库：分类在同一列展示，点击分类展开/折叠其下组件块，从积木库拖拽块类型到工作区添加。
 */
import { useState, useMemo } from "react";
import type { WorkspaceSvg } from "blockly/core";
import { toolbox as rulegoToolbox } from "./rulego-blocks";

export const DRAG_TYPE_BLOCK = "application/x-rulego-block-type";

const CATEGORY_STYLES: Record<string, { bg: string; border: string }> = {
  rulego_trigger: { bg: "rgba(239, 68, 68, 0.2)", border: "#ef4444" },
  rulego_action: { bg: "rgba(59, 130, 246, 0.2)", border: "#3b82f6" },
  rulego_condition: { bg: "rgba(20, 184, 166, 0.2)", border: "#14b8a6" },
  rulego_data: { bg: "rgba(245, 158, 11, 0.2)", border: "#f59e0b" },
  rulego_flow: { bg: "rgba(139, 92, 246, 0.2)", border: "#8b5cf6" },
  rulego_db: { bg: "rgba(13, 148, 136, 0.2)", border: "#0d9488" },
  rulego_file: { bg: "rgba(180, 83, 9, 0.2)", border: "#b45309" },
  rulego_tracer: { bg: "rgba(8, 145, 178, 0.2)", border: "#0891b2" },
};

const BLOCK_LABELS: Record<string, string> = {
  rulego_startTrigger: "开始",
  rulego_endpoint_http: "触发·HTTP",
  rulego_endpoint_ws: "触发·WebSocket",
  rulego_endpoint_mqtt: "触发·MQTT",
  rulego_endpoint_schedule: "触发·定时",
  rulego_endpoint_net: "触发·TCP/UDP",
  rulego_restApiCall: "HTTP客户端",
  rulego_llm: "大模型 LLM",
  rulego_delay: "延迟",
  rulego_jsTransform: "脚本转换器",
  rulego_jsFilter: "Filter",
  rulego_switch: "多条件分支",
  rulego_jsSwitch: "脚本路由",
  rulego_for: "循环",
  rulego_join: "汇聚",
  rulego_groupAction: "节点组",
  rulego_flow: "子规则链",
  rulego_ref: "节点引用",
  rulego_fork: "并行网关",
  rulego_break: "终止循环",
  rulego_dbClient: "数据库客户端",
  rulego_fileRead: "读文件",
  rulego_fileWrite: "写文件",
  rulego_fileDelete: "删文件",
  rulego_fileList: "列文件",
  rulego_apiRouteTracer_gitPrepare: "追踪·Git 工作区",
  rulego_apiRouteTracer_agentAnalyze: "追踪·Agent 分析",
  rulego_sourcegraphSearch: "Sourcegraph 搜索",
};

type CategoryItem = {
  id: string;
  name: string;
  categorystyle: string;
  blocks: Array<{ type: string }>;
};

function getLibraryCategories(): CategoryItem[] {
  const contents = rulegoToolbox.kind === "categoryToolbox" ? rulegoToolbox.contents : [];
  if (!Array.isArray(contents)) return [];
  return contents
    .filter((c): c is { kind: "category"; name: string; categorystyle: string; contents: Array<{ kind: "block"; type: string }> } => "name" in c && "contents" in c)
    .map((c) => ({
      id: c.name,
      name: c.name,
      categorystyle: c.categorystyle || "rulego_data",
      blocks: (c.contents || []).filter((b): b is { kind: "block"; type: string } => b.kind === "block" && !!b.type).map((b) => ({ type: b.type })),
    }));
}

type BlockLibraryPanelProps = {
  workspaceRef: React.RefObject<WorkspaceSvg | null>;
  searchKeyword?: string;
};

export function BlockLibraryPanel({ workspaceRef, searchKeyword = "" }: BlockLibraryPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const cats = getLibraryCategories();
    const init: Record<string, boolean> = {};
    cats.forEach((c) => {
      init[c.id] = true;
    });
    return init;
  });

  const categories = useMemo(() => getLibraryCategories(), []);

  const filteredCategories = useMemo(() => {
    const k = searchKeyword.trim().toLowerCase();
    if (!k) return categories;
    return categories
      .map((cat) => {
        const nameMatch = cat.name.toLowerCase().includes(k);
        const blocks = nameMatch
          ? cat.blocks
          : cat.blocks.filter((b) => (BLOCK_LABELS[b.type] || b.type).toLowerCase().includes(k));
        return { ...cat, blocks };
      })
      .filter((cat) => cat.blocks.length > 0 || cat.name.toLowerCase().includes(k));
  }, [categories, searchKeyword]);

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDragStart = (e: React.DragEvent, blockType: string) => {
    e.dataTransfer.setData(DRAG_TYPE_BLOCK, blockType);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="rulego-block-library-panel">
      {filteredCategories.map((cat) => {
        const isExpanded = expanded[cat.id];
        const style = CATEGORY_STYLES[cat.categorystyle] || CATEGORY_STYLES.rulego_data;
        return (
          <div key={cat.id} className="rulego-block-library-category">
            <button
              type="button"
              className="rulego-block-library-category-header"
              style={{ background: style.bg, borderLeftColor: style.border }}
              onClick={() => toggle(cat.id)}
              aria-expanded={isExpanded}
            >
              <span className="rulego-block-library-category-chevron" aria-hidden>
                {isExpanded ? "▼" : "▶"}
              </span>
              <span className="rulego-block-library-category-name">{cat.name}</span>
              <span className="rulego-block-library-category-count">{cat.blocks.length}</span>
            </button>
            {isExpanded && (
              <div className="rulego-block-library-blocks">
                {cat.blocks.map((b) => (
                  <div
                    key={b.type}
                    role="button"
                    tabIndex={0}
                    className="rulego-block-library-block-item rulego-block-library-block-item-draggable"
                    style={{ borderLeftColor: style.border }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, b.type)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") e.preventDefault();
                    }}
                  >
                    <span className="rulego-block-library-block-label">{BLOCK_LABELS[b.type] || b.type}</span>
                    <span className="rulego-block-library-block-drag-hint" aria-hidden>⋮⋮</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
