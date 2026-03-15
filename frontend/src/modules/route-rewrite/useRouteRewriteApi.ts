import {
  CreateRouteRewriteRule,
  DeleteRouteRewriteRule,
  ListRouteRewriteRules,
  UpdateRouteRewriteRule,
} from "../../../wailsjs/go/route_rewrite/Service";
import type { RouteRewriteRule } from "../../../wailsjs/go/models";

type CreateRouteRewriteInput = {
  route: string;
  method: string;
  source_domain: string;
  target_domain: string;
};

type UpdateRouteRewriteInput = CreateRouteRewriteInput;

export async function listRouteRewriteRules(): Promise<RouteRewriteRule[]> {
  return ListRouteRewriteRules();
}

export async function createRouteRewriteRule(
  input: CreateRouteRewriteInput
): Promise<RouteRewriteRule> {
  return CreateRouteRewriteRule(input);
}

export async function updateRouteRewriteRule(
  id: string,
  input: UpdateRouteRewriteInput
): Promise<RouteRewriteRule> {
  return UpdateRouteRewriteRule(id, input);
}

export async function deleteRouteRewriteRule(id: string): Promise<void> {
  return DeleteRouteRewriteRule(id);
}
