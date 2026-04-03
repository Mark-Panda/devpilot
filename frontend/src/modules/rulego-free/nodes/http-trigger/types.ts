/**
 * HTTP Endpoint（metadata.endpoints）
 * 与 `rulego-blocks/blocks/endpointTriggers.ts` 中 HTTP 的 getEndpointDsl 结构一致
 */

export interface HttpTriggerData {
  /** 显示名称 */
  name: string;
  /** 监听地址，如 :9090 */
  server: string;
  allowCors: boolean;
  /** 主路由 id，可空则按 path 生成 */
  routerId: string;
  method: string;
  path: string;
  /** 目标链，如 chain:default */
  to: string;
  wait: boolean;
  /** 逗号分隔 processor 名 */
  toProcessors: string;
  /** 额外 routers 的 JSON 数组字符串 */
  extraRoutersJson: string;
}
