import { useEffect, useState } from "react";
import {
  createModelConfig,
  deleteModelConfig,
  listModelConfigs,
  updateModelConfig,
} from "./useModelConfigApi";
import { useModelConfigStore } from "./store";

export function useModelConfigs() {
  const { configs, setConfigs, addConfig, updateConfig, removeConfig } =
    useModelConfigStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listModelConfigs();
      const list = Array.isArray(data) ? data : [];
      setConfigs(
        list.map((config) => ({
          id: config.id,
          baseUrl: config.base_url,
          model: config.model,
          apiKey: config.api_key,
        }))
      );
    } catch (err) {
      setError((err as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const create = async (input: { baseUrl: string; model: string; apiKey: string }) => {
    const result = await createModelConfig({
      base_url: input.baseUrl,
      model: input.model,
      api_key: input.apiKey,
    });
    addConfig({
      id: result.id,
      baseUrl: result.base_url,
      model: result.model,
      apiKey: result.api_key,
    });
  };

  const update = async (
    id: string,
    input: { baseUrl: string; model: string; apiKey: string }
  ) => {
    const result = await updateModelConfig(id, {
      base_url: input.baseUrl,
      model: input.model,
      api_key: input.apiKey,
    });
    updateConfig(id, {
      baseUrl: result.base_url,
      model: result.model,
      apiKey: result.api_key,
    });
  };

  const remove = async (id: string) => {
    await deleteModelConfig(id);
    removeConfig(id);
  };

  useEffect(() => {
    refresh();
  }, []);

  return { configs, loading, error, refresh, create, update, remove };
}
