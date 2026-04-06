/**
 * 单列可折叠积木库：分类在同一列展示，点击分类展开/折叠其下组件块，从积木库拖拽块类型到工作区添加。
 */
import { useState, useMemo } from "react";
import type { WorkspaceSvg } from "blockly/core";
import { toolbox as rulegoToolbox } from "./rulego-blocks";

export const DRAG_TYPE_BLOCK = "application/x-rulego-block-type";

/** 与浅色侧栏搭配：纯色浅底 + 饱和描边，避免半透明叠在灰底上发污、字不清晰 */
const CATEGORY_STYLES: Record<string, { bg: string; border: string }> = {
  rulego_trigger: { bg: "#fee2e2", border: "#dc2626" },
  rulego_action: { bg: "#dbeafe", border: "#2563eb" },
  rulego_condition: { bg: "#ccfbf1", border: "#0d9488" },
  rulego_data: { bg: "#fef3c7", border: "#d97706" },
  rulego_flow: { bg: "#ede9fe", border: "#7c3aed" },
  rulego_db: { bg: "#ccfbf1", border: "#0f766e" },
  rulego_file: { bg: "#ffedd5", border: "#c2410c" },
  rulego_tracer: { bg: "#cffafe", border: "#0891b2" },
  rulego_rpa: { bg: "#e0e7ff", border: "#4f46e5" },
};

const BLOCK_LABELS: Record<string, string> = {
  rulego_startTrigger: "触发-手动开始",
  rulego_endpoint_http: "触发·HTTP",
  rulego_endpoint_ws: "触发·WebSocket",
  rulego_endpoint_mqtt: "触发·MQTT",
  rulego_endpoint_schedule: "触发·定时",
  rulego_endpoint_net: "触发·TCP/UDP",
  rulego_restApiCall: "HTTP客户端",
  rulego_feishuImMessage: "飞书单聊消息",
  rulego_volcTlsSearchLogs: "火山 TLS 查日志",
  rulego_opensearchSearch: "OpenSearch 查日志",
  rulego_llm: "大模型 LLM",
  rulego_delay: "延迟",
  rulego_execCommand: "执行命令",
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
  rulego_cursorCli: "追踪·Cursor CLI",
  rulego_cursorAcp: "追踪·Cursor ACP",
  rulego_cursorAcpAgent: "追踪·Cursor ACP Agent",
  rulego_cursorAcpAgentStep: "追踪·ACP Agent 单步",
  rulego_sourcegraphQueryBuild: "Sourcegraph·查询构建",
  rulego_sourcegraphSearch: "Sourcegraph 搜索",
  rulego_rpaBrowserNavigate: "RPA·浏览器打开",
  rulego_rpaBrowserClick: "RPA·浏览器点击",
  rulego_rpaBrowserScreenshot: "RPA·浏览器截图",
  rulego_rpaBrowserQuery: "RPA·选择器查询",
  rulego_rpaOcr: "RPA·OCR",
  rulego_rpaScreenCapture: "RPA·屏幕截图",
  rulego_rpaMacWindow: "RPA·macOS 窗口",
  rulego_rpaDesktopClick: "RPA·桌面点击",
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
      {filteredCategories.length === 0 ? (
        <p className="rulego-block-library-empty">
          {searchKeyword.trim() ? "无匹配的积木或分类，请调整搜索词" : "暂无积木分类"}
        </p>
      ) : null}
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
