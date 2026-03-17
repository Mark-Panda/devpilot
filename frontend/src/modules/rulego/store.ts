import { create } from "zustand";
import type { RuleGoRule } from "./types";

type RuleGoState = {
  rules: RuleGoRule[];
  setRules: (rules: RuleGoRule[]) => void;
  addRule: (rule: RuleGoRule) => void;
  updateRule: (id: string, patch: Partial<RuleGoRule>) => void;
  removeRule: (id: string) => void;
  /** 已在引擎中加载的规则 ID，用于列表页“已开启/已关闭”展示，跨路由保持 */
  loadedRuleIds: Set<string>;
  setLoadedRuleIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
};

export const useRuleGoStore = create<RuleGoState>((set) => ({
  rules: [],
  setRules: (rules) => set({ rules }),
  addRule: (rule) => set((state) => ({ rules: [...state.rules, rule] })),
  updateRule: (id, patch) =>
    set((state) => ({
      rules: state.rules.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule
      ),
    })),
  removeRule: (id) =>
    set((state) => ({ rules: state.rules.filter((rule) => rule.id !== id) })),
  loadedRuleIds: new Set(),
  setLoadedRuleIds: (ids) =>
    set((state) => ({
      loadedRuleIds:
        typeof ids === "function" ? ids(state.loadedRuleIds) : ids,
    })),
}));
