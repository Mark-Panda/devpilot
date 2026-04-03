/**
 * 节点注册表
 * 
 * 所有节点类型的统一导出
 */

import type { RuleGoNodeRegistry } from '../types';
import { StartTriggerRegistry } from './start-trigger';
import { HttpTriggerRegistry } from './http-trigger';
import { RestApiCallRegistry } from './rest-api-call';
import { LlmRegistry } from './llm';
import { ForLoopRegistry } from './for-loop';
import { JsTransformRegistry } from './js-transform';
import { JsFilterRegistry } from './js-filter';
import { SwitchRegistry } from './switch';
import { ForkRegistry } from './fork';
import { JoinRegistry } from './join';
import { t43ActionRegistries } from './t43/actionNodes';
import { t43EndpointRegistries } from './t43/endpointTriggersT43';
import { GroupActionRegistry } from './group-action';
import { blockSentinelRegistries } from './block-sentinels';
import { t5TracerRegistries } from './t5/tracerNodes';
import { t5RpaRegistries } from './t5/rpaNodes';
import { t53ExtraRegistries } from './t5/t53ExtraNodes';
import { EXPECTED_REGISTRY_TOTAL, validateRulegoNodeRegistries } from './registryIntegrity';

/**
 * 所有 RuleGo 节点注册表
 * 当前: 43 个业务节点 + 2 个内部哨兵（含 T5.1–T5.3 追踪/RPA/扩展）
 */
export const rulegoNodeRegistries: RuleGoNodeRegistry[] = [
  StartTriggerRegistry,
  HttpTriggerRegistry,
  RestApiCallRegistry,
  LlmRegistry,
  ForLoopRegistry,
  JsTransformRegistry,
  JsFilterRegistry,
  SwitchRegistry,
  ForkRegistry,
  JoinRegistry,
  ...t43ActionRegistries,
  ...t43EndpointRegistries,
  GroupActionRegistry,
  ...t5TracerRegistries,
  ...t5RpaRegistries,
  ...t53ExtraRegistries,
  ...blockSentinelRegistries,
] as RuleGoNodeRegistry[];

const _registryIntegrity = validateRulegoNodeRegistries(rulegoNodeRegistries);
if (!_registryIntegrity.ok) {
  throw new Error(`[RuleGo] 节点注册表校验失败: ${_registryIntegrity.errors.join('; ')}`);
}
if (_registryIntegrity.count !== EXPECTED_REGISTRY_TOTAL) {
  throw new Error(
    `[RuleGo] 节点注册表数量 ${_registryIntegrity.count}，期望 ${EXPECTED_REGISTRY_TOTAL}（请同步 registryIntegrity.EXPECTED_REGISTRY_TOTAL）`
  );
}

for (const r of rulegoNodeRegistries) {
  if (!String(r.info?.icon ?? '').trim()) {
    throw new Error(`[RuleGo] 节点 ${r.type} 的 info.icon 不能为空（节点面板与清单依赖）`);
  }
}

const registryByFrontendType = new Map<string, RuleGoNodeRegistry>();
const registryByBackendType = new Map<string, RuleGoNodeRegistry>();
for (const r of rulegoNodeRegistries) {
  registryByFrontendType.set(r.type, r);
  registryByBackendType.set(r.backendNodeType, r);
}

/**
 * 根据前端节点类型获取注册表（O(1)，T7.4）
 */
export function getNodeRegistry(type: string): RuleGoNodeRegistry | undefined {
  return registryByFrontendType.get(type);
}

/**
 * 根据后端节点类型获取注册表
 */
export function getNodeRegistryByBackendType(backendType: string): RuleGoNodeRegistry | undefined {
  return registryByBackendType.get(backendType);
}
