import {
  CreateModelConfig,
  DeleteModelConfig,
  ListModelConfigs,
  UpdateModelConfig,
} from "../../../wailsjs/go/model_management/Service";
import type { ModelConfig } from "../../../wailsjs/go/models";

type CreateModelConfigInput = {
  base_url: string;
  model: string;
  api_key: string;
};

type UpdateModelConfigInput = CreateModelConfigInput;

export async function listModelConfigs(): Promise<ModelConfig[]> {
  return ListModelConfigs();
}

export async function createModelConfig(input: CreateModelConfigInput): Promise<ModelConfig> {
  return CreateModelConfig(input);
}

export async function updateModelConfig(
  id: string,
  input: UpdateModelConfigInput
): Promise<ModelConfig> {
  return UpdateModelConfig(id, input);
}

export async function deleteModelConfig(id: string): Promise<void> {
  return DeleteModelConfig(id);
}
