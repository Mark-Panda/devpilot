/** 与后端 models.RuleGoRule 一致；展示字段从 definition 解析；engineLoaded 仅 API 返回（运行池是否已加载/重载成功） */
export type RuleGoRule = {
  id: string;
  definition: string;
  updatedAt?: string;
  engineLoaded?: boolean;
};
