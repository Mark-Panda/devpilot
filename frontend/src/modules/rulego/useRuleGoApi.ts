import {
  CreateRuleGoRule,
  DeleteRuleGoRule,
  ListRuleGoRules,
  UpdateRuleGoRule,
} from "../../../wailsjs/go/rulego/Service";
import type { RuleGoRule } from "../../../wailsjs/go/models";

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
