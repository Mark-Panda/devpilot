/**
 * 节点类型映射表
 * 
 * 前端节点类型 ↔ 后端节点类型
 */

export const NODE_TYPE_MAPPING: Record<string, string> = {
  // 触发器
  'start-trigger': 'startTrigger',
  'http-trigger': 'endpoint/http',
  /** 与 Blockly / RuleGo metadata.endpoints 的 type 字段一致（如 endpoint/ws） */
  'ws-trigger': 'endpoint/ws',
  'mqtt-trigger': 'endpoint/mqtt',
  'schedule-trigger': 'endpoint/schedule',
  'net-trigger': 'endpoint/net',
  
  // 动作
  'rest-api-call': 'restApiCall',
  'llm': 'ai/llm',
  'feishu-message': 'feishu/imMessage',
  'volc-tls-search': 'volcTls/searchLogs',
  'opensearch-search': 'opensearch/search',
  'delay': 'delay',
  'exec-command': 'exec',
  
  // 数据处理
  'for-loop': 'for',
  'join': 'join',
  'group-action': 'groupAction',
  'js-transform': 'jsTransform',
  'js-filter': 'jsFilter',
  
  // 条件判断
  'switch': 'switch',
  'js-switch': 'jsSwitch',
  
  // 流程控制
  'flow': 'flow',
  'ref': 'ref',
  'fork': 'fork',
  'break': 'break',
  
  // 数据库
  'db-client': 'dbClient',
  
  // 文件
  'file-read': 'x/fileRead',
  'file-write': 'x/fileWrite',
  'file-delete': 'x/fileDelete',
  'file-list': 'x/fileList',
  
  // 追踪
  'git-prepare': 'apiRouteTracer/gitPrepare',
  'cursor-acp': 'cursor/acp',
  'cursor-acp-agent': 'cursor/acp_agent',
  'cursor-acp-agent-step': 'cursor/acp_agent_step',
  'sourcegraph-query-build': 'sourcegraph/queryBuild',
  'sourcegraph-search': 'sourcegraph/search',
  
  // RPA
  'rpa-browser-navigate': 'x/rpaBrowserNavigate',
  'rpa-browser-click': 'x/rpaBrowserClick',
  'rpa-browser-screenshot': 'x/rpaBrowserScreenshot',
  'rpa-browser-query': 'x/rpaBrowserQuery',
  'rpa-ocr': 'x/rpaOcr',
  'rpa-screen-capture': 'x/rpaScreenCapture',
  'rpa-mac-window': 'x/rpaMacWindow',
  'rpa-desktop-click': 'x/rpaDesktopClick',
  
  // 内部节点
  'block-start': 'internal:block-start',
  'block-end': 'internal:block-end',
} as const;

/**
 * 反向映射：后端 → 前端
 */
export const BACKEND_TO_FRONTEND_MAPPING = {
  ...Object.fromEntries(Object.entries(NODE_TYPE_MAPPING).map(([k, v]) => [v, k])),
  /** 旧文档/别名，与 Blockly DSL 中 `endpoint/http` 等价指向 http-trigger */
  'endpoint:http': 'http-trigger',
  /** 历史别名 colon 形式 */
  'endpoint:ws': 'ws-trigger',
  'endpoint:mqtt': 'mqtt-trigger',
  'endpoint:schedule': 'schedule-trigger',
  'endpoint:net': 'net-trigger',
} as Record<string, string>;

/**
 * 获取前端节点类型
 */
export function getFrontendNodeType(backendType: string): string | undefined {
  return BACKEND_TO_FRONTEND_MAPPING[backendType];
}

/**
 * 获取后端节点类型
 */
export function getBackendNodeType(frontendType: string): string | undefined {
  return NODE_TYPE_MAPPING[frontendType as keyof typeof NODE_TYPE_MAPPING];
}
