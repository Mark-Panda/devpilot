export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type RouteRewriteRule = {
  id: string;
  route: string;
  method: HttpMethod;
  sourceDomain: string;
  targetDomain: string;
};
