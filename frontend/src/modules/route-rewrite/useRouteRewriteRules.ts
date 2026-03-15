import { useEffect, useState } from "react";
import {
  createRouteRewriteRule,
  deleteRouteRewriteRule,
  listRouteRewriteRules,
  updateRouteRewriteRule,
} from "./useRouteRewriteApi";
import { useRouteRewriteStore } from "./store";

export function useRouteRewriteRules() {
  const { rules, setRules, addRule, updateRule, removeRule } =
    useRouteRewriteStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRouteRewriteRules();
      const list = Array.isArray(data) ? data : [];
      setRules(list.map((rule) => ({
        id: rule.id,
        route: rule.route,
        method: rule.method as any,
        sourceDomain: rule.source_domain,
        targetDomain: rule.target_domain,
      })));
    } catch (err) {
      setError((err as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const create = async (input: CreateRouteRewriteInput) => {
    const result = await createRouteRewriteRule(input);
    addRule({
      id: result.id,
      route: result.route,
      method: result.method as any,
      sourceDomain: result.source_domain,
      targetDomain: result.target_domain,
    });
  };

  const update = async (id: string, input: UpdateRouteRewriteInput) => {
    const result = await updateRouteRewriteRule(id, input);
    updateRule(id, {
      route: result.route,
      method: result.method as any,
      sourceDomain: result.source_domain,
      targetDomain: result.target_domain,
    });
  };

  const remove = async (id: string) => {
    await deleteRouteRewriteRule(id);
    removeRule(id);
  };

  useEffect(() => {
    refresh();
  }, []);

  return { rules, loading, error, refresh, create, update, remove };
}
