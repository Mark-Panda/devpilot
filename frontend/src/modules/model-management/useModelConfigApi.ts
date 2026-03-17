import {
  CreateModelConfig,
  DeleteModelConfig,
  ListModelConfigs,
  UpdateModelConfig,
} from "../../../wailsjs/go/model_management/Service";
import type { ModelConfig as ApiModelConfig } from "../../../wailsjs/go/models";
import type { ModelConfig } from "./types";

type CreateModelConfigInput = {
  base_url: string;
  api_key: string;
  site_description: string;
  models: string[];
};

type UpdateModelConfigInput = CreateModelConfigInput;

function mapApiToConfig(c: ApiModelConfig): ModelConfig {
  return {
    id: c.id,
    baseUrl: c.base_url,
    apiKey: c.api_key,
    siteDescription: c.site_description ?? "",
    models: Array.isArray(c.models) ? c.models : [],
  };
}

export async function listModelConfigs(): Promise<ModelConfig[]> {
  const list = await ListModelConfigs();
  return (list ?? []).map(mapApiToConfig);
}

export async function createModelConfig(input: CreateModelConfigInput): Promise<ModelConfig> {
  const result = await CreateModelConfig(input);
  return mapApiToConfig(result);
}

export async function updateModelConfig(
  id: string,
  input: UpdateModelConfigInput
): Promise<ModelConfig> {
  const result = await UpdateModelConfig(id, input);
  return mapApiToConfig(result);
}

export async function deleteModelConfig(id: string): Promise<void> {
  return DeleteModelConfig(id);
}
