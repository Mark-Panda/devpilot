// 模型管理 API 封装

export interface ModelConfig {
  id: string
  base_url: string
  api_key: string
  site_description: string
  models: string[]
  created_at?: string
  updated_at?: string
}

export interface ModelOption {
  configId: string
  baseUrl: string
  apiKey: string
  model: string
  displayName: string
  /** 同站点下故障转移顺序：当前选项的 model 优先，其余按模型管理中的列出顺序 */
  failoverModels: string[]
}

// 导入 Wails 生成的绑定
import * as ModelService from '../../../wailsjs/go/model_management/Service'

export const modelManagementApi = {
  // 列出所有模型配置
  listConfigs: async (): Promise<ModelConfig[]> => {
    return await ModelService.ListModelConfigs()
  },

  // 获取所有可用模型选项(展平)
  getAllModelOptions: async (): Promise<ModelOption[]> => {
    const configs = await ModelService.ListModelConfigs()
    const options: ModelOption[] = []
    
    configs.forEach((config) => {
      config.models.forEach((model) => {
        const failoverModels = [model, ...config.models.filter((m) => m !== model)]
        options.push({
          configId: config.id,
          baseUrl: config.base_url,
          apiKey: config.api_key ?? '',
          model: model,
          displayName: `${config.site_description} - ${model}`,
          failoverModels,
        })
      })
    })
    
    return options
  },
}
