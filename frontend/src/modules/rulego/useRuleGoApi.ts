import {
  CreateRuleGoRule,
  DeleteExecutionLog,
  DeleteRuleGoRule,
  DeleteSkillForRuleChain,
  ExecuteRule,
  ExecuteRuleDefinition,
  GenerateRuleGoPlan,
  GenerateSkillFromRuleChain,
  GetExecutionLog,
  GetRuleGoRule,
  ListAvailableSkills,
  ListExecutionLogs,
  ListRuleGoRules,
  LoadRuleChain,
  StartExecuteRule,
  UnloadRuleChain,
  UpdateRuleGoRule,
} from "../../../wailsjs/go/rulego/Service";
import type { models } from "../../../wailsjs/go/models";

type RuleGoRule = models.RuleGoRule;
export type RuleGoExecutionLog = models.RuleGoExecutionLog;
export type RuleGoExecutionNodeLog = models.RuleGoExecutionNodeLog;

type CreateRuleGoRuleInput = {
  name: string;
  description: string;
  definition: string;
  editor_json: string;
  request_metadata_params_json: string;
  request_message_body_params_json: string;
};

type UpdateRuleGoRuleInput = CreateRuleGoRuleInput;

export async function listRuleGoRules(): Promise<RuleGoRule[]> {
  return ListRuleGoRules();
}

export async function createRuleGoRule(input: CreateRuleGoRuleInput): Promise<RuleGoRule> {
  return CreateRuleGoRule(input);
}

export async function updateRuleGoRule(
  id: string,
  input: UpdateRuleGoRuleInput
): Promise<RuleGoRule> {
  return UpdateRuleGoRule(id, input);
}

export async function deleteRuleGoRule(id: string): Promise<void> {
  return DeleteRuleGoRule(id);
}

export async function getRuleGoRule(id: string): Promise<RuleGoRule> {
  return GetRuleGoRule(id);
}

export type ExecuteRuleInput = {
  message_type?: string;
  metadata?: Record<string, string>;
  data?: string;
};

export type ExecuteRuleOutput = {
  success: boolean;
  data: string;
  error: string;
  elapsed: number;
  execution_id?: string;
};

export async function executeRuleGoRule(
  ruleId: string,
  input: ExecuteRuleInput
): Promise<ExecuteRuleOutput> {
  const res = await ExecuteRule(ruleId, {
    message_type: input.message_type ?? "default",
    metadata: input.metadata ?? {},
    data: input.data ?? "{}",
  });
  return {
    success: res.success,
    data: res.data ?? "",
    error: res.error ?? "",
    elapsed: res.elapsed ?? 0,
    execution_id: res.execution_id ?? "",
  };
}

/** 异步启动规则链执行，立即返回 execution_id，供轮询 GetExecutionLog 查看节点进度 */
export async function startExecuteRuleGoRule(
  ruleId: string,
  input: ExecuteRuleInput
): Promise<{ execution_id: string }> {
  const res = await StartExecuteRule(ruleId, {
    message_type: input.message_type ?? "default",
    metadata: input.metadata ?? {},
    data: input.data ?? "{}",
  });
  return { execution_id: res.execution_id ?? "" };
}

/** 使用给定规则链定义执行一次（模拟测试），不写入数据库，用于可视化编辑器调试 */
export async function executeRuleGoRuleByDefinition(
  definition: string,
  input: ExecuteRuleInput
): Promise<ExecuteRuleOutput> {
  return ExecuteRuleDefinition(definition, {
    message_type: input.message_type ?? "default",
    metadata: input.metadata ?? {},
    data: input.data ?? "{}",
  });
}

/** 将指定规则链加载到引擎池（仅已启用且定义非空时可加载） */
export async function loadRuleChain(ruleId: string): Promise<void> {
  return LoadRuleChain(ruleId);
}

/** 从引擎池卸载指定规则链 */
export async function unloadRuleChain(ruleId: string): Promise<void> {
  return UnloadRuleChain(ruleId);
}

/** 分页查询执行日志 */
export async function listExecutionLogs(
  limit: number,
  offset: number
): Promise<{ items: RuleGoExecutionLog[]; total: number }> {
  const res = await ListExecutionLogs(limit, offset);
  return { items: res.items ?? [], total: res.total ?? 0 };
}

/** 获取单条执行日志及节点步骤 */
export async function getExecutionLog(
  executionId: string
): Promise<{ log: RuleGoExecutionLog; nodes: RuleGoExecutionNodeLog[] }> {
  const res = await GetExecutionLog(executionId);
  return { log: res.log, nodes: res.nodes ?? [] };
}

/** 删除一条执行日志及其节点步骤 */
export async function deleteExecutionLog(executionId: string): Promise<void> {
  return DeleteExecutionLog(executionId);
}

/** ~/.devpilot/skills/ 下可勾选启用的技能项（供 LLM 节点配置使用） */
export type AvailableSkillItem = { name: string; description: string };

/** 列出默认技能目录下所有 SKILL.md 的 name/description，供 LLM 节点勾选启用 */
export async function listAvailableSkills(): Promise<AvailableSkillItem[]> {
  return ListAvailableSkills();
}

/** 使用大模型根据规则链 DSL 生成技能并写入 ~/.devpilot/skills/，需传入模型 baseURL、apiKey、model；models 为可选备用模型链 */
export async function generateSkillFromRuleChain(
  ruleId: string,
  baseURL: string,
  apiKey: string,
  model: string,
  fallbackModels?: string[]
): Promise<string> {
  return GenerateSkillFromRuleChain(ruleId, baseURL, apiKey, model, fallbackModels ?? []);
}

/** 删除规则链关联的技能目录（禁用/删除规则链时由后端自动调用，也可前端主动调用） */
export async function deleteSkillForRuleChain(ruleId: string): Promise<void> {
  return DeleteSkillForRuleChain(ruleId);
}

export type GenerateRuleGoPlanInput = {
  prompt: string;
  current_dsl?: string;
  node_types?: string[];
  conversation_history?: Array<{ role: string; content: string }>;
  base_url?: string;
  api_key?: string;
  model?: string;
  fallback_models?: string[];
};

export type GenerateRuleGoPlanResult = {
  nodes: Array<{
    id?: string;
    node_type: string;
    name?: string;
    configuration?: Record<string, unknown>;
    confidence?: number;
    reason?: string;
  }>;
  edges: Array<{
    from_id: string;
    to_id: string;
    type?: string;
    confidence?: number;
    reason?: string;
  }>;
  warnings?: string[];
  overall_confidence?: number;
  thought?: string;
  questions?: string[];
  need_clarification?: boolean;
  raw_response?: string;
};

export async function generateRuleGoPlan(input: GenerateRuleGoPlanInput): Promise<GenerateRuleGoPlanResult> {
  return GenerateRuleGoPlan({
    prompt: input.prompt,
    current_dsl: input.current_dsl ?? "",
    node_types: input.node_types ?? [],
    conversation_history: input.conversation_history ?? [],
    base_url: input.base_url ?? "",
    api_key: input.api_key ?? "",
    model: input.model ?? "",
    fallback_models: input.fallback_models ?? [],
  });
}
