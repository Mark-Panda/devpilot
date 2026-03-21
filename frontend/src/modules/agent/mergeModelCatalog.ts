import type { ModelOption } from './modelApi'
import type { ModelConfig } from './types'

/**
 * 若当前 model_config 与模型管理里某条目（同 base_url + 主模型）匹配，则用该条目的故障转移列表覆盖 models。
 * 这样在模型管理中新增/调整备用模型后，用户只需在 Agent 管理里重新保存一次即可同步到运行时 LLM 客户端。
 */
export function mergeFailoverModelsFromCatalog(mc: ModelConfig, catalog: ModelOption[]): ModelConfig {
  const opt = catalog.find((o) => o.model === mc.model && o.baseUrl === mc.base_url)
  if (!opt) return mc
  const extras = opt.failoverModels.filter((m) => m !== opt.model)
  return {
    ...mc,
    models: extras.length > 0 ? extras : undefined,
  }
}
