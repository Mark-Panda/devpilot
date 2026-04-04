/** 与后端 models.RuleGoRule 一致：持久化与 API 仅 id + definition + updated_at，展示字段从 definition 解析 */
export type RuleGoRule = {
  id: string;
  definition: string;
  updatedAt?: string;
};
