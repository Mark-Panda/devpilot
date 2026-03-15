import { create } from "zustand";
import type { RouteRewriteRule } from "./types";

type RouteRewriteState = {
  rules: RouteRewriteRule[];
  setRules: (rules: RouteRewriteRule[]) => void;
  addRule: (rule: RouteRewriteRule) => void;
  updateRule: (id: string, patch: Partial<RouteRewriteRule>) => void;
  removeRule: (id: string) => void;
};

export const useRouteRewriteStore = create<RouteRewriteState>((set) => ({
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
}));
