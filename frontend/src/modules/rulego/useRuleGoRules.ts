import { useEffect, useState } from "react";
import {
  createRuleGoRule,
  deleteRuleGoRule,
  listRuleGoRules,
  updateRuleGoRule,
} from "./useRuleGoApi";
import { useRuleGoStore } from "./store";

type RuleGoInput = {
  name: string;
  description: string;
  enabled: boolean;
  definition: string;
  editorJson: string;
};

export function useRuleGoRules() {
  const { rules, setRules, addRule, updateRule, removeRule } = useRuleGoStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRuleGoRules();
      const list = Array.isArray(data) ? data : [];
      setRules(
        list.map((rule) => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          enabled: rule.enabled,
          definition: rule.definition,
          editorJson: rule.editor_json,
        }))
      );
    } catch (err) {
      setError((err as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const create = async (input: RuleGoInput) => {
    const result = await createRuleGoRule({
      name: input.name,
      description: input.description,
      enabled: input.enabled,
      definition: input.definition,
      editor_json: input.editorJson,
    });
    addRule({
      id: result.id,
      name: result.name,
      description: result.description,
      enabled: result.enabled,
      definition: result.definition,
      editorJson: result.editor_json,
    });
  };

  const update = async (id: string, input: RuleGoInput) => {
    const result = await updateRuleGoRule(id, {
      name: input.name,
      description: input.description,
      enabled: input.enabled,
      definition: input.definition,
      editor_json: input.editorJson,
    });
    updateRule(id, {
      name: result.name,
      description: result.description,
      enabled: result.enabled,
      definition: result.definition,
      editorJson: result.editor_json,
    });
  };

  const remove = async (id: string) => {
    await deleteRuleGoRule(id);
    removeRule(id);
  };

  useEffect(() => {
    refresh();
  }, []);

  return { rules, loading, error, refresh, create, update, remove };
}
