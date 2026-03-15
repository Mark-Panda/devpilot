export type RouteRewriteRule = {
  id: string;
  route: string;
  method: string;
  source_domain: string;
  target_domain: string;
  created_at: string;
  updated_at: string;
};

export type CreateRouteRewriteInput = {
  route: string;
  method: string;
  source_domain: string;
  target_domain: string;
};

export type UpdateRouteRewriteInput = {
  route: string;
  method: string;
  source_domain: string;
  target_domain: string;
};
