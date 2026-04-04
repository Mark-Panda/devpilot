import { useEffect, useState } from "react";
import {
  createRuleGoRule,
  deleteRuleGoRule,
  generateSkillFromRuleChain,
  listRuleGoRules,
  loadRuleChain,
  loadRuleChainAllowDisabled,
  unloadRuleChain,
  updateRuleGoRule,
} from "./useRuleGoApi";
import { useRuleGoStore } from "./store";
import type { RuleGoRule } from "./types";

function pickOptionalStringField(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/** Wails/JSON 偶发字段名不一致时仍能取到规则 ID */
function ruleIdFromWailsModel(rule: unknown): string {
  if (!rule || typeof rule !== "object") return "";
  const r = rule as Record<string, unknown>;
  const v = r.id ?? r.ID ?? r.Id;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : "";
}

function pickEngineLoaded(rule: unknown): boolean {
  if (!rule || typeof rule !== "object") return false;
  const r = rule as Record<string, unknown>;
  const v = r.engine_loaded ?? r.engineLoaded;
  return v === true;
}

function mapWailsRuleToStore(rule: unknown): RuleGoRule {
  const id = ruleIdFromWailsModel(rule) || (rule as { id?: string }).id || "";
  const r = rule as Record<string, unknown>;
  const definition = typeof r.definition === "string" ? r.definition : "";
  return {
    id,
    definition,
    updatedAt: pickOptionalStringField(rule, "updated_at"),
    engineLoaded: pickEngineLoaded(rule),
  };
}

export type RuleGoInput = {
  definition: string;
};

export type UseRuleGoRulesOptions = {
  /** 为 true 时不自动 List（由页面自行决定首次/返回时如何 refresh，避免与 RuleGoPage 的 location.state 逻辑重复请求） */
  skipInitialLoad?: boolean;
};

export function useRuleGoRules(options?: UseRuleGoRulesOptions) {
  const { rules, setRules, addRule, updateRule, removeRule } = useRuleGoStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipInitialLoad = Boolean(options?.skipInitialLoad);

  /** silent：仅更新列表数据，不置 loading（用于开关等操作后拉取最新 engine_loaded，避免整表闪「加载中」） */
  const refresh = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await listRuleGoRules();
      const list = Array.isArray(data) ? data : [];
      setRules(list.map((rule) => mapWailsRuleToStore(rule)));
    } catch (err) {
      setError((err as Error).message || "加载失败");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const create = async (input: RuleGoInput): Promise<RuleGoRule> => {
    const result = await createRuleGoRule({
      definition: input.definition,
    });
    let id = ruleIdFromWailsModel(result);
    if (!id) {
      await refresh();
      const { rules: fresh } = useRuleGoStore.getState();
      const match = fresh.find((r) => r.definition.trim() === input.definition.trim());
      if (match) return match;
      console.error("[rulego] CreateRuleGoRule 返回无 id，且列表中未匹配到新建项", result);
      throw new Error("服务端未返回规则 ID，请到规则列表查看是否已创建");
    }
    const rule = mapWailsRuleToStore(result);
    addRule(rule);
    return rule;
  };

  const update = async (id: string, input: RuleGoInput) => {
    const result = await updateRuleGoRule(id, {
      definition: input.definition,
    });
    updateRule(id, mapWailsRuleToStore(result));
  };

  const remove = async (id: string) => {
    await deleteRuleGoRule(id);
    removeRule(id);
  };

  const loadChain = async (id: string) => {
    await loadRuleChain(id);
  };

  const loadChainAllowDisabled = async (id: string) => {
    await loadRuleChainAllowDisabled(id);
  };

  const unloadChain = async (id: string) => {
    await unloadRuleChain(id);
  };

  const generateSkill = async (
    ruleId: string,
    baseURL: string,
    apiKey: string,
    model: string,
    fallbackModels?: string[]
  ): Promise<string> => {
    return generateSkillFromRuleChain(ruleId, baseURL, apiKey, model, fallbackModels);
  };

  useEffect(() => {
    if (skipInitialLoad) return;
    void refresh();
  }, [skipInitialLoad]);

  return {
    rules,
    loading,
    error,
    refresh,
    create,
    update,
    remove,
    loadChain,
    loadChainAllowDisabled,
    unloadChain,
    generateSkill,
  };
}
