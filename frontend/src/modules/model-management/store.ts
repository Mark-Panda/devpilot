import { create } from "zustand";
import type { ModelConfig } from "./types";

type ModelConfigState = {
  configs: ModelConfig[];
  setConfigs: (configs: ModelConfig[]) => void;
  addConfig: (config: ModelConfig) => void;
  updateConfig: (id: string, patch: Partial<ModelConfig>) => void;
  removeConfig: (id: string) => void;
};

export const useModelConfigStore = create<ModelConfigState>((set) => ({
  configs: [],
  setConfigs: (configs) => set({ configs }),
  addConfig: (config) => set((state) => ({ configs: [...state.configs, config] })),
  updateConfig: (id, patch) =>
    set((state) => ({
      configs: state.configs.map((config) =>
        config.id === id ? { ...config, ...patch } : config
      ),
    })),
  removeConfig: (id) =>
    set((state) => ({ configs: state.configs.filter((config) => config.id !== id) })),
}));
