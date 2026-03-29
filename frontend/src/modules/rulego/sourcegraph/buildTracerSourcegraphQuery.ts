/**
 * 与 api-route-tracer-frontend/scripts/sourcegraph_search.py、后端 sourcegraph_tracer_query.go 对齐的查询串拼装。
 * 供 Sourcegraph 查询构建块与配置预览使用。
 */

export const DEFAULT_SOURCEGRAPH_REPO_FRONTEND = "teacher/fe/.*|frontend/.*";
export const DEFAULT_SOURCEGRAPH_REPO_BACKEND = "teacher/backend/.*|backend/.*";

export type TracerRepoScope = "" | "frontend" | "backend";

export type BuildTracerSourcegraphQueryParts = {
  contextGlobal?: boolean;
  typeFilter?: string;
  repoScope?: TracerRepoScope;
  /** 若已含完整 repo:(...) 片段，可直传并跳过 repoScope 推导 */
  repoFilter?: string;
  repoFrontend?: string;
  repoBackend?: string;
  includeForked?: boolean;
  displayLimit?: number;
};

export function repoFilterForTracerScope(
  scope: string,
  repoFrontend: string,
  repoBackend: string,
): string {
  const s = scope.trim().toLowerCase();
  if (s === "frontend") {
    const rf = repoFrontend.trim() || DEFAULT_SOURCEGRAPH_REPO_FRONTEND;
    return `repo:(${rf})`;
  }
  if (s === "backend") {
    const rb = repoBackend.trim() || DEFAULT_SOURCEGRAPH_REPO_BACKEND;
    return `repo:(${rb})`;
  }
  return "";
}

/** patternType: literal | regexp */
export function buildTracerSourcegraphQuery(
  patternType: string,
  pattern: string,
  parts: BuildTracerSourcegraphQueryParts,
): string {
  const p = pattern.trim();
  if (!p) return "";
  const pt = (patternType || "literal").trim().toLowerCase() || "literal";
  const segs: string[] = [];
  if (parts.contextGlobal) segs.push("context:global");
  segs.push(p);
  const tf = (parts.typeFilter ?? "").trim();
  if (tf) segs.push(tf);
  if (pt === "regexp") segs.push("patternType:regexp");
  const rf = (parts.repoFilter ?? "").trim();
  if (rf) segs.push(rf);
  if (parts.includeForked) segs.push("fork:yes");
  let s = segs.join(" ").trim();
  s = s.replace(/\s+/g, " ").trim();
  const lim = parts.displayLimit && parts.displayLimit > 0 ? parts.displayLimit : 0;
  if (lim > 0) s = `${s} count:${lim}`.trim();
  return s;
}

/** 若未传 repoFilter，则根据 repoScope 与前后端仓库正则生成 */
export function buildTracerSourcegraphQueryWithScope(
  patternType: string,
  pattern: string,
  parts: BuildTracerSourcegraphQueryParts,
): string {
  const scope = (parts.repoScope ?? "") as TracerRepoScope;
  const rf =
    (parts.repoFilter ?? "").trim() ||
    repoFilterForTracerScope(scope, parts.repoFrontend ?? "", parts.repoBackend ?? "");
  return buildTracerSourcegraphQuery(patternType, pattern, { ...parts, repoFilter: rf });
}
