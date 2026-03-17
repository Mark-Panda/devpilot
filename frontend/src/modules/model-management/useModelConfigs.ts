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
      const list = await listModelConfigs();
      setConfigs(list);
    } catch (err) {
      setError((err as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const create = async (input: {
    baseUrl: string;
    apiKey: string;
    siteDescription: string;
    models: string[];
  }) => {
    const result = await createModelConfig({
      base_url: input.baseUrl,
      api_key: input.apiKey,
      site_description: input.siteDescription,
      models: input.models,
    });
    addConfig(result);
  };

  const update = async (
    id: string,
    input: { baseUrl: string; apiKey: string; siteDescription: string; models: string[] }
  ) => {
    const result = await updateModelConfig(id, {
      base_url: input.baseUrl,
      api_key: input.apiKey,
      site_description: input.siteDescription,
      models: input.models,
    });
    updateConfig(id, result);
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
