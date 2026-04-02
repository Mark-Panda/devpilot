/** 节点分类颜色与标签配置 */
export const CATEGORY_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  rulego_trigger:   { color: "#f43f5e", label: "触发器",  icon: "⚡" },
  rulego_action:    { color: "#3b82f6", label: "动作",    icon: "▶" },
  rulego_condition: { color: "#0ea5e9", label: "条件",    icon: "◇" },
  rulego_data:      { color: "#f59e0b", label: "数据处理", icon: "⟳" },
  rulego_flow:      { color: "#8b5cf6", label: "流程控制", icon: "⊞" },
  rulego_db:        { color: "#10b981", label: "数据库",  icon: "◉" },
  rulego_file:      { color: "#b45309", label: "文件",    icon: "◫" },
  rulego_tracer:    { color: "#06b6d4", label: "追踪",    icon: "◎" },
  rulego_rpa:       { color: "#6366f1", label: "RPA",     icon: "◈" },
};

/** blockType → category 映射 */
export const BLOCK_TYPE_CATEGORY: Record<string, string> = {
  rulego_startTrigger:          "rulego_trigger",
  rulego_endpoint_http:         "rulego_trigger",
  rulego_endpoint_ws:           "rulego_trigger",
  rulego_endpoint_mqtt:         "rulego_trigger",
  rulego_endpoint_schedule:     "rulego_trigger",
  rulego_endpoint_net:          "rulego_trigger",
  rulego_restApiCall:           "rulego_action",
  rulego_feishuImMessage:       "rulego_action",
  rulego_volcTlsSearchLogs:     "rulego_action",
  rulego_opensearchSearch:      "rulego_action",
  rulego_llm:                   "rulego_action",
  rulego_delay:                 "rulego_action",
  rulego_execCommand:           "rulego_action",
  rulego_jsTransform:           "rulego_action",
  rulego_jsFilter:              "rulego_condition",
  rulego_switch:                "rulego_condition",
  rulego_jsSwitch:              "rulego_condition",
  rulego_for:                   "rulego_data",
  rulego_join:                  "rulego_data",
  rulego_groupAction:           "rulego_data",
  rulego_flow:                  "rulego_flow",
  rulego_ref:                   "rulego_flow",
  rulego_fork:                  "rulego_flow",
  rulego_break:                 "rulego_flow",
  rulego_dbClient:              "rulego_db",
  rulego_fileRead:              "rulego_file",
  rulego_fileWrite:             "rulego_file",
  rulego_fileDelete:            "rulego_file",
  rulego_fileList:              "rulego_file",
  rulego_apiRouteTracer_gitPrepare: "rulego_tracer",
  rulego_cursorAcp:             "rulego_tracer",
  rulego_cursorAcpAgent:        "rulego_tracer",
  rulego_cursorAcpAgentStep:    "rulego_tracer",
  rulego_sourcegraphQueryBuild: "rulego_tracer",
  rulego_sourcegraphSearch:     "rulego_tracer",
  rulego_rpaBrowserNavigate:    "rulego_rpa",
  rulego_rpaBrowserClick:       "rulego_rpa",
  rulego_rpaBrowserScreenshot:  "rulego_rpa",
  rulego_rpaBrowserQuery:       "rulego_rpa",
  rulego_rpaOcr:                "rulego_rpa",
  rulego_rpaScreenCapture:      "rulego_rpa",
  rulego_rpaMacWindow:          "rulego_rpa",
  rulego_rpaDesktopClick:       "rulego_rpa",
};

export function getCategoryConfig(blockType: string) {
  const cat = BLOCK_TYPE_CATEGORY[blockType] ?? "rulego_action";
  return CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.rulego_action;
}
