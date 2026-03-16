import {
  CreateRuleGoRule,
  DeleteRuleGoRule,
  ExecuteRule,
  GetRuleGoRule,
  ListRuleGoRules,
  LoadRuleChain,
  UnloadRuleChain,
  UpdateRuleGoRule,
} from "../../../wailsjs/go/rulego/Service";
import type { models } from "../../../wailsjs/go/models";

type RuleGoRule = models.RuleGoRule;

type CreateRuleGoRuleInput = {
  name: string;
  description: string;
  enabled: boolean;
  definition: string;
  editor_json: string;
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
};

export async function executeRuleGoRule(
  ruleId: string,
  input: ExecuteRuleInput
): Promise<ExecuteRuleOutput> {
  return ExecuteRule(ruleId, {
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
