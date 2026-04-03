/**
 * 节点类型常量定义
 */

// 触发器类
export enum TriggerNodeType {
  Start = 'start-trigger',
  Http = 'http-trigger',
  WebSocket = 'ws-trigger',
  Mqtt = 'mqtt-trigger',
  Schedule = 'schedule-trigger',
  Net = 'net-trigger',
}

// 动作类
export enum ActionNodeType {
  RestApiCall = 'rest-api-call',
  Llm = 'llm',
  FeishuMessage = 'feishu-message',
  VolcTlsSearch = 'volc-tls-search',
  OpenSearchSearch = 'opensearch-search',
  Delay = 'delay',
  ExecCommand = 'exec-command',
}

// 条件判断类
export enum ConditionNodeType {
  Switch = 'switch',
  JsSwitch = 'js-switch',
}

// 数据处理类
export enum DataNodeType {
  ForLoop = 'for-loop',
  Join = 'join',
  GroupAction = 'group-action',
  JsTransform = 'js-transform',
  JsFilter = 'js-filter',
}

// 流程控制类
export enum FlowNodeType {
  Flow = 'flow',
  Ref = 'ref',
  Fork = 'fork',
  Break = 'break',
}

// 数据库类
export enum DbNodeType {
  DbClient = 'db-client',
}

// 文件类
export enum FileNodeType {
  FileRead = 'file-read',
  FileWrite = 'file-write',
  FileDelete = 'file-delete',
  FileList = 'file-list',
}

// 追踪类
export enum TracerNodeType {
  GitPrepare = 'git-prepare',
  CursorAcp = 'cursor-acp',
  CursorAcpAgent = 'cursor-acp-agent',
  CursorAcpAgentStep = 'cursor-acp-agent-step',
  SourcegraphQueryBuild = 'sourcegraph-query-build',
  SourcegraphSearch = 'sourcegraph-search',
}

// RPA 类
export enum RpaNodeType {
  RpaBrowserNavigate = 'rpa-browser-navigate',
  RpaBrowserClick = 'rpa-browser-click',
  RpaBrowserScreenshot = 'rpa-browser-screenshot',
  RpaBrowserQuery = 'rpa-browser-query',
  RpaOcr = 'rpa-ocr',
  RpaScreenCapture = 'rpa-screen-capture',
  RpaMacWindow = 'rpa-mac-window',
  RpaDesktopClick = 'rpa-desktop-click',
}

// 内部节点
export enum InternalNodeType {
  BlockStart = 'block-start',
  BlockEnd = 'block-end',
}

// 节点分类
export type RuleGoCategory = 
  | 'trigger'
  | 'action'
  | 'condition'
  | 'data'
  | 'flow'
  | 'db'
  | 'file'
  | 'tracer'
  | 'rpa';
