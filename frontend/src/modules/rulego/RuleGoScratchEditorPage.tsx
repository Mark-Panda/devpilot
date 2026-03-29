import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as ScratchBlocks from "scratch-blocks";
import type { WorkspaceSvg, Block, BlockSvg } from "blockly/core";
import {
  extractNodesFromRuleDefinition,
  getEnabledFromDefinition,
  isSubRuleChain,
  summarizeRuleNodesForAgent,
} from "./dslUtils";
import type { RuleGoRule } from "./types";
import { isRuleGoTriggerBlockType, validateRuleGoTriggerLayout } from "./rulegoWorkspaceValidation";
import { useRuleGoRules } from "./useRuleGoRules";
import {
  executeRuleGoRuleByDefinition,
  generateRuleGoPlan,
  listAvailableSkills,
  type AvailableSkillItem,
  type ExecuteRuleOutput,
  type GenerateRuleGoPlanResult,
} from "./useRuleGoApi";
import {
  registerAllBlocks,
  toolbox as rulegoToolbox,
  getBlockDef,
  getBlockTypeFromNodeType,
  getBlockTypeForEndpointDslType,
} from "./rulego-blocks";
import {
  cursorAcpAgentPresetOptions,
  cursorAcpArgsPresetOptions,
  cursorAcpPermissionOptions,
  cursorAcpSessionModeOptions,
  cursorAcpTimeoutPresetOptions,
} from "./rulego-blocks/blocks/cursorAcp";
import { JsEditor, JsonEditor, SqlEditor } from "../../shared/components";
import { BlockLibraryPanel, DRAG_TYPE_BLOCK } from "./BlockLibraryPanel";
import { UI_RELATION_FAILURE } from "./relationLabels";
import { listModelConfigs } from "../model-management/useModelConfigApi";
import type { ModelConfig } from "../model-management/types";
import { applyAgentSelectionsToDsl, buildAgentPreviewItems, type AgentPreviewItem } from "./agentPlanner";
import {
  VOLC_TLS_TIME_PRESET_OPTIONS,
  VOLC_TLS_SORT_OPTIONS,
  VOLC_TLS_LIMIT_OPTIONS,
  VOLC_TLS_KNOWN_REGIONS,
} from "./rulego-blocks/blocks/volcTlsSearchLogs";
import { datetimeLocalToMs, msToDatetimeLocal } from "./datetimeLocalMs";
import {
  buildTracerSourcegraphQueryWithScope,
  DEFAULT_SOURCEGRAPH_REPO_BACKEND,
  DEFAULT_SOURCEGRAPH_REPO_FRONTEND,
} from "./sourcegraph/buildTracerSourcegraphQuery";

const volcTlsKnownRegionSet = new Set(VOLC_TLS_KNOWN_REGIONS.map((r) => r.value));
const OPENSEARCH_DEFAULT_BODY = '{"size":100,"sort":[{"@timestamp":{"order":"desc"}}],"query":{"match_all":{}}}';
const OPENSEARCH_TIMEOUT_OPTIONS: Array<[string, string]> = [
  ["30 秒", "30"],
  ["60 秒", "60"],
  ["120 秒", "120"],
  ["180 秒", "180"],
];
const OPENSEARCH_TIME_PRESET_OPTIONS: Array<[string, string]> = [
  ["最近 15 分钟", "last_15m"],
  ["最近 1 小时", "last_1h"],
  ["最近 24 小时", "last_24h"],
  ["最近 7 天", "last_7d"],
  ["不限制时间", "all"],
  ["自定义时间段", "custom"],
];
const OPENSEARCH_RECENT_ENDPOINTS_KEY = "rulego.opensearch.recent_endpoints";
const OPENSEARCH_RECENT_ENDPOINTS_LIMIT = 5;
const OPENSEARCH_RECENT_INDEXES_KEY = "rulego.opensearch.recent_indexes";
const OPENSEARCH_RECENT_INDEXES_LIMIT = 10;

/** 深色画布上略压深 primary，提高与白字对比；secondary/tertiary 保持层次 */
const scratchTheme = new ScratchBlocks.Theme(
  "scratch",
  {
    rulego_trigger: {
      colourPrimary: "#dc2626",
      colourSecondary: "#ef4444",
      colourTertiary: "#f87171",
    },
    rulego_action: {
      colourPrimary: "#2563eb",
      colourSecondary: "#3b82f6",
      colourTertiary: "#60a5fa",
    },
    rulego_condition: {
      colourPrimary: "#0d9488",
      colourSecondary: "#14b8a6",
      colourTertiary: "#2dd4bf",
    },
    rulego_data: {
      colourPrimary: "#d97706",
      colourSecondary: "#f59e0b",
      colourTertiary: "#fbbf24",
    },
    rulego_flow: {
      colourPrimary: "#7c3aed",
      colourSecondary: "#8b5cf6",
      colourTertiary: "#a78bfa",
    },
    rulego_db: {
      colourPrimary: "#0f766e",
      colourSecondary: "#0d9488",
      colourTertiary: "#14b8a6",
    },
    rulego_file: {
      colourPrimary: "#92400e",
      colourSecondary: "#b45309",
      colourTertiary: "#d97706",
    },
    rulego_tracer: {
      colourPrimary: "#0e7490",
      colourSecondary: "#0891b2",
      colourTertiary: "#06b6d4",
    },
    rulego_rpa: {
      colourPrimary: "#4f46e5",
      colourSecondary: "#6366f1",
      colourTertiary: "#818cf8",
    },
  },
  {
    rulego_trigger: { colour: "#dc2626" },
    rulego_action: { colour: "#2563eb" },
    rulego_condition: { colour: "#0d9488" },
    rulego_data: { colour: "#d97706" },
    rulego_flow: { colour: "#7c3aed" },
    rulego_db: { colour: "#0f766e" },
    rulego_file: { colour: "#92400e" },
    rulego_tracer: { colour: "#0e7490" },
    rulego_rpa: { colour: "#4f46e5" },
  }
);

(ScratchBlocks as { ScratchMsgs?: { setLocale?: (locale: string) => void } }).ScratchMsgs?.setLocale?.("zh-cn");

/** 展示用：尽量格式化为多行 JSON；不可解析则保留原文 */
function prettyJsonForDisplay(raw: string, emptyPlaceholder: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return emptyPlaceholder;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return String(raw ?? "");
  }
}

function parseLlmModelsChainJson(raw: string, fallbackPrimary: string): string[] {
  const s = String(raw ?? "").trim() || "[]";
  try {
    const p = JSON.parse(s);
    if (Array.isArray(p)) {
      const ch = p.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (ch.length > 0) return ch;
    }
  } catch {
    /* ignore */
  }
  const f = String(fallbackPrimary ?? "").trim();
  return f ? [f] : [];
}

function toggleLlmModelInChain(
  siteOrder: string[],
  chain: string[],
  primary: string,
  model: string,
  on: boolean
): string[] {
  const sel = new Set(chain);
  if (on) sel.add(model);
  else if (model !== primary) sel.delete(model);
  return siteOrder.filter((x) => sel.has(x));
}

function llmChainWithNewPrimary(siteOrder: string[], chain: string[], newPrimary: string): string[] {
  const p = newPrimary.trim();
  if (!p) return [];
  const sel = new Set(chain);
  sel.add(p);
  const ordered = siteOrder.filter((x) => sel.has(x));
  if (!ordered.includes(p)) return [p];
  return [p, ...ordered.filter((x) => x !== p)];
}

function parseOpenSearchBodyConfig(rawBody: string): {
  size: string;
  sortOrder: string;
  filterText: string;
  timePreset: string;
  customStartLocal: string;
  customEndLocal: string;
  sourceEnabled: boolean;
  trackTotalHits: boolean;
} {
  const fallback = {
    size: "100",
    sortOrder: "desc",
    filterText: "",
    timePreset: "all",
    customStartLocal: "",
    customEndLocal: "",
    sourceEnabled: false,
    trackTotalHits: true,
  };
  const raw = String(rawBody ?? "").trim();
  if (!raw) return fallback;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const sizeNum = Number(obj?.size);
    const size = Number.isFinite(sizeNum) && sizeNum > 0 ? String(Math.floor(sizeNum)) : fallback.size;
    let sortOrder = fallback.sortOrder;
    const sortArr = Array.isArray(obj?.sort) ? (obj.sort as unknown[]) : [];
    if (sortArr.length > 0 && sortArr[0] && typeof sortArr[0] === "object") {
      const first = sortArr[0] as Record<string, unknown>;
      const ts = first["@timestamp"];
      if (ts && typeof ts === "object") {
        const order = String((ts as Record<string, unknown>).order ?? "").toLowerCase();
        if (order === "asc" || order === "desc") sortOrder = order;
      }
    }
    let filterText = "";
    let timePreset = fallback.timePreset;
    let customStartLocal = "";
    let customEndLocal = "";
    const query = obj?.query;
    const sourceEnabled = obj?._source !== false;
    const trackTotalHits = obj?.track_total_hits !== false;
    if (query && typeof query === "object") {
      const q = query as Record<string, unknown>;
      const qs = q.query_string;
      if (qs && typeof qs === "object") {
        filterText = String((qs as Record<string, unknown>).query ?? "").trim();
      }
      const boolObj = q.bool;
      if (boolObj && typeof boolObj === "object") {
        const must = Array.isArray((boolObj as Record<string, unknown>).must)
          ? ((boolObj as Record<string, unknown>).must as unknown[])
          : [];
        for (const item of must) {
          if (!item || typeof item !== "object") continue;
          const rec = item as Record<string, unknown>;
          const itemQs = rec.query_string;
          if (itemQs && typeof itemQs === "object" && !filterText) {
            filterText = String((itemQs as Record<string, unknown>).query ?? "").trim();
          }
          const range = rec.range;
          if (!range || typeof range !== "object") continue;
          const tsRange = (range as Record<string, unknown>)["@timestamp"];
          if (!tsRange || typeof tsRange !== "object") continue;
          const rr = tsRange as Record<string, unknown>;
          const gte = String(rr.gte ?? "").trim();
          const lte = String(rr.lte ?? "").trim();
          if (gte === "now-15m") timePreset = "last_15m";
          else if (gte === "now-1h") timePreset = "last_1h";
          else if (gte === "now-24h") timePreset = "last_24h";
          else if (gte === "now-7d") timePreset = "last_7d";
          else if (gte || lte) timePreset = "custom";
          if (timePreset === "custom") {
            const startMs = Date.parse(gte);
            const endMs = Date.parse(lte);
            customStartLocal = Number.isFinite(startMs) ? msToDatetimeLocal(startMs) : "";
            customEndLocal = Number.isFinite(endMs) ? msToDatetimeLocal(endMs) : "";
          }
        }
      }
    }
    return { size, sortOrder, filterText, timePreset, customStartLocal, customEndLocal, sourceEnabled, trackTotalHits };
  } catch {
    return fallback;
  }
}

function buildOpenSearchBodyFromForm(form: Record<string, string | boolean>): string {
  const sizeRaw = parseInt(String(form.OS_SIZE ?? "100"), 10);
  const size = Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : 100;
  const sortOrder = String(form.OS_SORT_ORDER ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const filterText = String(form.OS_FILTER_TEXT ?? "").trim();
  const timePreset = String(form.OS_TIME_PRESET ?? "all");
  const must: Array<Record<string, unknown>> = [];
  if (filterText) {
    must.push({ query_string: { query: filterText } });
  }
  if (timePreset !== "all") {
    let gte = "";
    if (timePreset === "last_15m") gte = "now-15m";
    else if (timePreset === "last_1h") gte = "now-1h";
    else if (timePreset === "last_24h") gte = "now-24h";
    else if (timePreset === "last_7d") gte = "now-7d";
    let lte = "now";
    if (timePreset === "custom") {
      const sm = datetimeLocalToMs(String(form.OS_CUSTOM_START_LOCAL ?? ""));
      const em = datetimeLocalToMs(String(form.OS_CUSTOM_END_LOCAL ?? ""));
      if (sm > 0) gte = new Date(sm).toISOString();
      if (em > 0) lte = new Date(em).toISOString();
    }
    if (gte || lte) {
      const rangeObj: Record<string, unknown> = {};
      if (gte) rangeObj.gte = gte;
      if (lte) rangeObj.lte = lte;
      must.push({ range: { "@timestamp": rangeObj } });
    }
  }
  const query =
    must.length === 0
      ? { match_all: {} }
      : must.length === 1
      ? must[0]
      : { bool: { must } };
  const sourceEnabled = Boolean(form.OS_SOURCE_ENABLED);
  const trackTotalHits = form.OS_TRACK_TOTAL_HITS !== false;
  return JSON.stringify(
    {
      size,
      sort: [{ "@timestamp": { order: sortOrder } }],
      query,
      _source: sourceEnabled,
      track_total_hits: trackTotalHits,
    },
    null,
    2
  );
}

function loadOpenSearchRecentEndpoints(): string[] {
  try {
    const raw = window.localStorage.getItem(OPENSEARCH_RECENT_ENDPOINTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, OPENSEARCH_RECENT_ENDPOINTS_LIMIT);
  } catch {
    return [];
  }
}

function saveOpenSearchRecentEndpoint(endpoint: string): void {
  const e = String(endpoint ?? "").trim();
  if (!e) return;
  try {
    const current = loadOpenSearchRecentEndpoints().filter((x) => x !== e);
    const next = [e, ...current].slice(0, OPENSEARCH_RECENT_ENDPOINTS_LIMIT);
    window.localStorage.setItem(OPENSEARCH_RECENT_ENDPOINTS_KEY, JSON.stringify(next));
  } catch {
    // 忽略本地存储异常（隐私模式等）
  }
}

function clearOpenSearchRecentEndpoints(): void {
  try {
    window.localStorage.removeItem(OPENSEARCH_RECENT_ENDPOINTS_KEY);
  } catch {
    // 忽略本地存储异常（隐私模式等）
  }
}

function loadOpenSearchRecentIndexes(): string[] {
  try {
    const raw = window.localStorage.getItem(OPENSEARCH_RECENT_INDEXES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, OPENSEARCH_RECENT_INDEXES_LIMIT);
  } catch {
    return [];
  }
}

function saveOpenSearchRecentIndex(indexValue: string): void {
  const idx = String(indexValue ?? "").trim();
  if (!idx) return;
  try {
    const current = loadOpenSearchRecentIndexes().filter((x) => x !== idx);
    const next = [idx, ...current].slice(0, OPENSEARCH_RECENT_INDEXES_LIMIT);
    window.localStorage.setItem(OPENSEARCH_RECENT_INDEXES_KEY, JSON.stringify(next));
  } catch {
    // 忽略本地存储异常（隐私模式等）
  }
}

function clearOpenSearchRecentIndexes(): void {
  try {
    window.localStorage.removeItem(OPENSEARCH_RECENT_INDEXES_KEY);
  } catch {
    // 忽略本地存储异常（隐私模式等）
  }
}

type SubRuleChainOption = { id: string; name: string };

type BlockConfigModalProps = {
  blockId: string | null;
  workspaceRef: React.RefObject<WorkspaceSvg | null>;
  onClose: () => void;
  onSaved?: () => void;
  /** 内嵌模式：编辑器全局错误（展示在属性区顶栏下方） */
  sideError?: string | null;
  /** 内嵌模式：在右侧属性面板中渲染，无遮罩无取消 */
  inline?: boolean;
  /** 子规则链列表（DSL 中 root 为 false 的规则链），用于 flow 块的 targetId 下拉 */
  subRuleChains?: SubRuleChainOption[];
  /** 全部规则（含 definition），用于 ref 块跨链 targetId 下拉；与 currentRuleId 配合排除当前链 */
  refContextRules?: RuleGoRule[];
  currentRuleId?: string;
  /** 工作区 DSL 变更时刷新 ref 下拉中的「当前链」节点列表 */
  workspaceDslRevision?: string;
};

type CaseItem = { case: string; then: string };

const RULEGO_INLINE_BLOCK_FORM_ID = "rulego-inline-block-config-form";

function BlockConfigModal({
  blockId,
  workspaceRef,
  onClose,
  onSaved,
  sideError = null,
  inline,
  subRuleChains = [],
  refContextRules = [],
  currentRuleId = "",
  workspaceDslRevision = "",
}: BlockConfigModalProps) {
  const block = blockId && workspaceRef.current ? workspaceRef.current.getBlockById(blockId) : null;
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [switchCases, setSwitchCases] = useState<CaseItem[]>([{ case: "true", then: "Case1" }]);
  const [availableSkills, setAvailableSkills] = useState<AvailableSkillItem[]>([]);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  /** 用于鼠标离开时判断是否有未保存修改 */
  const initialFormRef = useRef<Record<string, string | boolean>>({});
  const initialSwitchCasesRef = useRef<CaseItem[]>([]);
  const initialDbClientParamsRef = useRef<Array<{ type: "string" | "number"; value: string }>>([]);
  const initialJoinExtraRef = useRef<string[]>([]);
  const [inlineSubmitFeedback, setInlineSubmitFeedback] = useState<null | { type: "success" | "error"; message: string }>(
    null
  );
  const inlineFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmUnsavedOpen, setConfirmUnsavedOpen] = useState(false);
  const [openSearchRecentEndpoints, setOpenSearchRecentEndpoints] = useState<string[]>([]);
  const [openSearchRecentIndexes, setOpenSearchRecentIndexes] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const joinTargetSelectRef = useRef<HTMLSelectElement>(null);
  const llmSelectedConfig = useMemo(() => {
    if (block?.type !== "rulego_llm") return null;
    const url = String(form.LLM_URL ?? "").trim() || "https://ai.gitee.com/v1";
    const key = String(form.LLM_KEY ?? "").trim();
    return modelConfigs.find((c) => c.baseUrl === url && c.apiKey === key) ?? null;
  }, [block?.type, form.LLM_URL, form.LLM_KEY, modelConfigs]);
  const llmModelOptions = llmSelectedConfig?.models ?? [];
  const [llmParamsExpanded, setLlmParamsExpanded] = useState(false);
  const [systemPromptModalOpen, setSystemPromptModalOpen] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  /** dbClient：参数列表（类型 + 值），长度与 SQL 中 ? 数量一致 */
  const [dbClientParams, setDbClientParams] = useState<Array<{ type: "string" | "number"; value: string }>>([]);
  /** 汇聚：额外汇聚的节点 ID 列表（除上方已接线外的分支） */
  const [joinExtraIncomings, setJoinExtraIncomings] = useState<string[]>([]);

  const refTargetSelectOptions = useMemo(() => {
    if (!block || block.type !== "rulego_ref" || !workspaceRef.current) {
      return { local: [] as Array<{ value: string; label: string }>, remote: [] as Array<{ value: string; label: string }> };
    }
    const ws = workspaceRef.current;
    const all = ws.getAllBlocks(false) as Block[];
    const selfNodeId = String(block.getFieldValue?.("NODE_ID") ?? "").trim();
    const seenLocal = new Set<string>();
    const local: Array<{ value: string; label: string }> = [];
    for (const b of all) {
      if (!b.type?.startsWith("rulego_")) continue;
      const nid = String(b.getFieldValue?.("NODE_ID") ?? b.id ?? "").trim();
      if (!nid || nid === selfNodeId || seenLocal.has(nid)) continue;
      seenLocal.add(nid);
      const nm = String(b.getFieldValue?.("NODE_NAME") ?? "").trim();
      local.push({ value: nid, label: nm ? `${nm} (${nid})` : nid });
    }
    local.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans"));
    const remote: Array<{ value: string; label: string }> = [];
    for (const r of refContextRules) {
      if (!r.id || r.id === currentRuleId) continue;
      const nodes = extractNodesFromRuleDefinition(r.definition ?? "");
      for (const n of nodes) {
        remote.push({
          value: `${r.id}:${n.id}`,
          label: `${r.name} / ${n.name || n.id} (${n.id})`,
        });
      }
    }
    remote.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans"));
    return { local, remote };
  }, [block, blockId, refContextRules, currentRuleId, workspaceRef, workspaceDslRevision]);

  useEffect(() => {
    if (block?.type !== "rulego_opensearchSearch") {
      setOpenSearchRecentEndpoints([]);
      setOpenSearchRecentIndexes([]);
      return;
    }
    setOpenSearchRecentEndpoints(loadOpenSearchRecentEndpoints());
    setOpenSearchRecentIndexes(loadOpenSearchRecentIndexes());
  }, [block?.type, blockId]);

  useEffect(() => {
    if (!block) {
      setForm({});
      setSwitchCases([{ case: "true", then: "Case1" }]);
      setDbClientParams([]);
      setJoinExtraIncomings([]);
      setConfirmUnsavedOpen(false);
      return;
    }
    setConfirmUnsavedOpen(false);
    const get = (name: string) => String(block.getFieldValue(name) ?? "").trim();
    const getBool = (name: string) => block.getFieldValue(name) === "TRUE";
    const next: Record<string, string | boolean> = {
      NODE_ID: get("NODE_ID"),
      NODE_NAME: get("NODE_NAME"),
    };
    if (
      block.type === "rulego_jsFilter" ||
      block.type === "rulego_jsTransform" ||
      block.type === "rulego_jsSwitch"
    ) {
      next.JS_SCRIPT = get("JS_SCRIPT");
    }
    if (block.type === "rulego_restApiCall") {
      next.REST_URL = get("REST_URL");
      next.REST_METHOD = get("REST_METHOD");
      next.REST_HEADERS = get("REST_HEADERS");
      next.REST_QUERY = get("REST_QUERY");
      next.REST_BODY = get("REST_BODY");
      next.REST_TIMEOUT = get("REST_TIMEOUT");
      next.REST_MAX_PARALLEL = get("REST_MAX_PARALLEL");
    }
    if (block.type === "rulego_feishuImMessage") {
      next.FS_APP_ID = get("FS_APP_ID");
      next.FS_APP_SECRET = get("FS_APP_SECRET");
      next.FS_RECEIVE_ID_TYPE = get("FS_RECEIVE_ID_TYPE") || "open_id";
      next.FS_RECEIVE_ID = get("FS_RECEIVE_ID");
      next.FS_TEXT = get("FS_TEXT") || "${data}";
      next.FS_TIMEOUT_SEC = get("FS_TIMEOUT_SEC") || "30";
    }
    if (block.type === "rulego_apiRouteTracer_gitPrepare") {
      next.GITLAB_URL = get("GITLAB_URL");
      next.WORK_DIR = get("WORK_DIR");
    }
    if (block.type === "rulego_cursorAcp") {
      next.ACP_AGENT_PRESET = get("ACP_AGENT_PRESET") || "path";
      next.AGENT_CMD = get("AGENT_CMD") || "agent";
      next.ACP_TIMEOUT_PRESET = get("ACP_TIMEOUT_PRESET") || "1800";
      next.TIMEOUT_SEC = get("TIMEOUT_SEC") || "1800";
      next.WORK_DIR = get("WORK_DIR");
      next.ACP_SESSION_MODE = get("ACP_SESSION_MODE") || "agent";
      next.PERM_OPTION = get("PERM_OPTION") || "allow-once";
      next.ACP_ARGS_PRESET = get("ACP_ARGS_PRESET") || "default";
      next.ACP_ARGS_JSON = String(block.getFieldValue("ACP_ARGS_JSON") ?? "").trim() || "[]";
    }
    if (block.type === "rulego_sourcegraphSearch") {
      next.SG_ENDPOINT = get("SG_ENDPOINT") || "https://sourcegraph.com";
      next.SG_TOKEN = get("SG_TOKEN");
      next.SG_TIMEOUT_SEC = get("SG_TIMEOUT_SEC") || "30";
      next.SG_DEFAULT_QUERY = get("SG_DEFAULT_QUERY");
    }
    if (block.type === "rulego_sourcegraphQueryBuild") {
      const dpt = get("SGQB_DEFAULT_PATTERN_TYPE").toLowerCase();
      next.SGQB_DEFAULT_PATTERN_TYPE = dpt === "regexp" ? "regexp" : "literal";
      next.SGQB_DEFAULT_PATTERNS = get("SGQB_DEFAULT_PATTERNS");
      next.SGQB_REPO_SCOPE = get("SGQB_REPO_SCOPE");
      next.SGQB_REPO_FRONTEND = get("SGQB_REPO_FRONTEND") || DEFAULT_SOURCEGRAPH_REPO_FRONTEND;
      next.SGQB_REPO_BACKEND = get("SGQB_REPO_BACKEND") || DEFAULT_SOURCEGRAPH_REPO_BACKEND;
      next.SGQB_CONTEXT_GLOBAL = getBool("SGQB_CONTEXT_GLOBAL");
      next.SGQB_TYPE_FILTER = get("SGQB_TYPE_FILTER");
      next.SGQB_INCLUDE_FORKED = getBool("SGQB_INCLUDE_FORKED");
      next.SGQB_DISPLAY_LIMIT = get("SGQB_DISPLAY_LIMIT") || "1500";
    }
    if (block.type === "rulego_volcTlsSearchLogs") {
      next.TLS_ENDPOINT = get("TLS_ENDPOINT");
      next.TLS_REGION = get("TLS_REGION") || "cn-beijing";
      next.TLS_AK = get("TLS_AK");
      next.TLS_SK = get("TLS_SK");
      next.TLS_SESSION_TOKEN = get("TLS_SESSION_TOKEN");
      next.TLS_TOPIC_ID = get("TLS_TOPIC_ID");
      next.TLS_DEFAULT_QUERY = get("TLS_DEFAULT_QUERY") || "*";
      next.TLS_LIMIT = get("TLS_LIMIT") || "100";
      next.TLS_API_V3 = getBool("TLS_API_V3");
      next.TLS_TIMEOUT_SEC = get("TLS_TIMEOUT_SEC") || "60";
      next.TLS_TIME_PRESET = get("TLS_TIME_PRESET") || "last_15m";
      const sm = parseInt(get("TLS_CUSTOM_START_MS") || "0", 10);
      const em = parseInt(get("TLS_CUSTOM_END_MS") || "0", 10);
      next.TLS_CUSTOM_START_LOCAL = msToDatetimeLocal(Number.isFinite(sm) && sm > 0 ? sm : 0);
      next.TLS_CUSTOM_END_LOCAL = msToDatetimeLocal(Number.isFinite(em) && em > 0 ? em : 0);
      next.TLS_DEFAULT_SORT = get("TLS_DEFAULT_SORT") || "desc";
      next.TLS_HIGHLIGHT = getBool("TLS_HIGHLIGHT");
    }
    if (block.type === "rulego_opensearchSearch") {
      next.OS_ENDPOINT = get("OS_ENDPOINT") || "https://localhost:9200";
      next.OS_INDEX = get("OS_INDEX") || "";
      next.OS_USER = get("OS_USER");
      next.OS_PASS = get("OS_PASS");
      next.OS_INSECURE = getBool("OS_INSECURE");
      next.OS_TIMEOUT_SEC = get("OS_TIMEOUT_SEC") || "60";
      next.OS_API_MODE = get("OS_API_MODE") || "search";
      next.OS_SEARCH_TYPE = get("OS_SEARCH_TYPE") || "query_then_fetch";
      next.OS_IGNORE_UNAVAILABLE = block.getFieldValue("OS_IGNORE_UNAVAILABLE") !== "FALSE";
      next.OS_DEFAULT_BODY = prettyJsonForDisplay(get("OS_DEFAULT_BODY") || OPENSEARCH_DEFAULT_BODY, OPENSEARCH_DEFAULT_BODY);
      next.OS_AUTH_MODE = next.OS_USER || next.OS_PASS ? "basic" : "none";
      next.OS_TLS_MODE = next.OS_INSECURE ? "insecure" : "strict";
      const parsed = parseOpenSearchBodyConfig(String(next.OS_DEFAULT_BODY ?? ""));
      next.OS_SIZE = parsed.size;
      next.OS_SORT_ORDER = parsed.sortOrder;
      next.OS_FILTER_TEXT = parsed.filterText;
      next.OS_TIME_PRESET = parsed.timePreset;
      next.OS_CUSTOM_START_LOCAL = parsed.customStartLocal;
      next.OS_CUSTOM_END_LOCAL = parsed.customEndLocal;
      next.OS_SOURCE_ENABLED = getBool("OS_SOURCE_ENABLED");
      next.OS_TRACK_TOTAL_HITS = getBool("OS_TRACK_TOTAL_HITS");
      next.OS_TIMEOUT_MODE = OPENSEARCH_TIMEOUT_OPTIONS.some(([, v]) => v === String(next.OS_TIMEOUT_SEC ?? "")) ? "preset" : "custom";
      if (String(block.getFieldValue("OS_DEFAULT_BODY") ?? "").trim()) {
        next.OS_SOURCE_ENABLED = parsed.sourceEnabled;
        next.OS_TRACK_TOTAL_HITS = parsed.trackTotalHits;
      }
    }
    if (block.type === "rulego_dbClient") {
      next.DB_DRIVER_NAME = get("DB_DRIVER_NAME") || "mysql";
      next.DB_DSN = get("DB_DSN");
      next.DB_POOL_SIZE = get("DB_POOL_SIZE");
      next.DB_OP_TYPE = get("DB_OP_TYPE");
      next.DB_SQL = get("DB_SQL");
      next.DB_PARAMS = get("DB_PARAMS") || "[]";
      next.DB_GET_ONE = getBool("DB_GET_ONE");
      const sql = next.DB_SQL as string;
      const paramCount = (sql.match(/\?/g) || []).length;
      let arr: Array<{ type: "string" | "number"; value: string } | string | number> = [];
      try {
        const parsed = JSON.parse((next.DB_PARAMS as string) || "[]");
        arr = Array.isArray(parsed) ? parsed : [];
      } catch {
        arr = [];
      }
      const normalize = (x: unknown, i: number): { type: "string" | "number"; value: string } => {
        if (x != null && typeof x === "object" && "type" in x && "value" in x)
          return { type: (x as { type: string }).type === "number" ? "number" : "string", value: String((x as { value: unknown }).value ?? "") };
        if (typeof x === "number") return { type: "number", value: String(x) };
        return { type: "string", value: String(x ?? "") };
      };
      const normalizedParams = Array.from({ length: paramCount }, (_, i) => normalize(arr[i], i));
      setDbClientParams(normalizedParams);
      initialDbClientParamsRef.current = normalizedParams.map((p) => ({ ...p }));
    } else {
      setDbClientParams([]);
      initialDbClientParamsRef.current = [];
    }
    if (block.type === "rulego_llm") {
      next.LLM_URL = get("LLM_URL") || "https://ai.gitee.com/v1";
      next.LLM_KEY = get("LLM_KEY");
      next.LLM_MODEL = get("LLM_MODEL");
      const modelsJsonRaw = String(block.getFieldValue("LLM_MODELS_JSON") ?? "").trim() || "[]";
      const chain = parseLlmModelsChainJson(modelsJsonRaw, get("LLM_MODEL"));
      next.LLM_MODELS_JSON = JSON.stringify(chain);
      if (chain.length > 0) next.LLM_MODEL = chain[0];
      next.LLM_SYSTEM_PROMPT = get("LLM_SYSTEM_PROMPT");
      next.LLM_MESSAGES_JSON = get("LLM_MESSAGES_JSON") || "[]";
      const paramsJson = get("LLM_PARAMS_JSON") || "{}";
      next.LLM_PARAMS_JSON = paramsJson;
      next.LLM_ENABLED_SKILLS_JSON = get("LLM_ENABLED_SKILLS_JSON") || "[]";
      const defaultParams = {
        temperature: 0.6,
        topP: 0.75,
        presencePenalty: 0,
        frequencyPenalty: 0,
        maxTokens: 0,
        responseFormat: "text",
      };
      try {
        const p = JSON.parse(paramsJson) as Record<string, unknown>;
        next.LLM_TEMPERATURE = String(Number(p?.temperature ?? defaultParams.temperature));
        next.LLM_TOP_P = String(Number(p?.topP ?? defaultParams.topP));
        next.LLM_PRESENCE_PENALTY = String(Number(p?.presencePenalty ?? defaultParams.presencePenalty));
        next.LLM_FREQUENCY_PENALTY = String(Number(p?.frequencyPenalty ?? defaultParams.frequencyPenalty));
        next.LLM_MAX_TOKENS = String(Number(p?.maxTokens ?? defaultParams.maxTokens));
        next.LLM_STOP = Array.isArray(p?.stop) ? (p.stop as string[]).join(", ") : "";
        next.LLM_RESPONSE_FORMAT = String(p?.responseFormat ?? defaultParams.responseFormat);
      } catch {
        next.LLM_TEMPERATURE = String(defaultParams.temperature);
        next.LLM_TOP_P = String(defaultParams.topP);
        next.LLM_PRESENCE_PENALTY = String(defaultParams.presencePenalty);
        next.LLM_FREQUENCY_PENALTY = String(defaultParams.frequencyPenalty);
        next.LLM_MAX_TOKENS = String(defaultParams.maxTokens);
        next.LLM_STOP = "";
        next.LLM_RESPONSE_FORMAT = defaultParams.responseFormat;
      }
    }
    if (block.type === "rulego_delay") {
      next.DELAY_MS = get("DELAY_MS") || "60000";
      next.DELAY_OVERWRITE = getBool("DELAY_OVERWRITE");
    }
    if (block.type === "rulego_endpoint_http") {
      next.EP_SERVER = get("EP_SERVER") || ":9090";
      next.EP_ALLOW_CORS = getBool("EP_ALLOW_CORS");
      next.RT_METHOD = get("RT_METHOD") || "POST";
      next.RT_PATH = get("RT_PATH") || "/api/v1/hook";
      next.RT_TO = get("RT_TO") || "chain:default";
      next.RT_WAIT = getBool("RT_WAIT");
      next.RT_TO_PROCESSORS = get("RT_TO_PROCESSORS");
      next.RT_ID = get("RT_ID");
      next.EP_EXTRA_ROUTERS_JSON = String(block.getFieldValue("EP_EXTRA_ROUTERS_JSON") ?? "").trim();
    }
    if (block.type === "rulego_endpoint_ws") {
      next.EP_SERVER = get("EP_SERVER") || ":9090";
      next.RT_METHOD = get("RT_METHOD") || "GET";
      next.RT_PATH = get("RT_PATH") || "/ws";
      next.RT_TO = get("RT_TO") || "chain:default";
      next.RT_WAIT = getBool("RT_WAIT");
      next.RT_ID = get("RT_ID");
      next.EP_EXTRA_ROUTERS_JSON = String(block.getFieldValue("EP_EXTRA_ROUTERS_JSON") ?? "").trim();
    }
    if (block.type === "rulego_endpoint_mqtt") {
      next.EP_SERVER = get("EP_SERVER") || "127.0.0.1:1883";
      next.EP_USER = get("EP_USER");
      next.EP_PASS = String(block.getFieldValue("EP_PASS") ?? "");
      next.EP_QOS = get("EP_QOS") || "1";
      next.EP_CLIENT_ID = get("EP_CLIENT_ID") || "rulego_mqtt";
      next.RT_PATH = get("RT_PATH") || "sensors/+/data";
      next.RT_FROM_PROCESSORS = get("RT_FROM_PROCESSORS");
      next.RT_TO = get("RT_TO") || "chain:default";
      next.RT_ID = get("RT_ID");
      next.EP_EXTRA_ROUTERS_JSON = String(block.getFieldValue("EP_EXTRA_ROUTERS_JSON") ?? "").trim();
    }
    if (block.type === "rulego_endpoint_schedule") {
      next.RT_PATH = get("RT_PATH") || "*/1 * * * * *";
      next.EP_PROCESSORS = get("EP_PROCESSORS");
      next.RT_TO = get("RT_TO");
      next.EP_EXTRA_ROUTERS_JSON = String(block.getFieldValue("EP_EXTRA_ROUTERS_JSON") ?? "").trim();
    }
    if (block.type === "rulego_endpoint_net") {
      next.EP_PROTOCOL = get("EP_PROTOCOL") || "tcp";
      next.EP_SERVER = get("EP_SERVER") || ":8888";
      next.RT_PATH = get("RT_PATH") || ".*";
      next.RT_TO = get("RT_TO") || "chain:default";
      next.EP_EXTRA_ROUTERS_JSON = String(block.getFieldValue("EP_EXTRA_ROUTERS_JSON") ?? "").trim();
    }
    if (block.type === "rulego_fileRead") {
      next.FILE_PATH = get("FILE_PATH") || "/tmp/data.txt";
      next.FILE_DATA_TYPE = get("FILE_DATA_TYPE") || "text";
      next.FILE_RECURSIVE = getBool("FILE_RECURSIVE");
    }
    if (block.type === "rulego_fileWrite") {
      next.FILE_PATH = get("FILE_PATH") || "/tmp/out.txt";
      next.FILE_CONTENT = get("FILE_CONTENT") || "${data}";
      next.FILE_APPEND = getBool("FILE_APPEND");
    }
    if (block.type === "rulego_fileDelete") {
      next.FILE_PATH = get("FILE_PATH") || "/tmp/data.txt";
    }
    if (block.type === "rulego_fileList") {
      next.FILE_PATH = get("FILE_PATH") || "/tmp/*.txt";
      next.FILE_RECURSIVE = getBool("FILE_RECURSIVE");
    }
    if (block.type === "rulego_rpaBrowserNavigate") {
      next.RPA_DEBUGGER_URL = get("RPA_DEBUGGER_URL") || "http://127.0.0.1:9222";
      next.RPA_URL = get("RPA_URL") || "https://example.com";
      next.RPA_TIMEOUT_MS = get("RPA_TIMEOUT_MS") || "30000";
    }
    if (block.type === "rulego_rpaBrowserClick") {
      next.RPA_DEBUGGER_URL = get("RPA_DEBUGGER_URL") || "http://127.0.0.1:9222";
      next.RPA_SELECTOR = get("RPA_SELECTOR") || "button.submit";
      next.RPA_BUTTON = get("RPA_BUTTON") || "left";
      next.RPA_TIMEOUT_MS = get("RPA_TIMEOUT_MS") || "30000";
    }
    if (block.type === "rulego_rpaBrowserScreenshot") {
      next.RPA_DEBUGGER_URL = get("RPA_DEBUGGER_URL") || "http://127.0.0.1:9222";
      next.RPA_SELECTOR = get("RPA_SELECTOR") || "";
      next.RPA_TIMEOUT_MS = get("RPA_TIMEOUT_MS") || "30000";
    }
    if (block.type === "rulego_rpaBrowserQuery") {
      next.RPA_DEBUGGER_URL = get("RPA_DEBUGGER_URL") || "http://127.0.0.1:9222";
      next.RPA_SELECTOR = get("RPA_SELECTOR") || "h1";
      next.RPA_QUERY_MODE = get("RPA_QUERY_MODE") || "text";
      next.RPA_ATTRIBUTE_NAME = get("RPA_ATTRIBUTE_NAME") || "href";
      next.RPA_TIMEOUT_MS = get("RPA_TIMEOUT_MS") || "30000";
    }
    if (block.type === "rulego_rpaOcr") {
      next.RPA_IMAGE_PATH = get("RPA_IMAGE_PATH") || "";
      next.RPA_OCR_LANG = get("RPA_OCR_LANG") || "eng";
      next.RPA_TESSERACT_PATH = get("RPA_TESSERACT_PATH") || "tesseract";
    }
    if (block.type === "rulego_rpaScreenCapture") {
      next.RPA_CAPTURE_MODE = get("RPA_CAPTURE_MODE") || "full";
      next.RPA_REGION_TOP = get("RPA_REGION_TOP") || "0";
      next.RPA_REGION_LEFT = get("RPA_REGION_LEFT") || "0";
      next.RPA_REGION_W = get("RPA_REGION_W") || "800";
      next.RPA_REGION_H = get("RPA_REGION_H") || "600";
      next.RPA_CAPTURE_OUTPUT_PATH = get("RPA_CAPTURE_OUTPUT_PATH") || "";
    }
    if (block.type === "rulego_rpaMacWindow") {
      next.RPA_MAC_ACTION = get("RPA_MAC_ACTION") || "frontmost";
      next.RPA_MAC_APP = get("RPA_MAC_APP") || "";
      next.RPA_MAC_WINDOW_TITLE = get("RPA_MAC_WINDOW_TITLE") || "";
    }
    if (block.type === "rulego_rpaDesktopClick") {
      next.RPA_CLICK_X = get("RPA_CLICK_X") || "100";
      next.RPA_CLICK_Y = get("RPA_CLICK_Y") || "100";
    }
    if (block.type === "rulego_for") {
      next.FOR_RANGE = get("FOR_RANGE") || "1..3";
      const doBlock = block.getInputTargetBlock?.("branch_do");
      next.FOR_DO = get("FOR_DO") || (doBlock ? String(doBlock.getFieldValue?.("NODE_ID") ?? doBlock.id) : "");
      next.FOR_MODE = get("FOR_MODE") ?? "0";
    }
    if (block.type === "rulego_join") {
      next.JOIN_TIMEOUT = get("JOIN_TIMEOUT") || "0";
      next.JOIN_MERGE_TO_MAP = getBool("JOIN_MERGE_TO_MAP");
    }
    if (block.type === "rulego_groupAction") {
      next.MATCH_RELATION_TYPE = get("MATCH_RELATION_TYPE") || "Success";
      next.MATCH_NUM = get("MATCH_NUM") || "0";
      next.GROUP_TIMEOUT = get("GROUP_TIMEOUT") || "0";
      next.GROUP_MERGE_TO_MAP = getBool("GROUP_MERGE_TO_MAP");
      next.GROUP_SLOT_COUNT = String((block as Block & { groupCount_?: number }).groupCount_ ?? 1);
    }
    if (block.type === "rulego_fork") {
      next.FORK_BRANCH_COUNT = String((block as Block & { forkCount_?: number }).forkCount_ ?? 2);
    }
    if (block.type === "rulego_flow") {
      next.FLOW_TARGET_ID = get("FLOW_TARGET_ID") ?? "";
      next.FLOW_EXTEND = getBool("FLOW_EXTEND");
    }
    if (block.type === "rulego_ref") {
      next.REF_TARGET_ID = get("REF_TARGET_ID") ?? "";
      next.REF_TELL_CHAIN = getBool("REF_TELL_CHAIN");
    }
    if (block.type === "rulego_join") {
      const raw = get("JOIN_EXTRA_INCOMINGS") || "";
      const extra = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
      setJoinExtraIncomings(extra);
      initialJoinExtraRef.current = [...extra];
      const mainPrev = block.previousConnection?.targetBlock?.();
      const total = (mainPrev ? 1 : 0) + extra.length;
      block.setFieldValue(total >= 2 ? ` (${total}路)` : "", "JOIN_ROUTES_LABEL");
    } else {
      setJoinExtraIncomings([]);
      initialJoinExtraRef.current = [];
    }
    if (block.type === "rulego_switch") {
      try {
        const raw = get("CASES_JSON") || (block as Block & { casesJson_?: string }).casesJson_ || "";
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr)
          ? arr.map((c: unknown) => ({
            case: String((c as { case?: string })?.case ?? "true"),
            then: String((c as { then?: string })?.then ?? "Case1"),
          }))
          : [{ case: "true", then: "Case1" }];
        const switchList = list.length > 0 ? list : [{ case: "true", then: "Case1" }];
        setSwitchCases(switchList);
        initialSwitchCasesRef.current = switchList.map((c) => ({ ...c }));
      } catch {
        const fallback = [{ case: "true", then: "Case1" }];
        setSwitchCases(fallback);
        initialSwitchCasesRef.current = fallback.map((c) => ({ ...c }));
      }
    } else {
      setSwitchCases([]);
      initialSwitchCasesRef.current = [];
    }
    setForm(next);
    initialFormRef.current = { ...next };
  }, [block, blockId]);

  useEffect(() => {
    if (block?.type !== "rulego_llm") {
      setAvailableSkills([]);
      return;
    }
    listAvailableSkills()
      .then(setAvailableSkills)
      .catch(() => setAvailableSkills([]));
  }, [block?.type, blockId]);

  useEffect(() => {
    if (block?.type !== "rulego_llm") {
      setModelConfigs([]);
      return;
    }
    listModelConfigs()
      .then(setModelConfigs)
      .catch(() => setModelConfigs([]));
  }, [block?.type, blockId]);

  useEffect(() => {
    setInlineSubmitFeedback(null);
    if (inlineFeedbackTimerRef.current) {
      clearTimeout(inlineFeedbackTimerRef.current);
      inlineFeedbackTimerRef.current = null;
    }
  }, [blockId]);

  useEffect(() => {
    return () => {
      if (inlineFeedbackTimerRef.current) clearTimeout(inlineFeedbackTimerRef.current);
    };
  }, []);

  const isDirty = useCallback(() => {
    const init = initialFormRef.current;
    const keys = new Set([...Object.keys(init), ...Object.keys(form)]);
    if ([...keys].some((k) => {
      const a = form[k];
      const b = init[k];
      return a !== b && !(a == null && b == null);
    })) return true;
    if (switchCases.length !== initialSwitchCasesRef.current.length) return true;
    if (switchCases.some((c, i) => {
      const o = initialSwitchCasesRef.current[i];
      return !o || o.case !== c.case || o.then !== c.then;
    })) return true;
    if (dbClientParams.length !== initialDbClientParamsRef.current.length) return true;
    if (dbClientParams.some((p, i) => {
      const o = initialDbClientParamsRef.current[i];
      return !o || o.type !== p.type || o.value !== p.value;
    })) return true;
    if (joinExtraIncomings.length !== initialJoinExtraRef.current.length) return true;
    if (joinExtraIncomings.some((id, i) => id !== initialJoinExtraRef.current[i])) return true;
    return false;
  }, [form, switchCases, dbClientParams, joinExtraIncomings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!block) return;
    if (inline && !isDirty()) return;

    if (inlineFeedbackTimerRef.current) {
      clearTimeout(inlineFeedbackTimerRef.current);
      inlineFeedbackTimerRef.current = null;
    }

    try {
    const set = (name: string, value: string | boolean) => {
      if (typeof value === "boolean") {
        block.setFieldValue(value ? "TRUE" : "FALSE", name);
      } else {
        block.setFieldValue(value, name);
      }
    };
    const llmParamKeys = new Set([
      "LLM_TEMPERATURE", "LLM_TOP_P", "LLM_PRESENCE_PENALTY", "LLM_FREQUENCY_PENALTY",
      "LLM_MAX_TOKENS", "LLM_STOP", "LLM_RESPONSE_FORMAT",
    ]);
    const volcTlsUiOnlyKeys = new Set(["TLS_CUSTOM_START_LOCAL", "TLS_CUSTOM_END_LOCAL"]);
    const openSearchUiOnlyKeys = new Set([
      "OS_AUTH_MODE",
      "OS_TLS_MODE",
      "OS_SIZE",
      "OS_SORT_ORDER",
      "OS_FILTER_TEXT",
      "OS_TIME_PRESET",
      "OS_CUSTOM_START_LOCAL",
      "OS_CUSTOM_END_LOCAL",
      "OS_TIMEOUT_MODE",
    ]);
    Object.entries(form).forEach(([key, value]) => {
      if (
        form[key] === undefined ||
        key === "CASES_JSON" ||
        key === "GROUP_SLOT_COUNT" ||
        key === "FORK_BRANCH_COUNT" ||
        key === "NODE_ID" ||
        key === "DEBUG" ||
        llmParamKeys.has(key) ||
        volcTlsUiOnlyKeys.has(key) ||
        openSearchUiOnlyKeys.has(key)
      )
        return;
      set(key, value as string | boolean);
    });
    const llmParamDefaults = {
      temperature: 0.6,
      topP: 0.75,
      presencePenalty: 0,
      frequencyPenalty: 0,
      maxTokens: 0,
      responseFormat: "text",
    };
    if (block.type === "rulego_llm") {
      const stopStr = String(form.LLM_STOP ?? "").trim();
      const stopArr = stopStr ? stopStr.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const paramsJson = JSON.stringify({
        temperature: Number(form.LLM_TEMPERATURE ?? llmParamDefaults.temperature),
        topP: Number(form.LLM_TOP_P ?? llmParamDefaults.topP),
        presencePenalty: Number(form.LLM_PRESENCE_PENALTY ?? llmParamDefaults.presencePenalty),
        frequencyPenalty: Number(form.LLM_FREQUENCY_PENALTY ?? llmParamDefaults.frequencyPenalty),
        maxTokens: Number(form.LLM_MAX_TOKENS ?? llmParamDefaults.maxTokens),
        stop: stopArr.length > 0 ? stopArr : [],
        responseFormat: String(form.LLM_RESPONSE_FORMAT ?? llmParamDefaults.responseFormat),
      }, null, 2);
      block.setFieldValue(paramsJson, "LLM_PARAMS_JSON");
      const mChain = parseLlmModelsChainJson(String(form.LLM_MODELS_JSON ?? ""), String(form.LLM_MODEL ?? ""));
      block.setFieldValue(JSON.stringify(mChain.length > 0 ? mChain : []), "LLM_MODELS_JSON");
      if (mChain.length > 0) block.setFieldValue(mChain[0], "LLM_MODEL");
    }
    if (block.type === "rulego_switch") {
      const casesJson = JSON.stringify(switchCases, null, 2);
      (block as Block & { casesJson_?: string }).casesJson_ = casesJson;
      block.setFieldValue(casesJson, "CASES_JSON");
      const b = block as Block & { domToMutation?: (xml: Element) => void };
      if (typeof b.domToMutation === "function") {
        const xml = document.createElement("mutation");
        xml.setAttribute("casecount", String(Math.max(1, Math.min(6, switchCases.length))));
        b.domToMutation(xml);
      }
    }
    if (block.type === "rulego_groupAction" && form.GROUP_SLOT_COUNT !== undefined) {
      const slotCount = Math.max(1, Math.min(8, parseInt(String(form.GROUP_SLOT_COUNT), 10) || 1));
      const b = block as Block & { groupCount_?: number; updateShape_?: () => void };
      b.groupCount_ = slotCount;
      b.updateShape_?.();
    }
    if (block.type === "rulego_fork" && form.FORK_BRANCH_COUNT !== undefined) {
      const branchCount = Math.max(1, Math.min(8, parseInt(String(form.FORK_BRANCH_COUNT), 10) || 2));
      const b = block as Block & { forkCount_?: number; updateShape_?: () => void };
      b.forkCount_ = branchCount;
      b.updateShape_?.();
    }
    if (block.type === "rulego_flow") {
      block.setFieldValue(String(form.FLOW_TARGET_ID ?? ""), "FLOW_TARGET_ID");
      block.setFieldValue(form.FLOW_EXTEND ? "TRUE" : "FALSE", "FLOW_EXTEND");
    }
    if (block.type === "rulego_ref") {
      block.setFieldValue(String(form.REF_TARGET_ID ?? ""), "REF_TARGET_ID");
      block.setFieldValue(form.REF_TELL_CHAIN ? "TRUE" : "FALSE", "REF_TELL_CHAIN");
    }
    if (block.type === "rulego_dbClient") {
      const sql = String(form.DB_SQL ?? "");
      const paramCount = (sql.match(/\?/g) || []).length;
      block.setFieldValue(JSON.stringify(dbClientParams.slice(0, paramCount)), "DB_PARAMS");
    }
    if (block.type === "rulego_volcTlsSearchLogs") {
      const preset = String(form.TLS_TIME_PRESET ?? "last_15m");
      block.setFieldValue(preset, "TLS_TIME_PRESET");
      let startMs = 0;
      let endMs = 0;
      if (preset === "custom") {
        startMs = datetimeLocalToMs(String(form.TLS_CUSTOM_START_LOCAL ?? ""));
        endMs = datetimeLocalToMs(String(form.TLS_CUSTOM_END_LOCAL ?? ""));
      }
      block.setFieldValue(startMs > 0 ? String(startMs) : "", "TLS_CUSTOM_START_MS");
      block.setFieldValue(endMs > 0 ? String(endMs) : "", "TLS_CUSTOM_END_MS");
      block.setFieldValue(String(form.TLS_DEFAULT_SORT ?? "desc"), "TLS_DEFAULT_SORT");
      block.setFieldValue(form.TLS_HIGHLIGHT ? "TRUE" : "FALSE", "TLS_HIGHLIGHT");
    }
    if (block.type === "rulego_opensearchSearch") {
      const authMode = String(form.OS_AUTH_MODE ?? "none");
      const tlsMode = String(form.OS_TLS_MODE ?? "strict");
      const endpoint = String(form.OS_ENDPOINT ?? "").trim();
      const indexValue = String(form.OS_INDEX ?? "").trim();
      const timeout = String(form.OS_TIMEOUT_SEC ?? "60").trim();
      const bodyRaw = buildOpenSearchBodyFromForm(form);
      block.setFieldValue(endpoint || "https://localhost:9200", "OS_ENDPOINT");
      block.setFieldValue(indexValue, "OS_INDEX");
      block.setFieldValue(authMode === "basic" ? String(form.OS_USER ?? "") : "", "OS_USER");
      block.setFieldValue(authMode === "basic" ? String(form.OS_PASS ?? "") : "", "OS_PASS");
      block.setFieldValue(tlsMode === "insecure" ? "TRUE" : "FALSE", "OS_INSECURE");
      block.setFieldValue(timeout || "60", "OS_TIMEOUT_SEC");
      block.setFieldValue(bodyRaw || OPENSEARCH_DEFAULT_BODY, "OS_DEFAULT_BODY");
      if (endpoint) {
        saveOpenSearchRecentEndpoint(endpoint);
        setOpenSearchRecentEndpoints(loadOpenSearchRecentEndpoints());
      }
      if (indexValue) {
        saveOpenSearchRecentIndex(indexValue);
        setOpenSearchRecentIndexes(loadOpenSearchRecentIndexes());
      }
    }
    if (block.type === "rulego_join") {
      block.setFieldValue(joinExtraIncomings.join(", "), "JOIN_EXTRA_INCOMINGS");
      const mainPrevJoin = block.previousConnection?.targetBlock?.();
      const totalJoin = (mainPrevJoin ? 1 : 0) + joinExtraIncomings.length;
      block.setFieldValue(totalJoin >= 2 ? ` (${totalJoin}路)` : "", "JOIN_ROUTES_LABEL");
    }
      onSaved?.();
      initialFormRef.current = { ...form };
      initialSwitchCasesRef.current = switchCases.map((c) => ({ ...c }));
      initialDbClientParamsRef.current = dbClientParams.map((p) => ({ ...p }));
      if (block.type === "rulego_join") {
        initialJoinExtraRef.current = [...joinExtraIncomings];
      }
      if (inline) {
        setInlineSubmitFeedback({ type: "success", message: "块配置已保存" });
        inlineFeedbackTimerRef.current = setTimeout(() => {
          setInlineSubmitFeedback(null);
          inlineFeedbackTimerRef.current = null;
        }, 2600);
      }
      if (!inline) onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (inline) {
        setInlineSubmitFeedback({ type: "error", message: msg.trim() ? msg : "保存失败" });
        inlineFeedbackTimerRef.current = setTimeout(() => {
          setInlineSubmitFeedback(null);
          inlineFeedbackTimerRef.current = null;
        }, 5200);
      } else {
        throw err;
      }
    }
  };

  if (!blockId) return null;

  const formBody = !block ? (
    <p className="confirm-text">块不存在或已被删除，请先在画布中选中一个块。</p>
  ) : (
    <div className="form-grid">
      <label className="form-field">
        <span>节点 ID</span>
        <input
          value={String(form.NODE_ID ?? "")}
          readOnly
          className="readonly-input"
        />
      </label>
      <label className="form-field">
        <span>节点名称</span>
        <input
          value={String(form.NODE_NAME ?? "")}
          onChange={(e) => setForm((f) => ({ ...f, NODE_NAME: e.target.value }))}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
        />
      </label>
      {block.type === "rulego_switch" && (
        <div className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span className="form-label">条件分支 (cases)</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {switchCases.map((item, index) => (
              <div
                key={index}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 8,
                  alignItems: "start",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>条件表达式 (case)</span>
                  <input
                    value={item.case}
                    onChange={(e) =>
                      setSwitchCases((prev) => {
                        const next = [...prev];
                        next[index] = { ...next[index], case: e.target.value };
                        return next;
                      })
                    }
                    placeholder="如 msg.temperature > 50"
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0" }}
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 90 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>路由名 (then)</span>
                  <input
                    value={item.then}
                    onChange={(e) =>
                      setSwitchCases((prev) => {
                        const next = [...prev];
                        next[index] = { ...next[index], then: e.target.value };
                        return next;
                      })
                    }
                    placeholder="Case1"
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  style={{ marginTop: 20, padding: "6px 10px" }}
                  onClick={() =>
                    setSwitchCases((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
                  }
                  disabled={switchCases.length <= 1}
                  title="删除该条件"
                >
                  删除
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              style={{ alignSelf: "flex-start", padding: "8px 12px", border: "1px dashed #cbd5e1", borderRadius: 8 }}
              onClick={() =>
                setSwitchCases((prev) => [...prev, { case: "true", then: `Case${prev.length + 1}` }])
              }
              disabled={switchCases.length >= 6}
            >
              + 添加 Case
            </button>
          </div>
          <small className="form-hint">
            画布上会同步显示对应数量的 Case 槽位；Default / {UI_RELATION_FAILURE} 为固定槽位。最多 6 个 case。参考{" "}
            <a href="https://rulego.cc/pages/switch/#%E9%85%8D%E7%BD%AE%E7%A4%BA%E4%BE%8B" target="_blank" rel="noopener noreferrer">
              条件分支
            </a>
          </small>
        </div>
      )}
      {block.type === "rulego_fork" && (
        <label className="form-field">
          <span>并行分支数（2～8）</span>
          <input
            type="number"
            min={2}
            max={8}
            value={String(form.FORK_BRANCH_COUNT ?? "2")}
            onChange={(e) => setForm((f) => ({ ...f, FORK_BRANCH_COUNT: e.target.value }))}
          />
          <small className="form-hint">
            参考 <a href="https://rulego.cc/pages/fork/#%E9%85%8D%E7%BD%AE" target="_blank" rel="noopener noreferrer">并行网关</a>
          </small>
        </label>
      )}
      {block.type === "rulego_join" && (() => {
        const workspace = workspaceRef.current;
        const mainPrev = block.previousConnection?.targetBlock?.();
        const mainNodeId = mainPrev ? (String(mainPrev.getFieldValue?.("NODE_ID") ?? mainPrev.id ?? "").trim() || mainPrev.id) : null;
        const mainNodeName = mainPrev ? String(mainPrev.getFieldValue?.("NODE_NAME") ?? mainPrev.type ?? "").trim() || mainPrev.id : null;
        const allBlocks = workspace?.getAllBlocks?.(false) ?? [];
        const joinId = String(block.getFieldValue?.("NODE_ID") ?? block.id ?? "").trim();
        const usedIds = new Set([mainNodeId, joinId, ...joinExtraIncomings].filter(Boolean));
        const candidateBlocks = allBlocks.filter(
          (b: Block) => b.type?.startsWith?.("rulego_") && b.id !== block.id && !usedIds.has(String(b.getFieldValue?.("NODE_ID") ?? b.id ?? "").trim())
        );
        const forkBlocks = allBlocks.filter((b: Block) => b.type === "rulego_fork");
        const suggestedBranchEnds: Array<{ nodeId: string; name: string; block: Block }> = [];
        forkBlocks.forEach((fork: Block & { forkCount_?: number }) => {
          const n = Math.max(1, Math.min(8, fork.forkCount_ ?? 2));
          for (let i = 0; i < n; i++) {
            let b = fork.getInputTargetBlock?.(`branch_${i}`);
            let last: Block | null = null;
            while (b) {
              last = b;
              b = b.getNextBlock?.() ?? null;
            }
            if (last) {
              const nodeId = String(last.getFieldValue?.("NODE_ID") ?? last.id ?? "").trim() || last.id;
              const name = String(last.getFieldValue?.("NODE_NAME") ?? last.type ?? "").trim() || nodeId;
              if (nodeId && !usedIds.has(nodeId) && !suggestedBranchEnds.some((s) => s.nodeId === nodeId)) {
                suggestedBranchEnds.push({ nodeId, name, block: last });
              }
            }
          }
        });
        return (
          <>
            <label className="form-field">
              <span>timeout（秒，0 表示不超时）</span>
              <input
                type="number"
                min={0}
                value={String(form.JOIN_TIMEOUT ?? "0")}
                onChange={(e) => setForm((f) => ({ ...f, JOIN_TIMEOUT: e.target.value }))}
              />
            </label>
            <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(form.JOIN_MERGE_TO_MAP)}
                onChange={(e) => setForm((f) => ({ ...f, JOIN_MERGE_TO_MAP: e.target.checked }))}
              />
              <span>mergeToMap（结果合并为 Map）</span>
            </label>
            <div className="form-field" style={{ gridColumn: "1 / -1", flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <span className="form-label">已汇聚的节点</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {mainNodeId && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "var(--color-block-bg, #f1f5f9)", borderRadius: 6 }}>
                    <span title={mainNodeId} style={{ color: "#1e293b", fontWeight: 500 }}>{mainNodeName ? `${mainNodeName} (${mainNodeId})` : mainNodeId}</span>
                    <span style={{ fontSize: 11, color: "#475569" }}>（上方已接线）</span>
                  </div>
                )}
                {joinExtraIncomings.map((nodeId) => {
                  const extraBlock = allBlocks.find((b: Block) => String(b.getFieldValue?.("NODE_ID") ?? b.id ?? "").trim() === nodeId);
                  const extraName = extraBlock ? String(extraBlock.getFieldValue?.("NODE_NAME") ?? extraBlock.type ?? "").trim() : "";
                  return (
                  <div key={nodeId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", background: "var(--color-block-bg, #f1f5f9)", borderRadius: 6 }}>
                    <span style={{ color: "#1e293b", fontWeight: 500 }} title={nodeId}>{extraName ? `${extraName} (${nodeId})` : nodeId}</span>
                    <button
                      type="button"
                      className="text-button"
                      style={{ padding: "2px 8px", fontSize: 12 }}
                      onClick={() => {
                        const next = joinExtraIncomings.filter((id) => id !== nodeId);
                        setJoinExtraIncomings(next);
                        block.setFieldValue(next.join(", "), "JOIN_EXTRA_INCOMINGS");
                        const total = (mainNodeId ? 1 : 0) + next.length;
                        block.setFieldValue(total >= 2 ? ` (${total}路)` : "", "JOIN_ROUTES_LABEL");
                        initialJoinExtraRef.current = [...next];
                        onSaved?.();
                      }}
                    >
                      移除
                    </button>
                  </div>
                  );
                })}
              </div>
              {suggestedBranchEnds.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="form-label" style={{ fontSize: 12, color: "#334155" }}>建议汇聚（并行分支末端）</span>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                    {suggestedBranchEnds.map((s) => (
                      <span key={s.nodeId} style={{ padding: "4px 8px", background: "#e0f2fe", borderRadius: 6, fontSize: 12, color: "#1e293b", fontWeight: 500 }}>
                        {s.name || s.nodeId}
                      </span>
                    ))}
                    <button
                      type="button"
                      className="text-button"
                      style={{ padding: "4px 10px", fontSize: 12, border: "1px solid #0ea5e9", borderRadius: 6, color: "#0ea5e9" }}
                      onClick={() => {
                        const toAdd = suggestedBranchEnds.map((s) => s.nodeId);
                        const next = [...joinExtraIncomings, ...toAdd];
                        setJoinExtraIncomings(next);
                        block.setFieldValue(next.join(", "), "JOIN_EXTRA_INCOMINGS");
                        const total = (mainNodeId ? 1 : 0) + next.length;
                        block.setFieldValue(total >= 2 ? ` (${total}路)` : "", "JOIN_ROUTES_LABEL");
                        initialJoinExtraRef.current = [...next];
                        onSaved?.();
                      }}
                    >
                      一键添加全部
                    </button>
                  </div>
                </div>
              )}
              {candidateBlocks.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <select
                    value=""
                    onChange={(e) => {
                      const nodeId = e.target.value;
                      if (!nodeId) return;
                      const next = [...joinExtraIncomings, nodeId];
                      setJoinExtraIncomings(next);
                      block.setFieldValue(next.join(", "), "JOIN_EXTRA_INCOMINGS");
                      const total = (mainNodeId ? 1 : 0) + next.length;
                      block.setFieldValue(total >= 2 ? ` (${total}路)` : "", "JOIN_ROUTES_LABEL");
                      initialJoinExtraRef.current = [...next];
                      e.target.value = "";
                      onSaved?.();
                    }}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", minWidth: 160 }}
                  >
                    <option value="">添加汇聚节点…</option>
                    {candidateBlocks.map((b: Block) => {
                      const id = String(b.getFieldValue?.("NODE_ID") ?? b.id ?? "").trim();
                      const name = String(b.getFieldValue?.("NODE_NAME") ?? b.type ?? "").trim();
                      return (
                        <option key={b.id} value={id}>
                          {name || id} ({id})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
            <small className="form-hint" style={{ gridColumn: "1 / -1" }}>
              将并行分支末端积木接到本块上方凹槽，或在此处「添加汇聚节点」指定其余分支；保存后 DSL 会包含所有汇聚关系。参考{" "}
              <a href="https://rulego.cc/pages/join/" target="_blank" rel="noopener noreferrer">汇聚</a>
            </small>
          </>
        );
      })()}
      {block.type === "rulego_groupAction" && (
        <>
          <label className="form-field">
            <span>matchRelationType</span>
            <select
              value={String(form.MATCH_RELATION_TYPE ?? "Success")}
              onChange={(e) => setForm((f) => ({ ...f, MATCH_RELATION_TYPE: e.target.value }))}
            >
              <option value="Success">Success</option>
              <option value="Failure">{UI_RELATION_FAILURE}</option>
            </select>
          </label>
          <label className="form-field">
            <span>matchNum（0=全部匹配）</span>
            <input
              type="number"
              min={0}
              value={String(form.MATCH_NUM ?? "0")}
              onChange={(e) => setForm((f) => ({ ...f, MATCH_NUM: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>timeout（秒）</span>
            <input
              type="number"
              min={0}
              value={String(form.GROUP_TIMEOUT ?? "0")}
              onChange={(e) => setForm((f) => ({ ...f, GROUP_TIMEOUT: e.target.value }))}
            />
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.GROUP_MERGE_TO_MAP)}
              onChange={(e) => setForm((f) => ({ ...f, GROUP_MERGE_TO_MAP: e.target.checked }))}
            />
            <span>mergeToMap</span>
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <span>组内节点槽位数量</span>
            <input
              type="number"
              min={1}
              max={8}
              value={String(form.GROUP_SLOT_COUNT ?? "1")}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  GROUP_SLOT_COUNT: String(Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1))),
                }))
              }
              style={{ width: 56 }}
            />
            <button
              type="button"
              className="text-button"
              style={{ padding: "4px 8px" }}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  GROUP_SLOT_COUNT: String(Math.min(8, (parseInt(String(f.GROUP_SLOT_COUNT ?? "1"), 10) || 1) + 1)),
                }))
              }
              disabled={parseInt(String(form.GROUP_SLOT_COUNT ?? "1"), 10) >= 8}
            >
              +1
            </button>
            <button
              type="button"
              className="text-button"
              style={{ padding: "4px 8px" }}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  GROUP_SLOT_COUNT: String(Math.max(1, (parseInt(String(f.GROUP_SLOT_COUNT ?? "1"), 10) || 1) - 1)),
                }))
              }
              disabled={parseInt(String(form.GROUP_SLOT_COUNT ?? "1"), 10) <= 1}
            >
              -1
            </button>
          </label>
          <small className="form-hint" style={{ gridColumn: "1 / -1" }}>
            画布上会同步显示对应数量的「组内节点N」槽位（1～8）。参考{" "}
            <a href="https://rulego.cc/pages/group-action/" target="_blank" rel="noopener noreferrer">节点组</a>
          </small>
        </>
      )}
      {block.type === "rulego_for" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>range（遍历目标表达式）</span>
            <input
              value={String(form.FOR_RANGE ?? "1..3")}
              onChange={(e) => setForm((f) => ({ ...f, FOR_RANGE: e.target.value }))}
              placeholder="${msg.items} 或 1..3"
            />
            <small className="form-hint">如 ${"{msg.items}"}、1..3、${"{metadata.items}"}</small>
          </label>
          <label className="form-field">
            <span>do（遍历体）</span>
            <input
              value={String(form.FOR_DO ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FOR_DO: e.target.value }))}
              placeholder="留空则用上方 do 槽位连接的块；或填 chain:rule01"
            />
            <small className="form-hint">在画布「do 遍历体」槽位中连接一个或多个块；或填写子规则链如 chain:chainId</small>
          </label>
          <label className="form-field">
            <span>mode（结果合并方式）</span>
            <select
              value={String(form.FOR_MODE ?? "0")}
              onChange={(e) => setForm((f) => ({ ...f, FOR_MODE: e.target.value }))}
            >
              <option value="0">0 - 忽略</option>
              <option value="1">1 - 追加</option>
              <option value="2">2 - 覆盖</option>
              <option value="3">3 - 异步</option>
            </select>
          </label>
          <small className="form-hint" style={{ gridColumn: "1 / -1" }}>
            参考{" "}
            <a href="https://rulego.cc/pages/for/#%E9%85%8D%E7%BD%AE%E7%A4%BA%E4%BE%8B" target="_blank" rel="noopener noreferrer">
              遍历组件
            </a>
          </small>
        </>
      )}
      {(block.type === "rulego_jsFilter" ||
        block.type === "rulego_jsTransform" ||
        block.type === "rulego_jsSwitch") && (
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>脚本 (JS_SCRIPT)</span>
            <JsEditor
              value={String(form.JS_SCRIPT ?? "")}
              onChange={(v) => setForm((f) => ({ ...f, JS_SCRIPT: v }))}
              height={220}
              minHeight={120}
              showFormatButton
            />
          </label>
        )}
      {block.type === "rulego_flow" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>子规则链 (targetId)</span>
            <select
              value={String(form.FLOW_TARGET_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FLOW_TARGET_ID: e.target.value }))}
              aria-label="选择子规则链"
            >
              <option value="">请选择子规则链</option>
              {subRuleChains.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name} ({sc.id})
                </option>
              ))}
            </select>
            <small className="form-hint">仅显示规则管理中 root 为 false 的子规则链，选择后自动填充 ID</small>
          </label>
          <label className="form-field">
            <span>继承子规则输出 (extend)</span>
            <input
              type="checkbox"
              checked={Boolean(form.FLOW_EXTEND)}
              onChange={(e) => setForm((f) => ({ ...f, FLOW_EXTEND: e.target.checked }))}
            />
            <small className="form-hint">
              true 时子规则链每个输出作为下一节点输入；false 时合并为 Success / {UI_RELATION_FAILURE}
            </small>
          </label>
        </>
      )}
      {block.type === "rulego_ref" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>引用目标 (targetId)</span>
            <select
              value={(() => {
                const v = String(form.REF_TARGET_ID ?? "").trim();
                const known = new Set([
                  ...refTargetSelectOptions.local.map((o) => o.value),
                  ...refTargetSelectOptions.remote.map((o) => o.value),
                ]);
                return v && !known.has(v) ? "__custom_preserved__" : v;
              })()}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "__custom_preserved__") return;
                setForm((f) => ({ ...f, REF_TARGET_ID: raw }));
              }}
              aria-label="选择引用节点"
            >
              <option value="">请选择节点或规则链中的节点</option>
              {(() => {
                const v = String(form.REF_TARGET_ID ?? "").trim();
                const known = new Set([
                  ...refTargetSelectOptions.local.map((o) => o.value),
                  ...refTargetSelectOptions.remote.map((o) => o.value),
                ]);
                if (v && !known.has(v)) {
                  return <option value="__custom_preserved__">{`${v}（当前值，可改下方输入）`}</option>;
                }
                return null;
              })()}
              {refTargetSelectOptions.local.length > 0 && (
                <optgroup label="当前规则链（仅 nodeId）">
                  {refTargetSelectOptions.local.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {refTargetSelectOptions.remote.length > 0 && (
                <optgroup label="其它规则链（chainId:nodeId）">
                  {refTargetSelectOptions.remote.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <input
              type="text"
              value={String(form.REF_TARGET_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, REF_TARGET_ID: e.target.value }))}
              placeholder="node_1 或 ynlLYSAgCy2J:node_2"
              style={{ marginTop: 8 }}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
            <small className="form-hint">
              本链填节点 ID；跨链为「规则链 ID:节点 ID」。也可直接在下框编辑。详见{" "}
              <a href="https://rulego.cc/pages/ref/#%E9%85%8D%E7%BD%AE" target="_blank" rel="noopener noreferrer">
                节点引用
              </a>
            </small>
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.REF_TELL_CHAIN)}
              onChange={(e) => setForm((f) => ({ ...f, REF_TELL_CHAIN: e.target.checked }))}
            />
            <span>从目标起执行整条子链 (tellChain)</span>
          </label>
        </>
      )}
      {block.type === "rulego_delay" && (
        <>
          <label className="form-field">
            <span>延迟时间 (ms)</span>
            <input
              value={String(form.DELAY_MS ?? "60000")}
              onChange={(e) => setForm((f) => ({ ...f, DELAY_MS: e.target.value }))}
              placeholder={`60000 或 \${metadata.delay}`}
            />
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.DELAY_OVERWRITE)}
              onChange={(e) => setForm((f) => ({ ...f, DELAY_OVERWRITE: e.target.checked }))}
            />
            <span>周期内覆盖 (overwrite)</span>
          </label>
        </>
      )}
      {block.type === "rulego_startTrigger" && (
        <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
          规则链入口；无额外配置。须放在链首且全画布仅一个触发器。
        </p>
      )}
      {block.type === "rulego_endpoint_http" && (
        <>
          <label className="form-field">
            <span>监听地址 (configuration.server)</span>
            <input
              value={String(form.EP_SERVER ?? ":9090")}
              onChange={(e) => setForm((f) => ({ ...f, EP_SERVER: e.target.value }))}
              placeholder=":9090"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.EP_ALLOW_CORS)}
              onChange={(e) => setForm((f) => ({ ...f, EP_ALLOW_CORS: e.target.checked }))}
            />
            <span>允许 CORS (allowCors)</span>
          </label>
          <label className="form-field">
            <span>HTTP 方法 (router.params)</span>
            <input
              value={String(form.RT_METHOD ?? "POST")}
              onChange={(e) => setForm((f) => ({ ...f, RT_METHOD: e.target.value }))}
              placeholder="POST"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>路径 (from.path)</span>
            <input
              value={String(form.RT_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_PATH: e.target.value }))}
              placeholder="/api/v1/hook"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>转发目标 (to.path)</span>
            <input
              value={String(form.RT_TO ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_TO: e.target.value }))}
              placeholder="chain:default 或 chainId:nodeId"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.RT_WAIT)}
              onChange={(e) => setForm((f) => ({ ...f, RT_WAIT: e.target.checked }))}
            />
            <span>同步等待链结果 (to.wait)</span>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>To.processors（逗号分隔）</span>
            <input
              value={String(form.RT_TO_PROCESSORS ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_TO_PROCESSORS: e.target.value }))}
              placeholder="如 responseToBody"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>路由 ID (router.id，可选)</span>
            <input
              value={String(form.RT_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_ID: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>额外 routers（JSON 数组，可选）</span>
            <textarea
              rows={5}
              value={String(form.EP_EXTRA_ROUTERS_JSON ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_EXTRA_ROUTERS_JSON: e.target.value }))}
              placeholder='[ { "id": "r2", "from": {...}, "to": {...} } ]'
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              spellCheck={false}
            />
            <small className="form-hint">除主路由外追加的 metadata.endpoints[].routers 元素，须为合法 JSON 数组。</small>
          </label>
        </>
      )}
      {block.type === "rulego_endpoint_ws" && (
        <>
          <label className="form-field">
            <span>监听地址 (configuration.server)</span>
            <input
              value={String(form.EP_SERVER ?? ":9090")}
              onChange={(e) => setForm((f) => ({ ...f, EP_SERVER: e.target.value }))}
              placeholder=":9090"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>子协议 / Param（如 GET）</span>
            <input
              value={String(form.RT_METHOD ?? "GET")}
              onChange={(e) => setForm((f) => ({ ...f, RT_METHOD: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>路径 (from.path)</span>
            <input
              value={String(form.RT_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_PATH: e.target.value }))}
              placeholder="/ws"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>转发目标 (to.path)</span>
            <input
              value={String(form.RT_TO ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_TO: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.RT_WAIT)}
              onChange={(e) => setForm((f) => ({ ...f, RT_WAIT: e.target.checked }))}
            />
            <span>同步等待 (to.wait)</span>
          </label>
          <label className="form-field">
            <span>路由 ID (router.id，可选)</span>
            <input
              value={String(form.RT_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_ID: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>额外 routers（JSON 数组，可选）</span>
            <textarea
              rows={5}
              value={String(form.EP_EXTRA_ROUTERS_JSON ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_EXTRA_ROUTERS_JSON: e.target.value }))}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              spellCheck={false}
            />
          </label>
        </>
      )}
      {block.type === "rulego_endpoint_mqtt" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Broker (server)</span>
            <input
              value={String(form.EP_SERVER ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_SERVER: e.target.value }))}
              placeholder="127.0.0.1:1883"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>用户名</span>
            <input
              value={String(form.EP_USER ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_USER: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>密码</span>
            <input
              type="password"
              value={String(form.EP_PASS ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_PASS: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>QoS</span>
            <input
              type="number"
              min={0}
              max={2}
              value={String(form.EP_QOS ?? "1")}
              onChange={(e) => setForm((f) => ({ ...f, EP_QOS: e.target.value }))}
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>clientId</span>
            <input
              value={String(form.EP_CLIENT_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_CLIENT_ID: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>订阅主题 (from.path)</span>
            <input
              value={String(form.RT_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_PATH: e.target.value }))}
              placeholder="sensors/+/data"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>From.processors（逗号分隔）</span>
            <input
              value={String(form.RT_FROM_PROCESSORS ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_FROM_PROCESSORS: e.target.value }))}
              placeholder="setJsonDataType"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>转发目标 (to.path)</span>
            <input
              value={String(form.RT_TO ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_TO: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>路由 ID (router.id，可选)</span>
            <input
              value={String(form.RT_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_ID: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>额外 routers（JSON 数组，可选）</span>
            <textarea
              rows={5}
              value={String(form.EP_EXTRA_ROUTERS_JSON ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_EXTRA_ROUTERS_JSON: e.target.value }))}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              spellCheck={false}
            />
          </label>
        </>
      )}
      {block.type === "rulego_endpoint_schedule" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Cron 表达式 (from.path)</span>
            <input
              value={String(form.RT_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_PATH: e.target.value }))}
              placeholder="*/1 * * * * *"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>端点 processors（逗号分隔）</span>
            <input
              value={String(form.EP_PROCESSORS ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_PROCESSORS: e.target.value }))}
              placeholder="如 testPrint"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>转发目标 (to.path，可选)</span>
            <input
              value={String(form.RT_TO ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_TO: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>额外 routers（JSON 数组，可选）</span>
            <textarea
              rows={5}
              value={String(form.EP_EXTRA_ROUTERS_JSON ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_EXTRA_ROUTERS_JSON: e.target.value }))}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              spellCheck={false}
            />
          </label>
        </>
      )}
      {block.type === "rulego_endpoint_net" && (
        <>
          <label className="form-field">
            <span>协议 (protocol)</span>
            <input
              value={String(form.EP_PROTOCOL ?? "tcp")}
              onChange={(e) => setForm((f) => ({ ...f, EP_PROTOCOL: e.target.value }))}
              placeholder="tcp / udp"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>监听 (server)</span>
            <input
              value={String(form.EP_SERVER ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_SERVER: e.target.value }))}
              placeholder=":8888"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>匹配 (from.path，正则)</span>
            <input
              value={String(form.RT_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_PATH: e.target.value }))}
              placeholder=".*"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>转发目标 (to.path)</span>
            <input
              value={String(form.RT_TO ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RT_TO: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>额外 routers（JSON 数组，可选）</span>
            <textarea
              rows={5}
              value={String(form.EP_EXTRA_ROUTERS_JSON ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, EP_EXTRA_ROUTERS_JSON: e.target.value }))}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              spellCheck={false}
            />
          </label>
        </>
      )}
      {block.type === "rulego_apiRouteTracer_gitPrepare" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Git 仓库地址 (gitlabUrl)</span>
            <input
              value={String(form.GITLAB_URL ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, GITLAB_URL: e.target.value }))}
              placeholder="https://gitlab.com/group/repo.git 或 git@host:group/repo.git"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>工作目录 (workDir)</span>
            <input
              value={String(form.WORK_DIR ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, WORK_DIR: e.target.value }))}
              placeholder="父目录；仓库克隆为 workDir 下与 URL 末段同名的子目录"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            二者均支持 <code>{"${...}"}</code> 模板。若 <code>workDir/&lt;仓库名&gt;</code> 已存在且含 <code>.git</code>，则在该目录执行 <code>git pull</code>；否则在{" "}
            <code>workDir</code> 下执行 <code>git clone</code>。成功后在 metadata 写入 <code>api_route_tracer_service_path</code> 等，供下游节点使用。
          </p>
        </>
      )}
      {block.type === "rulego_cursorAcp" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Agent 可执行文件</span>
            <select
              value={String(form.ACP_AGENT_PRESET ?? "path")}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({
                  ...f,
                  ACP_AGENT_PRESET: v,
                  ...(v === "path"
                    ? { AGENT_CMD: "agent" }
                    : v === "local"
                      ? { AGENT_CMD: "~/.local/bin/agent" }
                      : {}),
                }));
              }}
            >
              {cursorAcpAgentPresetOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {form.ACP_AGENT_PRESET === "custom" && (
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>自定义命令或路径 (agentCommand)</span>
              <input
                value={String(form.AGENT_CMD ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, AGENT_CMD: e.target.value }))}
                placeholder="例如 /opt/cursor/bin/agent"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
            </label>
          )}
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>执行超时</span>
            <select
              value={String(form.ACP_TIMEOUT_PRESET ?? "1800")}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({
                  ...f,
                  ACP_TIMEOUT_PRESET: v,
                  ...(v !== "custom" ? { TIMEOUT_SEC: v } : {}),
                }));
              }}
            >
              {cursorAcpTimeoutPresetOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {form.ACP_TIMEOUT_PRESET === "custom" && (
            <label className="form-field">
              <span>自定义超时（秒）</span>
              <input
                type="number"
                min={30}
                value={String(form.TIMEOUT_SEC ?? "1800")}
                onChange={(e) => setForm((f) => ({ ...f, TIMEOUT_SEC: e.target.value }))}
              />
            </label>
          )}
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>ACP 会话模式 (sessionMode)</span>
            <select
              value={String(form.ACP_SESSION_MODE ?? "agent")}
              onChange={(e) => setForm((f) => ({ ...f, ACP_SESSION_MODE: e.target.value }))}
            >
              {cursorAcpSessionModeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>工具权限自动批复 (permissionOptionId)</span>
            <select
              value={String(form.PERM_OPTION ?? "allow-once")}
              onChange={(e) => setForm((f) => ({ ...f, PERM_OPTION: e.target.value }))}
            >
              {cursorAcpPermissionOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>CLI 附加参数（须含 acp）</span>
            <select
              value={String(form.ACP_ARGS_PRESET ?? "default")}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({
                  ...f,
                  ACP_ARGS_PRESET: v,
                  ...(v === "default"
                    ? { ACP_ARGS_JSON: "[]" }
                    : v === "k_acp"
                      ? { ACP_ARGS_JSON: JSON.stringify(["-k", "acp"]) }
                      : {}),
                }));
              }}
            >
              {cursorAcpArgsPresetOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {form.ACP_ARGS_PRESET === "custom" && (
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>自定义 args（JSON 数组）</span>
              <textarea
                value={String(form.ACP_ARGS_JSON ?? "[]")}
                onChange={(e) => setForm((f) => ({ ...f, ACP_ARGS_JSON: e.target.value }))}
                placeholder='例如 ["-k","acp"]'
                rows={3}
                style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
            </label>
          )}
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>默认工作目录 (workDir，可选，支持 ~/ 展开)</span>
            <input
              value={String(form.WORK_DIR ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, WORK_DIR: e.target.value }))}
              placeholder="可被 metadata cursor_acp_cwd 或 api_route_tracer_service_path 覆盖"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            提示词完全来自上游消息的 <code>msg.Data</code>（此处无需填写）。工作目录优先 metadata <code>cursor_acp_cwd</code>，否则{" "}
            <code>api_route_tracer_service_path</code>，否则本块 workDir。需本机已安装 Cursor CLI 并完成 <code>agent login</code> 或配置{" "}
            <code>CURSOR_API_KEY</code>。Plan/Ask 模式通过 <code>session/new</code> 传参（若当前 CLI 版本不支持可能需去掉该配置）。
          </p>
        </>
      )}
      {block.type === "rulego_sourcegraphSearch" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>实例地址 (endpoint)</span>
            <input
              value={String(form.SG_ENDPOINT ?? "https://sourcegraph.com")}
              onChange={(e) => setForm((f) => ({ ...f, SG_ENDPOINT: e.target.value }))}
              placeholder="https://sourcegraph.com 或自建域名"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              支持 <code>{"${...}"}</code> 模板（RuleGo 环境 / 消息 <code>metadata</code>），例如{" "}
              <code>https://sourcegraph.${"{metadata.sg_host}"}.com</code>
            </small>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>访问令牌 (accessToken，可选)</span>
            <input
              type="password"
              value={String(form.SG_TOKEN ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, SG_TOKEN: e.target.value }))}
              placeholder="Sourcegraph access token"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              支持 <code>{"${...}"}</code> 模板；勿把真实密钥写进可分享 DSL，可改为 <code>{"${metadata.sourcegraph_token}"}</code> 等
            </small>
          </label>
          <label className="form-field">
            <span>超时 (秒)</span>
            <input
              type="number"
              value={String(form.SG_TIMEOUT_SEC ?? "30")}
              onChange={(e) => setForm((f) => ({ ...f, SG_TIMEOUT_SEC: e.target.value }))}
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>固定数字，不支持 {"${...}"} 模板</small>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>默认搜索词 (defaultSearchQuery，可选)</span>
            <input
              value={String(form.SG_DEFAULT_QUERY ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, SG_DEFAULT_QUERY: e.target.value }))}
              placeholder="无消息 data 时使用；否则以 data 为准"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              支持 <code>{"${...}"}</code> 模板；接上游「查询构建」时可填{" "}
              <code>{"${metadata.sourcegraph_built_query}"}</code>
            </small>
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            调用 <code>/.api/graphql</code>；消息 <code>data</code> 可为纯文本或 JSON{" "}
            <code>{"{\"query\":\"repo:foo/bar func\"}"}</code>（有 data 时优先于默认搜索词）。鉴权头为 <code>Authorization: token …</code>。
          </p>
        </>
      )}
      {block.type === "rulego_sourcegraphQueryBuild" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>默认 pattern 类型 (defaultPatternType，无上游 data 时使用)</span>
            <select
              value={String(form.SGQB_DEFAULT_PATTERN_TYPE ?? "literal") === "regexp" ? "regexp" : "literal"}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_DEFAULT_PATTERN_TYPE: e.target.value }))}
              className="rulego-sourcegraph-scope-select"
              style={{ padding: "6px 10px", borderRadius: 8, maxWidth: "100%" }}
            >
              <option value="literal">literal（普通字符串，适合 URL 路径等）</option>
              <option value="regexp">regexp（正则）</option>
            </select>
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              支持在 DSL 中写 <code>{"${...}"}</code> 模板；侧栏仅 literal / regexp 两档
            </small>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>默认搜索路径 / pattern (defaultPatterns，每行一条)</span>
            <textarea
              value={String(form.SGQB_DEFAULT_PATTERNS ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_DEFAULT_PATTERNS: e.target.value }))}
              placeholder={"/api/v1/users\n/invoice/list"}
              rows={5}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%", resize: "vertical" }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              当消息 <code>data</code> 为空、或 JSON 中 <code>patterns</code> 为空时，使用此处内容（渲染 <code>{"${...}"}</code> 后按行拆分，空行忽略）。有有效上游{" "}
              <code>data</code> 时仍以 <code>data</code> 为准。
            </small>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>仓库范围 (repoScope)</span>
            <select
              value={["", "frontend", "backend"].includes(String(form.SGQB_REPO_SCOPE ?? "").trim()) ? String(form.SGQB_REPO_SCOPE ?? "").trim() : ""}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_REPO_SCOPE: e.target.value }))}
              className="rulego-sourcegraph-scope-select"
              style={{ padding: "6px 10px", borderRadius: 8, maxWidth: "100%" }}
            >
              <option value="">不限仓库</option>
              <option value="frontend">前端仓库（repo 正则见下）</option>
              <option value="backend">后端仓库（repo 正则见下）</option>
            </select>
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              侧栏仅保存固定值（空 / frontend / backend）。若要在运行时按 metadata 切换范围，请在规则 DSL 里把{" "}
              <code>configuration.repoScope</code> 写成含 <code>{"${...}"}</code> 的字符串。
            </small>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>前端 repo 正则 (repoFrontend，scope=frontend 时拼成 repo:(…))</span>
            <input
              value={String(form.SGQB_REPO_FRONTEND ?? DEFAULT_SOURCEGRAPH_REPO_FRONTEND)}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_REPO_FRONTEND: e.target.value }))}
              placeholder={DEFAULT_SOURCEGRAPH_REPO_FRONTEND}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              支持 <code>{"${...}"}</code> 模板（与下方后端正则、typeFilter、displayLimit 相同，运行时由后端渲染后再拼进查询串）
            </small>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>后端 repo 正则 (repoBackend，scope=backend 时拼成 repo:(…))</span>
            <input
              value={String(form.SGQB_REPO_BACKEND ?? DEFAULT_SOURCEGRAPH_REPO_BACKEND)}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_REPO_BACKEND: e.target.value }))}
              placeholder={DEFAULT_SOURCEGRAPH_REPO_BACKEND}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              支持 <code>{"${...}"}</code> 模板
            </small>
          </label>
          <label className="form-field" style={{ alignItems: "center" }}>
            <span>context:global</span>
            <input
              type="checkbox"
              checked={Boolean(form.SGQB_CONTEXT_GLOBAL)}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_CONTEXT_GLOBAL: e.target.checked }))}
            />
          </label>
          <div className="form-field" style={{ gridColumn: "1 / -1", marginTop: -4 }}>
            <small className="form-hint" style={{ display: "block", margin: 0 }}>
              侧栏为固定开关（写入 <code>true</code>/<code>false</code>）。若需按 metadata 动态决定，请在 DSL 的{" "}
              <code>configuration.contextGlobal</code> 中写 <code>{"${...}"}</code>，渲染为 true/1/yes/on 视为开启。
            </small>
          </div>
          <label className="form-field" style={{ alignItems: "center" }}>
            <span>fork:yes（含 fork）</span>
            <input
              type="checkbox"
              checked={Boolean(form.SGQB_INCLUDE_FORKED)}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_INCLUDE_FORKED: e.target.checked }))}
            />
          </label>
          <div className="form-field" style={{ gridColumn: "1 / -1", marginTop: -4 }}>
            <small className="form-hint" style={{ display: "block", margin: 0 }}>
              同上：侧栏固定；动态请改 DSL <code>configuration.includeForked</code> 为模板字符串。
            </small>
          </div>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>类型等过滤 (typeFilter，如 lang:typescript，可选)</span>
            <input
              value={String(form.SGQB_TYPE_FILTER ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_TYPE_FILTER: e.target.value }))}
              placeholder="留空则不加"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              支持 <code>{"${...}"}</code> 模板，例如 <code>lang:${"{metadata.lang}"}</code>
            </small>
          </label>
          <label className="form-field">
            <span>count 上限 (displayLimit)</span>
            <input
              type="number"
              value={String(form.SGQB_DISPLAY_LIMIT ?? "1500")}
              onChange={(e) => setForm((f) => ({ ...f, SGQB_DISPLAY_LIMIT: e.target.value }))}
              min={1}
            />
            <small className="form-hint" style={{ display: "block", marginTop: 6 }}>
              侧栏为数字；DSL 中也可写字符串模板（如 <code>{"${metadata.sg_count}"}</code>），渲染后须为正整数
            </small>
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            消息 <code>data</code> 为 LLM 预处理 JSON{" "}
            <code>{"{\"patternType\":\"literal|regexp\",\"patterns\":[\"...\"]}"}</code>，或纯文本（视为单条 literal）；无 data 时用上方「默认路径」。输出：{" "}
            <code>metadata.sourcegraph_built_query</code>（首条）、<code>metadata.sourcegraph_built_queries</code>（JSON 数组）、{" "}
            <code>data</code> 含 <code>query</code> 与 <code>queries</code>。
          </p>
          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>示例查询（取默认路径首行，若无则用 /api/example）</span>
            <pre className="rulego-sourcegraph-query-preview">
              {(() => {
                const scopeRaw = String(form.SGQB_REPO_SCOPE ?? "").trim();
                const scope = scopeRaw === "frontend" || scopeRaw === "backend" ? scopeRaw : "";
                const lim = parseInt(String(form.SGQB_DISPLAY_LIMIT ?? "1500"), 10);
                const pt = String(form.SGQB_DEFAULT_PATTERN_TYPE ?? "literal") === "regexp" ? "regexp" : "literal";
                const lines = String(form.SGQB_DEFAULT_PATTERNS ?? "")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const samplePath = lines[0] ?? "/api/example";
                return buildTracerSourcegraphQueryWithScope(pt, samplePath, {
                  repoScope: scope,
                  repoFrontend: String(form.SGQB_REPO_FRONTEND ?? ""),
                  repoBackend: String(form.SGQB_REPO_BACKEND ?? ""),
                  contextGlobal: Boolean(form.SGQB_CONTEXT_GLOBAL),
                  typeFilter: String(form.SGQB_TYPE_FILTER ?? ""),
                  includeForked: Boolean(form.SGQB_INCLUDE_FORKED),
                  displayLimit: Number.isFinite(lim) && lim > 0 ? lim : 1500,
                });
              })()}
            </pre>
          </div>
        </>
      )}
      {block.type === "rulego_volcTlsSearchLogs" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Endpoint（留空则 <code>https://tls.&lt;Region&gt;.volces.com</code>）</span>
            <input
              value={String(form.TLS_ENDPOINT ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, TLS_ENDPOINT: e.target.value }))}
              placeholder="一般留空即可"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Region</span>
            <select
              value={volcTlsKnownRegionSet.has(String(form.TLS_REGION ?? "").trim()) ? String(form.TLS_REGION ?? "cn-beijing") : "__custom__"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") {
                  setForm((f) => ({ ...f, TLS_REGION: volcTlsKnownRegionSet.has(String(f.TLS_REGION ?? "").trim()) ? "" : String(f.TLS_REGION ?? "") }));
                } else {
                  setForm((f) => ({ ...f, TLS_REGION: v }));
                }
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", maxWidth: "100%" }}
            >
              {VOLC_TLS_KNOWN_REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
              <option value="__custom__">其他区域（下方填写代码）</option>
            </select>
          </label>
          {!volcTlsKnownRegionSet.has(String(form.TLS_REGION ?? "").trim()) ? (
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>自定义 Region</span>
              <input
                value={String(form.TLS_REGION ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, TLS_REGION: e.target.value }))}
                placeholder="如 cn-beijing"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
            </label>
          ) : null}
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Access Key ID</span>
            <input
              value={String(form.TLS_AK ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, TLS_AK: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Secret Access Key</span>
            <input
              type="password"
              value={String(form.TLS_SK ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, TLS_SK: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Session Token（STS 可选）</span>
            <input
              type="password"
              value={String(form.TLS_SESSION_TOKEN ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, TLS_SESSION_TOKEN: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Topic ID</span>
            <input
              value={String(form.TLS_TOPIC_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, TLS_TOPIC_ID: e.target.value }))}
              placeholder="日志主题 ID（必填）"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>默认检索语句 (defaultQuery)</span>
            <input
              value={String(form.TLS_DEFAULT_QUERY ?? "*")}
              onChange={(e) => setForm((f) => ({ ...f, TLS_DEFAULT_QUERY: e.target.value }))}
              placeholder="* 或 TLS 检索语法"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>默认时间范围（无消息里 start/end 时使用；结束时间均为「当前请求时刻」）</span>
            <select
              value={String(form.TLS_TIME_PRESET ?? "last_15m")}
              onChange={(e) => setForm((f) => ({ ...f, TLS_TIME_PRESET: e.target.value }))}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", maxWidth: "100%" }}
            >
              {VOLC_TLS_TIME_PRESET_OPTIONS.map(([label, v]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {String(form.TLS_TIME_PRESET ?? "") === "custom" ? (
            <>
              <label className="form-field">
                <span>开始时间</span>
                <input
                  type="datetime-local"
                  value={String(form.TLS_CUSTOM_START_LOCAL ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, TLS_CUSTOM_START_LOCAL: e.target.value }))}
                />
              </label>
              <label className="form-field">
                <span>结束时间</span>
                <input
                  type="datetime-local"
                  value={String(form.TLS_CUSTOM_END_LOCAL ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, TLS_CUSTOM_END_LOCAL: e.target.value }))}
                />
              </label>
            </>
          ) : null}
          <label className="form-field">
            <span>排序</span>
            <select
              value={String(form.TLS_DEFAULT_SORT ?? "desc")}
              onChange={(e) => setForm((f) => ({ ...f, TLS_DEFAULT_SORT: e.target.value }))}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", width: "100%" }}
            >
              {VOLC_TLS_SORT_OPTIONS.map(([label, v]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>单次返回条数</span>
            <select
              value={
                VOLC_TLS_LIMIT_OPTIONS.some(([, v]) => v === String(form.TLS_LIMIT ?? "100"))
                  ? String(form.TLS_LIMIT ?? "100")
                  : "__custom__"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") {
                  setForm((f) => ({ ...f, TLS_LIMIT: "150" }));
                } else {
                  setForm((f) => ({ ...f, TLS_LIMIT: v }));
                }
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", width: "100%" }}
            >
              {VOLC_TLS_LIMIT_OPTIONS.map(([label, v]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
              <option value="__custom__">自定义…</option>
            </select>
          </label>
          {!VOLC_TLS_LIMIT_OPTIONS.some(([, v]) => v === String(form.TLS_LIMIT ?? "")) ? (
            <label className="form-field">
              <span>自定义条数 (1–500)</span>
              <input
                type="number"
                min={1}
                max={500}
                value={String(form.TLS_LIMIT ?? "100")}
                onChange={(e) => setForm((f) => ({ ...f, TLS_LIMIT: e.target.value }))}
              />
            </label>
          ) : null}
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>请求超时</span>
            <select
              value={["30", "60", "120", "180"].includes(String(form.TLS_TIMEOUT_SEC ?? "")) ? String(form.TLS_TIMEOUT_SEC ?? "60") : "__custom__"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") setForm((f) => ({ ...f, TLS_TIMEOUT_SEC: "90" }));
                else setForm((f) => ({ ...f, TLS_TIMEOUT_SEC: v }));
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", maxWidth: 280 }}
            >
              <option value="30">30 秒</option>
              <option value="60">60 秒</option>
              <option value="120">120 秒</option>
              <option value="180">180 秒</option>
              <option value="__custom__">自定义秒数…</option>
            </select>
            {!["30", "60", "120", "180"].includes(String(form.TLS_TIMEOUT_SEC ?? "")) ? (
              <input
                type="number"
                min={1}
                max={600}
                value={String(form.TLS_TIMEOUT_SEC ?? "60")}
                onChange={(e) => setForm((f) => ({ ...f, TLS_TIMEOUT_SEC: e.target.value }))}
                style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", maxWidth: 160 }}
              />
            ) : null}
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.TLS_HIGHLIGHT)}
              onChange={(e) => setForm((f) => ({ ...f, TLS_HIGHLIGHT: e.target.checked }))}
            />
            <span>默认开启检索高亮（消息 JSON 里 highLight 可覆盖）</span>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.TLS_API_V3)}
              onChange={(e) => setForm((f) => ({ ...f, TLS_API_V3: e.target.checked }))}
            />
            <span>使用 API 0.3.0（SearchLogsV2，与控制台检索一致）</span>
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            成功时消息 data 为 TLS 返回 JSON。上游仍可用纯文本作 query，或 JSON 覆盖{" "}
            <code>startTime</code>/<code>endTime</code>/<code>sort</code>/<code>highLight</code> 等；未传时间字段时使用上面默认时间范围。
          </p>
        </>
      )}
      {block.type === "rulego_opensearchSearch" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Endpoint</span>
            <select
              value={
                openSearchRecentEndpoints.includes(String(form.OS_ENDPOINT ?? "https://localhost:9200"))
                  ? String(form.OS_ENDPOINT ?? "https://localhost:9200")
                  : "__custom__"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") setForm((f) => ({ ...f, OS_ENDPOINT: "https://localhost:9200" }));
                else setForm((f) => ({ ...f, OS_ENDPOINT: v }));
              }}
              style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", maxWidth: 420 }}
            >
              {openSearchRecentEndpoints.map((ep) => (
                <option key={ep} value={ep}>
                  {ep}
                </option>
              ))}
              <option value="__custom__">自定义 Endpoint…</option>
            </select>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>最近地址最多保留 5 条</span>
              <button
                type="button"
                onClick={() => {
                  clearOpenSearchRecentEndpoints();
                  setOpenSearchRecentEndpoints([]);
                }}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#475569",
                  padding: "4px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                清空最近 Endpoint
              </button>
            </div>
            <input
              value={String(form.OS_ENDPOINT ?? "https://localhost:9200")}
              onChange={(e) => setForm((f) => ({ ...f, OS_ENDPOINT: e.target.value }))}
              placeholder="https://host:9200"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
            <span className="form-hint">支持模板变量，例如：<code>https://${"{metadata.os_host}"}:9200</code></span>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Index（单索引、逗号多索引或通配）</span>
            <select
              value={
                openSearchRecentIndexes.includes(String(form.OS_INDEX ?? ""))
                  ? String(form.OS_INDEX ?? "")
                  : "__none__"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "__none__") setForm((f) => ({ ...f, OS_INDEX: v }));
              }}
              style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", maxWidth: 420 }}
            >
              <option value="__none__">最近使用索引（可选）</option>
              {openSearchRecentIndexes.map((idx) => (
                <option key={idx} value={idx}>
                  {idx}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>最近索引最多保留 10 条</span>
              <button
                type="button"
                onClick={() => {
                  clearOpenSearchRecentIndexes();
                  setOpenSearchRecentIndexes([]);
                }}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#475569",
                  padding: "4px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                清空最近索引
              </button>
            </div>
            <input
              value={String(form.OS_INDEX ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, OS_INDEX: e.target.value }))}
              placeholder="例如：teacherschool-channel-platform-server*"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
            <span className="form-hint">支持模板变量，例如：<code>teacherschool-${"{metadata.env}"}-server*</code></span>
          </label>
          <label className="form-field">
            <span>认证方式</span>
            <select
              value={String(form.OS_AUTH_MODE ?? "none")}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "none") setForm((f) => ({ ...f, OS_AUTH_MODE: v, OS_USER: "", OS_PASS: "" }));
                else setForm((f) => ({ ...f, OS_AUTH_MODE: v }));
              }}
            >
              <option value="none">无认证</option>
              <option value="basic">Basic 认证（用户名/密码）</option>
            </select>
          </label>
          <label className="form-field">
            <span>TLS 校验</span>
            <select
              value={String(form.OS_TLS_MODE ?? "strict")}
              onChange={(e) => setForm((f) => ({ ...f, OS_TLS_MODE: e.target.value }))}
            >
              <option value="strict">严格校验证书</option>
              <option value="insecure">跳过证书校验（开发）</option>
            </select>
          </label>
          {String(form.OS_AUTH_MODE ?? "none") === "basic" ? (
            <>
              <label className="form-field">
                <span>用户名（可选）</span>
                <input
                  value={String(form.OS_USER ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, OS_USER: e.target.value }))}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                />
              </label>
              <label className="form-field">
                <span>密码（可选）</span>
                <input
                  type="password"
                  value={String(form.OS_PASS ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, OS_PASS: e.target.value }))}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                />
              </label>
            </>
          ) : null}
          <label className="form-field">
            <span>超时 (秒)</span>
            <select
              value={
                String(form.OS_TIMEOUT_MODE ?? "preset") === "custom"
                  ? "__custom__"
                  : OPENSEARCH_TIMEOUT_OPTIONS.some(([, v]) => v === String(form.OS_TIMEOUT_SEC ?? "60"))
                  ? String(form.OS_TIMEOUT_SEC ?? "60")
                  : "__custom__"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") {
                  setForm((f) => ({ ...f, OS_TIMEOUT_MODE: "custom", OS_TIMEOUT_SEC: String(f.OS_TIMEOUT_SEC ?? "") || "90" }));
                } else {
                  setForm((f) => ({ ...f, OS_TIMEOUT_MODE: "preset", OS_TIMEOUT_SEC: v }));
                }
              }}
            >
              {OPENSEARCH_TIMEOUT_OPTIONS.map(([label, value]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              <option value="__custom__">自定义秒数…</option>
            </select>
            {String(form.OS_TIMEOUT_MODE ?? "preset") === "custom" ? (
              <input
                style={{ marginTop: 8 }}
                type="number"
                min={1}
                max={600}
                value={String(form.OS_TIMEOUT_SEC ?? "60")}
                onChange={(e) => setForm((f) => ({ ...f, OS_TIMEOUT_SEC: e.target.value }))}
              />
            ) : null}
          </label>
          <label className="form-field">
            <span>搜索类型（search_type）</span>
            <select
              value={String(form.OS_SEARCH_TYPE ?? "query_then_fetch")}
              onChange={(e) => setForm((f) => ({ ...f, OS_SEARCH_TYPE: e.target.value }))}
            >
              <option value="query_then_fetch">query_then_fetch（默认，速度优先）</option>
              <option value="dfs_query_then_fetch">dfs_query_then_fetch（精度优先）</option>
            </select>
          </label>
          <label className="form-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.OS_IGNORE_UNAVAILABLE)}
              onChange={(e) => setForm((f) => ({ ...f, OS_IGNORE_UNAVAILABLE: e.target.checked }))}
            />
            <span>忽略不可用索引（ignore_unavailable）</span>
          </label>
          <label className="form-field">
            <span>日志条数</span>
            <select
              value={["20", "50", "100", "200", "500"].includes(String(form.OS_SIZE ?? "100")) ? String(form.OS_SIZE ?? "100") : "__custom__"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") setForm((f) => ({ ...f, OS_SIZE: "100" }));
                else setForm((f) => ({ ...f, OS_SIZE: v }));
              }}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="__custom__">自定义…</option>
            </select>
            {!["20", "50", "100", "200", "500"].includes(String(form.OS_SIZE ?? "")) ? (
              <input
                style={{ marginTop: 8 }}
                type="number"
                min={1}
                max={5000}
                value={String(form.OS_SIZE ?? "100")}
                onChange={(e) => setForm((f) => ({ ...f, OS_SIZE: e.target.value }))}
              />
            ) : null}
          </label>
          <label className="form-field">
            <span>时间排序</span>
            <select
              value={String(form.OS_SORT_ORDER ?? "desc")}
              onChange={(e) => setForm((f) => ({ ...f, OS_SORT_ORDER: e.target.value }))}
            >
              <option value="desc">最新在前 (desc)</option>
              <option value="asc">最早在前 (asc)</option>
            </select>
          </label>
          <label className="form-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.OS_SOURCE_ENABLED)}
              onChange={(e) => setForm((f) => ({ ...f, OS_SOURCE_ENABLED: e.target.checked }))}
            />
            <span>返回 _source 字段</span>
          </label>
          <label className="form-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.OS_TRACK_TOTAL_HITS !== false}
              onChange={(e) => setForm((f) => ({ ...f, OS_TRACK_TOTAL_HITS: e.target.checked }))}
            />
            <span>精确统计总命中（track_total_hits）</span>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>时间范围</span>
            <select
              value={String(form.OS_TIME_PRESET ?? "all")}
              onChange={(e) => setForm((f) => ({ ...f, OS_TIME_PRESET: e.target.value }))}
              style={{ maxWidth: 320 }}
            >
              {OPENSEARCH_TIME_PRESET_OPTIONS.map(([label, value]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {String(form.OS_TIME_PRESET ?? "all") === "custom" ? (
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>开始时间</span>
                  <input
                    type="datetime-local"
                    value={String(form.OS_CUSTOM_START_LOCAL ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, OS_CUSTOM_START_LOCAL: e.target.value }))}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>结束时间</span>
                  <input
                    type="datetime-local"
                    value={String(form.OS_CUSTOM_END_LOCAL ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, OS_CUSTOM_END_LOCAL: e.target.value }))}
                  />
                </label>
              </div>
            ) : null}
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>过滤条件（可选，query_string）</span>
            <input
              value={String(form.OS_FILTER_TEXT ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, OS_FILTER_TEXT: e.target.value }))}
              placeholder='例如：level:error AND service:"api-gateway"'
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>请求体预览（自动生成）</span>
            <textarea
              rows={8}
              value={buildOpenSearchBodyFromForm(form)}
              readOnly
              style={{ width: "100%", fontFamily: "monospace", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}
              spellCheck={false}
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            POST <code>{"{endpoint}/{index}/_search"}</code>。未传消息 data 时使用上方表单自动生成的默认体；若消息 data 为 JSON 对象会覆盖默认体；若为纯文本会按{" "}
            <code>query_string</code> 检索。
          </p>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            模板语法：OpenSearch 的 <code>Endpoint</code>、<code>Index</code>、默认请求体都支持 <code>${"{...}"}</code>，可引用 <code>msg</code> 与{" "}
            <code>metadata</code>（如 <code>${"{metadata.env}"}</code>、<code>${"{msg.data}"}</code>）。
          </p>
        </>
      )}
      {block.type === "rulego_restApiCall" && (
        <>
          <label className="form-field">
            <span>URL</span>
            <input
              value={String(form.REST_URL ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, REST_URL: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>方法</span>
            <select
              value={String(form.REST_METHOD ?? "POST")}
              onChange={(e) => setForm((f) => ({ ...f, REST_METHOD: e.target.value }))}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Headers (JSON)</span>
            <JsonEditor
              value={String(form.REST_HEADERS ?? "{}")}
              onChange={(v) => setForm((f) => ({ ...f, REST_HEADERS: v }))}
              height={80}
              minHeight={60}
              showFormatButton
              showExpandButton
              expandTitle="HTTP Headers (JSON)"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Body</span>
            <JsonEditor
              value={String(form.REST_BODY ?? "")}
              onChange={(v) => setForm((f) => ({ ...f, REST_BODY: v }))}
              height={100}
              minHeight={60}
              showFormatButton
              showExpandButton
              expandTitle="HTTP 请求 Body"
            />
          </label>
          <label className="form-field">
            <span>超时 (ms)</span>
            <input
              type="number"
              value={String(form.REST_TIMEOUT ?? "30000")}
              onChange={(e) => setForm((f) => ({ ...f, REST_TIMEOUT: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>最大并发</span>
            <input
              value={String(form.REST_MAX_PARALLEL ?? "200")}
              onChange={(e) => setForm((f) => ({ ...f, REST_MAX_PARALLEL: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            后端 <code>restApiCall</code> 使用 FastHTTP 实现；配置与标准引擎一致。
          </p>
        </>
      )}
      {block.type === "rulego_feishuImMessage" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>App ID（飞书开放平台应用）</span>
            <input
              value={String(form.FS_APP_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FS_APP_ID: e.target.value }))}
              placeholder="cli_xxxxxxxx"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>App Secret</span>
            <input
              type="password"
              value={String(form.FS_APP_SECRET ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FS_APP_SECRET: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>接收者 ID 类型 (receive_id_type)</span>
            <select
              value={String(form.FS_RECEIVE_ID_TYPE ?? "open_id")}
              onChange={(e) => setForm((f) => ({ ...f, FS_RECEIVE_ID_TYPE: e.target.value }))}
            >
              <option value="open_id">open_id</option>
              <option value="union_id">union_id</option>
              <option value="user_id">user_id</option>
              <option value="email">email</option>
            </select>
          </label>
          <label className="form-field">
            <span>超时 (秒)</span>
            <input
              type="number"
              min={5}
              value={String(form.FS_TIMEOUT_SEC ?? "30")}
              onChange={(e) => setForm((f) => ({ ...f, FS_TIMEOUT_SEC: e.target.value }))}
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>{`接收者 ID (receiveId，支持模板如 \${metadata.xxx})`}</span>
            <input
              value={String(form.FS_RECEIVE_ID ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FS_RECEIVE_ID: e.target.value }))}
              placeholder={`ou_xxxxxxxx 或 \${metadata.feishu_open_id}`}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>正文模板 (text，msg_type 固定为 text)</span>
            <input
              value={String(form.FS_TEXT ?? "${data}")}
              onChange={(e) => setForm((f) => ({ ...f, FS_TEXT: e.target.value }))}
              placeholder={`\${data}`}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            调用 <code>auth/v3/tenant_access_token/internal</code> 与 <code>im/v1/messages</code>。应用需开通「以应用身份发消息」及对应用户权限。
            消息 data 可为纯文本（覆盖正文），或 JSON{" "}
            <code>{'{"receiveId":"ou_xxx","text":"你好"}'}</code> 覆盖接收者与正文。成功时下游 data 为飞书原始 JSON 响应。
          </p>
        </>
      )}
      {block.type === "rulego_fileRead" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>路径 path（支持 glob、模板变量）</span>
            <input
              value={String(form.FILE_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FILE_PATH: e.target.value }))}
              placeholder="/tmp/data.txt 或 /tmp/*.txt"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>数据格式 dataType</span>
            <select
              value={String(form.FILE_DATA_TYPE ?? "text")}
              onChange={(e) => setForm((f) => ({ ...f, FILE_DATA_TYPE: e.target.value }))}
            >
              <option value="text">text</option>
              <option value="base64">base64</option>
            </select>
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.FILE_RECURSIVE)}
              onChange={(e) => setForm((f) => ({ ...f, FILE_RECURSIVE: e.target.checked }))}
            />
            <span>递归匹配 recursive</span>
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            相对路径相对规则链 context 的 workDir；白名单由引擎 properties <code>filePathWhitelist</code> 控制。
          </p>
        </>
      )}
      {block.type === "rulego_fileWrite" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>路径 path</span>
            <input
              value={String(form.FILE_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FILE_PATH: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>内容 content（模板；空则使用消息 data）</span>
            <textarea
              rows={4}
              value={String(form.FILE_CONTENT ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FILE_CONTENT: e.target.value }))}
              placeholder={`\${data}`}
              style={{ width: "100%", minHeight: 80, resize: "vertical" }}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.FILE_APPEND)}
              onChange={(e) => setForm((f) => ({ ...f, FILE_APPEND: e.target.checked }))}
            />
            <span>追加写入 append</span>
          </label>
        </>
      )}
      {block.type === "rulego_fileDelete" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>路径 path（支持 glob）</span>
            <input
              value={String(form.FILE_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FILE_PATH: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            删除成功时 metadata <code>deletedCount</code> 为删除数量。
          </p>
        </>
      )}
      {block.type === "rulego_fileList" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>路径模式 path（glob）</span>
            <input
              value={String(form.FILE_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, FILE_PATH: e.target.value }))}
              placeholder="/tmp/*.txt"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.FILE_RECURSIVE)}
              onChange={(e) => setForm((f) => ({ ...f, FILE_RECURSIVE: e.target.checked }))}
            />
            <span>递归 recursive</span>
          </label>
        </>
      )}
      {(block.type === "rulego_rpaBrowserNavigate" ||
        block.type === "rulego_rpaBrowserClick" ||
        block.type === "rulego_rpaBrowserScreenshot" ||
        block.type === "rulego_rpaBrowserQuery") && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Chrome 远程调试地址 debuggerUrl</span>
            <input
              value={String(form.RPA_DEBUGGER_URL ?? "http://127.0.0.1:9222")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_DEBUGGER_URL: e.target.value }))}
              placeholder="http://127.0.0.1:9222"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            请先用 <code>--remote-debugging-port=9222</code> 等方式启动 Chrome，多步操作共享同一调试端口。
          </p>
        </>
      )}
      {block.type === "rulego_rpaBrowserNavigate" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>目标 URL（支持模板）</span>
            <input
              value={String(form.RPA_URL ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_URL: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>超时 timeoutMs</span>
            <input
              type="number"
              value={String(form.RPA_TIMEOUT_MS ?? "30000")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_TIMEOUT_MS: e.target.value }))}
            />
          </label>
        </>
      )}
      {block.type === "rulego_rpaBrowserClick" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>CSS 选择器 selector</span>
            <input
              value={String(form.RPA_SELECTOR ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_SELECTOR: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>鼠标键 button</span>
            <select
              value={String(form.RPA_BUTTON ?? "left")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_BUTTON: e.target.value }))}
            >
              <option value="left">左键</option>
              <option value="right">右键</option>
            </select>
          </label>
          <label className="form-field">
            <span>超时 timeoutMs</span>
            <input
              type="number"
              value={String(form.RPA_TIMEOUT_MS ?? "30000")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_TIMEOUT_MS: e.target.value }))}
            />
          </label>
        </>
      )}
      {block.type === "rulego_rpaBrowserScreenshot" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>元素选择器 selector（留空则视口整页）</span>
            <input
              value={String(form.RPA_SELECTOR ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_SELECTOR: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>超时 timeoutMs</span>
            <input
              type="number"
              value={String(form.RPA_TIMEOUT_MS ?? "30000")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_TIMEOUT_MS: e.target.value }))}
            />
          </label>
        </>
      )}
      {block.type === "rulego_rpaBrowserQuery" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>CSS 选择器 selector</span>
            <input
              value={String(form.RPA_SELECTOR ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_SELECTOR: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>查询模式 queryMode</span>
            <select
              value={String(form.RPA_QUERY_MODE ?? "text")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_QUERY_MODE: e.target.value }))}
            >
              <option value="text">text 文本</option>
              <option value="html">html 外层 HTML</option>
              <option value="value">value 表单值</option>
              <option value="attr">attr 属性</option>
            </select>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>属性名 attributeName（仅 attr 模式）</span>
            <input
              value={String(form.RPA_ATTRIBUTE_NAME ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_ATTRIBUTE_NAME: e.target.value }))}
              placeholder="href"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>超时 timeoutMs</span>
            <input
              type="number"
              value={String(form.RPA_TIMEOUT_MS ?? "30000")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_TIMEOUT_MS: e.target.value }))}
            />
          </label>
        </>
      )}
      {block.type === "rulego_rpaOcr" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>图像路径 imagePath（空则用消息 data 为 Base64 或 JSON 含 image_base64）</span>
            <input
              value={String(form.RPA_IMAGE_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_IMAGE_PATH: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>语言 lang</span>
            <input
              value={String(form.RPA_OCR_LANG ?? "eng")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_OCR_LANG: e.target.value }))}
              placeholder="eng / chi_sim+eng"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Tesseract 可执行文件 tesseractPath</span>
            <input
              value={String(form.RPA_TESSERACT_PATH ?? "tesseract")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_TESSERACT_PATH: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
        </>
      )}
      {block.type === "rulego_rpaScreenCapture" && (
        <>
          <label className="form-field">
            <span>模式 mode</span>
            <select
              value={String(form.RPA_CAPTURE_MODE ?? "full")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_CAPTURE_MODE: e.target.value }))}
            >
              <option value="full">全屏</option>
              <option value="region">区域</option>
            </select>
          </label>
          <label className="form-field">
            <span>区域 top</span>
            <input
              type="number"
              value={String(form.RPA_REGION_TOP ?? "0")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_REGION_TOP: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>区域 left</span>
            <input
              type="number"
              value={String(form.RPA_REGION_LEFT ?? "0")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_REGION_LEFT: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>宽 width</span>
            <input
              type="number"
              value={String(form.RPA_REGION_W ?? "800")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_REGION_W: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>高 height</span>
            <input
              type="number"
              value={String(form.RPA_REGION_H ?? "600")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_REGION_H: e.target.value }))}
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>保存路径 outputPath（空则仅返回 Base64 到 data）</span>
            <input
              value={String(form.RPA_CAPTURE_OUTPUT_PATH ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_CAPTURE_OUTPUT_PATH: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            仅 macOS 生效；使用系统 <code>screencapture</code>。非 macOS 上该节点会失败。
          </p>
        </>
      )}
      {block.type === "rulego_rpaMacWindow" && (
        <>
          <label className="form-field">
            <span>动作 action</span>
            <select
              value={String(form.RPA_MAC_ACTION ?? "frontmost")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_MAC_ACTION: e.target.value }))}
            >
              <option value="frontmost">frontmost 前置窗口信息</option>
              <option value="activate">activate 激活应用</option>
              <option value="list">list 列出窗口</option>
            </select>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>应用名 appName（activate 必填）</span>
            <input
              value={String(form.RPA_MAC_APP ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_MAC_APP: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>窗口标题 windowTitle（可选，尽力前置匹配窗口）</span>
            <input
              value={String(form.RPA_MAC_WINDOW_TITLE ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_MAC_WINDOW_TITLE: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            基于 AppleScript；仅 macOS。需为终端/DevPilot 授予自动化/辅助功能权限（视脚本而定）。
          </p>
        </>
      )}
      {block.type === "rulego_rpaDesktopClick" && (
        <>
          <label className="form-field">
            <span>屏幕 X（支持模板）</span>
            <input
              value={String(form.RPA_CLICK_X ?? "0")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_CLICK_X: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>屏幕 Y（支持模板）</span>
            <input
              value={String(form.RPA_CLICK_Y ?? "0")}
              onChange={(e) => setForm((f) => ({ ...f, RPA_CLICK_Y: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            仅 macOS；使用 System Events 的 <code>click at</code>，需为 DevPilot 开启辅助功能权限。
          </p>
        </>
      )}
      {block.type === "rulego_dbClient" && (
        <>
          <label className="form-field">
            <span>驱动 (driverName)</span>
            <input
              value={String(form.DB_DRIVER_NAME ?? "mysql")}
              onChange={(e) => setForm((f) => ({ ...f, DB_DRIVER_NAME: e.target.value }))}
              placeholder="mysql / postgres / sqlite 等"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>DSN 连接串</span>
            <input
              value={String(form.DB_DSN ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, DB_DSN: e.target.value }))}
              placeholder="如 root:root@tcp(127.0.0.1:3306)/test"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>连接池大小 (poolSize)</span>
            <input
              type="number"
              value={String(form.DB_POOL_SIZE ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, DB_POOL_SIZE: e.target.value }))}
              placeholder="可选"
            />
          </label>
          <label className="form-field">
            <span>操作类型 (opType)</span>
            <input
              value={String(form.DB_OP_TYPE ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, DB_OP_TYPE: e.target.value }))}
              placeholder="INSERT/UPDATE/DELETE/SELECT 或留空自动检测"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>SQL 语句（? 为占位符，下方将生成对应数量的参数输入）</span>
            <SqlEditor
              value={String(form.DB_SQL ?? "")}
              onChange={(value) => {
                setForm((f) => ({ ...f, DB_SQL: value }));
                const paramCount = (value.match(/\?/g) || []).length;
                setDbClientParams((prev) =>
                  Array.from({ length: paramCount }, (_, i) => prev[i] ?? { type: "string", value: "" })
                );
              }}
              height={140}
              minHeight={80}
            />
          </label>
          {(() => {
            const sql = String(form.DB_SQL ?? "");
            const paramCount = (sql.match(/\?/g) || []).length;
            if (paramCount === 0) return null;
            return (
              <div className="form-field" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="form-label">参数（按 SQL 中 ? 顺序，共 {paramCount} 个）</span>
                {Array.from({ length: paramCount }, (_, i) => {
                  const item = dbClientParams[i] ?? { type: "string" as const, value: "" };
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ minWidth: 48, fontSize: 13, color: "#64748b" }}>? {i + 1}</span>
                      <select
                        value={item.type}
                        onChange={(e) =>
                          setDbClientParams((prev) => {
                            const next = [...prev];
                            next[i] = { ...(next[i] ?? { type: "string", value: "" }), type: e.target.value as "string" | "number" };
                            return next;
                          })
                        }
                        style={{ width: 72, padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}
                      >
                        <option value="string">字符串</option>
                        <option value="number">数字</option>
                      </select>
                      <input
                        value={item.value}
                        onChange={(e) =>
                          setDbClientParams((prev) => {
                            const next = [...prev];
                            next[i] = { ...(next[i] ?? { type: "string", value: "" }), value: e.target.value };
                            return next;
                          })
                        }
                        placeholder={item.type === "number" ? "如 18 或 ${metadata.age}" : `如 ${"${metadata.id}"} 或字面值`}
                        style={{ flex: 1, minWidth: 120, padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}
                        autoCapitalize="off"
                        autoCorrect="off"
                        autoComplete="off"
                      />
                    </div>
                  );
                })}
                <span className="form-hint">支持组件配置变量；数字类型在 DSL 中会输出为 number</span>
              </div>
            );
          })()}
          <label className="form-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(form.DB_GET_ONE)}
              onChange={(e) => setForm((f) => ({ ...f, DB_GET_ONE: e.target.checked }))}
            />
            <span>仅返回一条 (getOne)</span>
          </label>
        </>
      )}
      {block.type === "rulego_llm" && (
        <div className="block-config-llm">
          <div className="block-config-llm-section">
            <div className="block-config-llm-section-title">连接与模型</div>
            {modelConfigs.length === 0 ? (
              <p className="form-hint" style={{ margin: 0 }}>
                请先在「模型管理」中添加配置，再在此选择连接与模型。
              </p>
            ) : (
              <>
                <label className="form-field" style={{ margin: 0 }}>
                  <span>选择配置</span>
                  <select
                    value={llmSelectedConfig?.id ?? ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      const config = modelConfigs.find((c) => c.id === id);
                      if (!config) return;
                      const currentModel = String(form.LLM_MODEL ?? "").trim();
                      const firstModel = config.models[0] ?? "";
                      const pick =
                        currentModel && config.models.includes(currentModel) ? currentModel : firstModel;
                      const chain = pick ? [pick, ...config.models.filter((x) => x !== pick)] : [];
                      setForm((f) => ({
                        ...f,
                        LLM_URL: config.baseUrl,
                        LLM_KEY: config.apiKey,
                        LLM_MODEL: pick,
                        LLM_MODELS_JSON: JSON.stringify(chain),
                      }));
                    }}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0" }}
                  >
                    <option value="">请选择配置</option>
                    {modelConfigs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.siteDescription || c.baseUrl}
                      </option>
                    ))}
                  </select>
                </label>
                {llmSelectedConfig && (
                  <>
                    <label className="form-field" style={{ margin: 0 }}>
                      <span>请求地址 (url)</span>
                      <input
                        readOnly
                        className="readonly-input"
                        value={String(form.LLM_URL ?? "")}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#64748b" }}
                      />
                    </label>
                    <label className="form-field" style={{ margin: 0 }}>
                      <span>API Key (key)</span>
                      <input
                        readOnly
                        type="password"
                        className="readonly-input"
                        value={String(form.LLM_KEY ?? "")}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#64748b" }}
                      />
                    </label>
                    <label className="form-field" style={{ margin: 0 }}>
                      <span>模型 (model)</span>
                      <select
                        value={String(form.LLM_MODEL ?? "")}
                        onChange={(e) => {
                          const newP = e.target.value;
                          setForm((f) => {
                            const ch = parseLlmModelsChainJson(
                              String(f.LLM_MODELS_JSON ?? ""),
                              String(f.LLM_MODEL ?? "")
                            );
                            const next = llmChainWithNewPrimary(llmModelOptions, ch, newP);
                            return {
                              ...f,
                              LLM_MODEL: newP,
                              LLM_MODELS_JSON: JSON.stringify(next),
                            };
                          });
                        }}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0" }}
                      >
                        {llmModelOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    {llmModelOptions.length > 1 ? (
                      <div className="form-field" style={{ margin: 0 }}>
                        <span>故障转移（勾选参与；顺序与模型管理一致）</span>
                        <small className="form-hint" style={{ display: "block", marginBottom: 8 }}>
                          主模型不可取消；当前模型请求失败时会依次尝试其他已勾选的模型。
                        </small>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {llmModelOptions.map((m) => {
                            const primary = String(form.LLM_MODEL ?? "").trim();
                            const chain = parseLlmModelsChainJson(
                              String(form.LLM_MODELS_JSON ?? ""),
                              primary
                            );
                            const checked = chain.includes(m);
                            return (
                              <label
                                key={m}
                                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={m === primary}
                                  onChange={(e) =>
                                    setForm((f) => {
                                      const prim = String(f.LLM_MODEL ?? "").trim();
                                      const ch = parseLlmModelsChainJson(
                                        String(f.LLM_MODELS_JSON ?? ""),
                                        prim
                                      );
                                      const next = toggleLlmModelInChain(
                                        llmModelOptions,
                                        ch,
                                        prim,
                                        m,
                                        e.target.checked
                                      );
                                      return {
                                        ...f,
                                        LLM_MODELS_JSON: JSON.stringify(next),
                                        LLM_MODEL: next[0] ?? prim,
                                      };
                                    })
                                  }
                                />
                                <span>
                                  {m}
                                  {m === primary ? "（主模型）" : ""}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>
          <div className="block-config-llm-section">
            <div className="block-config-llm-section-title">提示与消息</div>
            <label className="form-field" style={{ marginTop: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span>系统提示 (systemPrompt)</span>
                <button
                  type="button"
                  className="text-button"
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => {
                    setSystemPromptDraft(String(form.LLM_SYSTEM_PROMPT ?? ""));
                    setSystemPromptModalOpen(true);
                  }}
                >
                  放大编辑
                </button>
              </div>
              <textarea
                value={String(form.LLM_SYSTEM_PROMPT ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, LLM_SYSTEM_PROMPT: e.target.value }))}
                placeholder="可选，支持 ${} 占位符"
                rows={4}
                style={{ width: "100%", resize: "vertical", padding: 8, borderRadius: 6, border: "1px solid #e2e8f0" }}
              />
            </label>
            {systemPromptModalOpen && (
              <div
                className="modal-overlay"
                role="dialog"
                aria-modal="true"
                style={{ zIndex: 30 }}
                onClick={() => setSystemPromptModalOpen(false)}
              >
                <div
                  className="modal system-prompt-editor-modal"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="modal-header">
                    <h3>编辑系统提示词</h3>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setSystemPromptModalOpen(false)}
                      aria-label="关闭"
                    >
                      ×
                    </button>
                  </div>
                  <div className="modal-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <textarea
                      className="system-prompt-editor-textarea"
                      value={systemPromptDraft}
                      onChange={(e) => setSystemPromptDraft(e.target.value)}
                      placeholder="可选，支持 ${} 占位符"
                      spellCheck={false}
                    />
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="text-button" onClick={() => setSystemPromptModalOpen(false)}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        setForm((f) => ({ ...f, LLM_SYSTEM_PROMPT: systemPromptDraft }));
                        setSystemPromptModalOpen(false);
                      }}
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            )}
            <label className="form-field">
              <span>上下文消息 (messages) — JSON 数组</span>
              <JsonEditor
                value={String(form.LLM_MESSAGES_JSON ?? "[]")}
                onChange={(v) => setForm((f) => ({ ...f, LLM_MESSAGES_JSON: v }))}
                height={100}
                minHeight={80}
                showFormatButton
                showExpandButton
                expandTitle="上下文消息 messages (JSON)"
              />
              <small className="form-hint">每项: {`{ "role": "user" | "assistant", "content": "..." }`}，留空 [] 则使用 msg.Data 作为单条用户消息</small>
            </label>
          </div>
          <div className="block-config-llm-section">
            <div className="block-config-llm-section-title">启用技能（~/.devpilot/skills/）</div>
            <small className="form-hint" style={{ display: "block", marginBottom: 8 }}>
              勾选的技能会注入系统提示；不勾选则不注入任何技能
            </small>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto", padding: "4px 0" }}>
              {availableSkills.length === 0 ? (
                <span className="form-hint">暂无技能或未读取到 ~/.devpilot/skills/</span>
              ) : (
                availableSkills.map((sk) => {
                  const raw = String(form.LLM_ENABLED_SKILLS_JSON ?? "[]");
                  let enabled: string[] = [];
                  try {
                    const parsed = JSON.parse(raw);
                    enabled = Array.isArray(parsed) ? parsed : [];
                  } catch {
                    enabled = [];
                  }
                  const checked = enabled.includes(sk.name);
                  const toggle = () => {
                    const next = checked ? enabled.filter((n) => n !== sk.name) : [...enabled, sk.name];
                    setForm((f) => ({ ...f, LLM_ENABLED_SKILLS_JSON: JSON.stringify(next) }));
                  };
                  return (
                    <label key={sk.name} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} onChange={toggle} />
                      <span><strong>{sk.name}</strong></span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="block-config-llm-section block-config-llm-section-collapsible">
            <button
              type="button"
              className="block-config-llm-section-toggle"
              onClick={() => setLlmParamsExpanded((v) => !v)}
              aria-expanded={llmParamsExpanded}
            >
              <span className="block-config-llm-section-title">大模型参数 (params)</span>
              <span className="block-config-llm-section-chevron">{llmParamsExpanded ? "▼" : "▶"}</span>
            </button>
            {llmParamsExpanded && (
              <div className="block-config-llm-params-grid">
                <label className="form-field" style={{ margin: 0 }}>
                  <span>采样温度 (temperature)</span>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={String(form.LLM_TEMPERATURE ?? "0.6")}
                    onChange={(e) => setForm((f) => ({ ...f, LLM_TEMPERATURE: e.target.value }))}
                  />
                  <small className="form-hint">0–2，越大越随机</small>
                </label>
                <label className="form-field" style={{ margin: 0 }}>
                  <span>Top P (topP)</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={String(form.LLM_TOP_P ?? "0.75")}
                    onChange={(e) => setForm((f) => ({ ...f, LLM_TOP_P: e.target.value }))}
                  />
                  <small className="form-hint">0–1</small>
                </label>
                <label className="form-field" style={{ margin: 0 }}>
                  <span>已有标记惩罚 (presencePenalty)</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={String(form.LLM_PRESENCE_PENALTY ?? "0")}
                    onChange={(e) => setForm((f) => ({ ...f, LLM_PRESENCE_PENALTY: e.target.value }))}
                  />
                  <small className="form-hint">0–1</small>
                </label>
                <label className="form-field" style={{ margin: 0 }}>
                  <span>重复惩罚 (frequencyPenalty)</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={String(form.LLM_FREQUENCY_PENALTY ?? "0")}
                    onChange={(e) => setForm((f) => ({ ...f, LLM_FREQUENCY_PENALTY: e.target.value }))}
                  />
                  <small className="form-hint">0–1</small>
                </label>
                <label className="form-field" style={{ margin: 0 }}>
                  <span>最大输出长度 (maxTokens)</span>
                  <input
                    type="number"
                    min={0}
                    value={String(form.LLM_MAX_TOKENS ?? "0")}
                    onChange={(e) => setForm((f) => ({ ...f, LLM_MAX_TOKENS: e.target.value }))}
                  />
                  <small className="form-hint">0 表示使用模型默认</small>
                </label>
                <label className="form-field" style={{ margin: 0 }}>
                  <span>停止标记 (stop)</span>
                  <input
                    value={String(form.LLM_STOP ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, LLM_STOP: e.target.value }))}
                    placeholder="逗号分隔，如：\n, END"
                    autoCapitalize="off"
                  />
                </label>
                <label className="form-field" style={{ margin: 0 }}>
                  <span>输出格式 (responseFormat)</span>
                  <select
                    value={String(form.LLM_RESPONSE_FORMAT ?? "text")}
                    onChange={(e) => setForm((f) => ({ ...f, LLM_RESPONSE_FORMAT: e.target.value }))}
                  >
                    <option value="text">text（文本）</option>
                    <option value="json_object">json_object（JSON 对象）</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
      {block && block.type !== "rulego_join" && (() => {
        const workspace = workspaceRef.current;
        const allBlocks = workspace?.getAllBlocks?.(false) ?? [];
        const joinBlocks = allBlocks.filter((b: Block) => b.type === "rulego_join");
        const currentNodeId = String(block.getFieldValue?.("NODE_ID") ?? block.id ?? "").trim();
        if (joinBlocks.length === 0) return null;
        return (
          <div className="form-field" style={{ gridColumn: "1 / -1", flexDirection: "column", gap: 6, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
            <span className="form-label" style={{ fontSize: 12, color: "#64748b" }}>将此块汇聚到</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select
                ref={joinTargetSelectRef}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", minWidth: 160 }}
                defaultValue=""
              >
                <option value="">选择汇聚块…</option>
                {joinBlocks.map((j: Block) => {
                  const jId = String(j.getFieldValue?.("NODE_ID") ?? j.id ?? "").trim();
                  const jName = String(j.getFieldValue?.("NODE_NAME") ?? "汇聚").trim();
                  const extra = (j.getFieldValue?.("JOIN_EXTRA_INCOMINGS") as string) || "";
                  const already = extra ? extra.split(",").map((s) => s.trim()).filter(Boolean) : [];
                  const disabled = jId === currentNodeId || already.includes(currentNodeId);
                  return (
                    <option key={j.id} value={jId} disabled={disabled}>
                      {jName || jId} {disabled ? "(已汇聚)" : ""}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className="text-button"
                style={{ padding: "6px 12px", border: "1px solid #0ea5e9", borderRadius: 8, color: "#0ea5e9" }}
                onClick={() => {
                  const joinNodeId = joinTargetSelectRef.current?.value?.trim();
                  if (!joinNodeId || !workspace) return;
                  const joinBlock = allBlocks.find((b: Block) => String(b.getFieldValue?.("NODE_ID") ?? b.id ?? "").trim() === joinNodeId);
                  if (!joinBlock || joinBlock.type !== "rulego_join") return;
                  const extra = (joinBlock.getFieldValue?.("JOIN_EXTRA_INCOMINGS") as string) || "";
                  const list = extra ? extra.split(",").map((s) => s.trim()).filter(Boolean) : [];
                  if (list.includes(currentNodeId)) return;
                  const next = [...list, currentNodeId];
                  joinBlock.setFieldValue(next.join(", "), "JOIN_EXTRA_INCOMINGS");
                  const mainPrev = joinBlock.previousConnection?.targetBlock?.();
                  const total = (mainPrev ? 1 : 0) + next.length;
                  joinBlock.setFieldValue(total >= 2 ? ` (${total}路)` : "", "JOIN_ROUTES_LABEL");
                  onSaved?.();
                  if (joinTargetSelectRef.current) joinTargetSelectRef.current.value = "";
                }}
              >
                添加
              </button>
            </div>
            <small className="form-hint">将当前块作为一路汇聚到所选「汇聚」块，无需拖线。</small>
          </div>
        );
      })()}
    </div>
  );

  const formContent = inline ? (
    <form
      id={RULEGO_INLINE_BLOCK_FORM_ID}
      ref={formRef}
      className="block-config-inline-form"
      onSubmit={handleSubmit}
    >
      {formBody}
    </form>
  ) : (
    <form ref={formRef} className="modal-body modal-body-form" onSubmit={handleSubmit}>
      <div className="modal-body-scroll">
        {formBody}
      </div>
      <div className="modal-actions">
        <button type="button" className="text-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="primary-button" disabled={!block}>
          确定
        </button>
      </div>
    </form>
  );

  const handleMouseLeaveConfig = useCallback(() => {
    if (inline && block && isDirty()) setConfirmUnsavedOpen(true);
  }, [inline, block, isDirty]);

  if (inline) {
    return (
      <>
        <div className="rulego-props-sticky-top">
          <h2 className="rulego-props-sticky-top-title">属性设置</h2>
          <button
            type="submit"
            form={RULEGO_INLINE_BLOCK_FORM_ID}
            className="primary-button rulego-props-submit-btn"
            disabled={!block || !isDirty()}
          >
            确定
          </button>
        </div>
        {inlineSubmitFeedback ? (
          <div
            role="status"
            aria-live="polite"
            className={`rulego-props-submit-feedback ${inlineSubmitFeedback.type === "error" ? "is-error" : "is-success"}`}
          >
            {inlineSubmitFeedback.message}
          </div>
        ) : null}
        {sideError ? <div className="form-error rulego-props-side-error">{sideError}</div> : null}
        <div
          className="block-config-inline"
          onMouseLeave={handleMouseLeaveConfig}
        >
          <div className="block-config-inline-header">
            <h3>块属性</h3>
            <code className="rulego-block-config-type" title={block?.type ?? blockId}>
              {block?.type ?? blockId}
            </code>
          </div>
          {formContent}
        </div>
        {confirmUnsavedOpen && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => setConfirmUnsavedOpen(false)}
          >
            <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>未保存的修改</h3>
                <button type="button" className="text-button" onClick={() => setConfirmUnsavedOpen(false)} aria-label="关闭">×</button>
              </div>
              <div className="modal-body">
                <p className="confirm-text">有未保存的修改，是否保存？</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="text-button" onClick={() => setConfirmUnsavedOpen(false)}>
                  取消
                </button>
                <button type="button" className="text-button" onClick={() => { setConfirmUnsavedOpen(false); onClose(); }}>
                  不保存
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    formRef.current?.requestSubmit();
                    setConfirmUnsavedOpen(false);
                    onClose();
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <h3>编辑块配置 · {block?.type ?? blockId}</h3>
          <button type="button" className="text-button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {formContent}
      </div>
    </div>
  );
}

export default function RuleGoScratchEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rules, create, update } = useRuleGoRules();
  const workspaceRef = useRef<WorkspaceSvg | null>(null);
  /** 程序化 load 画布时跳过 handleChange，避免只更新 dsl、未同步 savedDsl 而长期显示「未保存」 */
  const suppressWorkspaceDslSyncRef = useRef(false);
  /**
   * workspace 注入的 useEffect 依赖 []，内部 handleChange 若直接闭包引用 buildRuleGoDsl，会永远用「首帧」的 id/editingRule。
   * 新建页首帧无 id → ruleChain.id 恒为 rule01；保存后跳转真实 id，effect 里 savedDsl 已是 UUID，handleChange 仍写 rule01 → 永久未保存。
   */
  const buildRuleGoDslRef = useRef<
    | ((
        workspace: WorkspaceSvg,
        ruleName?: string,
        debugModeParam?: boolean,
        rootParam?: boolean,
        enabledParam?: boolean
      ) => string)
    | null
  >(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [dsl, setDsl] = useState("");
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerLayoutError, setTriggerLayoutError] = useState<string | null>(null);
  const setTriggerLayoutErrorRef = useRef(setTriggerLayoutError);
  setTriggerLayoutErrorRef.current = setTriggerLayoutError;
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [root, setRoot] = useState(true);
  const [enabledDraftInModal, setEnabledDraftInModal] = useState(true);
  const [debugDraftInModal, setDebugDraftInModal] = useState(false);
  const [nameModalError, setNameModalError] = useState<string | null>(null);
  const [viewDslOpen, setViewDslOpen] = useState(false);
  const [dslCopyFeedback, setDslCopyFeedback] = useState<string | null>(null);
  const [importDslOpen, setImportDslOpen] = useState(false);
  const [importDslText, setImportDslText] = useState("");
  const [importDslError, setImportDslError] = useState<string | null>(null);
  const importDslFileRef = useRef<HTMLInputElement>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testMessageType, setTestMessageType] = useState("default");
  const [testMetadataJson, setTestMetadataJson] = useState("{}");
  const [testDataJson, setTestDataJson] = useState("{}");
  const [testResult, setTestResult] = useState<ExecuteRuleOutput | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  /** 多轮对话：上一轮的用户+助手消息列表，用于「继续对话」时带给后端 */
  const [testConversationHistory, setTestConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [testFollowUpInput, setTestFollowUpInput] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" } | { type: "error"; message: string } | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  /** 上次保存或加载时的 DSL，用于判断是否有未保存变更 */
  const [savedDsl, setSavedDsl] = useState("");

  useEffect(() => {
    if (!saveFeedback) return;
    const delay = saveFeedback.type === "error" ? 2000 : 1000;
    const t = setTimeout(() => setSaveFeedback(null), delay);
    return () => clearTimeout(t);
  }, [saveFeedback]);
  const [blockCount, setBlockCount] = useState(0);
  /** 与 Blockly workspace 缩放同步，便于工具栏显示与滚轮缩放后刷新 */
  const [zoomPercent, setZoomPercent] = useState(90);
  const [librarySearchKeyword, setLibrarySearchKeyword] = useState("");
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentPlanResult, setAgentPlanResult] = useState<GenerateRuleGoPlanResult | null>(null);
  const [agentPreviewItems, setAgentPreviewItems] = useState<AgentPreviewItem[]>([]);
  const [agentSelectedIds, setAgentSelectedIds] = useState<Set<string>>(new Set());
  const [agentConversationHistory, setAgentConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [agentQuestionAnswers, setAgentQuestionAnswers] = useState<Record<string, string>>({});
  const [agentCollapsedQuestions, setAgentCollapsedQuestions] = useState<Record<string, boolean>>({});
  const [agentShowOnlyUnanswered, setAgentShowOnlyUnanswered] = useState(true);
  const [agentPreviewFilter, setAgentPreviewFilter] = useState<"selected" | "all">("all");
  const [agentMergedDslPreviewOpen, setAgentMergedDslPreviewOpen] = useState(false);
  const [agentPreviewItemDetailOpen, setAgentPreviewItemDetailOpen] = useState<Record<string, boolean>>({});
  const [agentDslPreviewCopyFeedback, setAgentDslPreviewCopyFeedback] = useState<string | null>(null);
  const [agentModelConfigs, setAgentModelConfigs] = useState<ModelConfig[]>([]);
  const [agentModelConfigId, setAgentModelConfigId] = useState("");
  const [agentModelName, setAgentModelName] = useState("");
  const [agentReadyPulse, setAgentReadyPulse] = useState(false);
  const [agentReadyPulseShownInSession, setAgentReadyPulseShownInSession] = useState(false);
  const agentPrimaryActionRef = useRef<HTMLButtonElement | null>(null);
  const prevAgentAllAnsweredRef = useRef(false);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const lastTouchedBlockIdRef = useRef<string | null>(null);
  /** 供 workspace 内 handleChange 读取最新值，避免闭包陈旧导致生成的 DSL 与保存时不一致 */
  const nameRef = useRef(name);
  const debugModeRef = useRef(debugMode);
  const rootRef = useRef(root);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    nameRef.current = name;
    debugModeRef.current = debugMode;
    rootRef.current = root;
    enabledRef.current = enabled;
  }, [name, debugMode, root, enabled]);

  const editingRule = useMemo(() => rules.find((rule) => rule.id === id), [rules, id]);
  const agentSelectedConfig = useMemo(
    () => agentModelConfigs.find((cfg) => cfg.id === agentModelConfigId) ?? null,
    [agentModelConfigs, agentModelConfigId]
  );

  /** Agent 追问推荐答案用：随画布与 DSL 变化更新，避免在每条追问下重复 getAllBlocks */
  const agentWorkspaceContext = useMemo(() => {
    if (!agentModalOpen) {
      return { hasTrigger: false, hasLlm: false, hasFeishu: false, hasDelay: false };
    }
    const ws = workspaceRef.current;
    const allBlocks = (ws?.getAllBlocks?.(false) ?? []) as Block[];
    return {
      hasTrigger: allBlocks.some((b) => isRuleGoTriggerBlockType(b.type)),
      hasLlm: allBlocks.some((b) => b.type === "rulego_llm"),
      hasFeishu: allBlocks.some((b) => b.type === "rulego_feishuImMessage"),
      hasDelay: allBlocks.some((b) => b.type === "rulego_delay"),
    };
  }, [agentModalOpen, dsl]);

  const bumpWorkspaceZoom = useCallback((dir: 1 | -1) => {
    const ws = workspaceRef.current as (WorkspaceSvg & { zoomCenter?: (d: number) => void }) | null;
    ws?.zoomCenter?.(dir);
    requestAnimationFrame(() => {
      const s =
        (workspaceRef.current as WorkspaceSvg & { getScale?: () => number } | null)?.getScale?.() ?? 1;
      setZoomPercent(Math.round(s * 100));
    });
  }, []);

  /** 规则管理中 root 为 false 的子规则链，供 flow 块 targetId 下拉选择 */
  const subRuleChains = useMemo(
    () => rules.filter((r) => isSubRuleChain(r.definition ?? "")).map((r) => ({ id: r.id, name: r.name })),
    [rules]
  );

  /** Agent 规划：已启用子规则链列表（排除当前编辑规则），供后端提示模型优先 flow 复用 */
  const agentAvailableSubRuleChains = useMemo(
    () =>
      rules
        .filter((r) => isSubRuleChain(r.definition ?? "") && getEnabledFromDefinition(r.definition ?? ""))
        .filter((r) => r.id !== id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: String(r.description ?? "").trim(),
          node_summary: summarizeRuleNodesForAgent(r.definition ?? ""),
        })),
    [rules, id]
  );

  useEffect(() => {
    if (!agentModalOpen) return;
    void (async () => {
      try {
        const list = await listModelConfigs();
        setAgentModelConfigs(list);
        if (!agentModelConfigId && list.length > 0) {
          setAgentModelConfigId(list[0].id);
          setAgentModelName(list[0].models?.[0] ?? "");
        } else if (agentModelConfigId) {
          const current = list.find((c) => c.id === agentModelConfigId);
          if (current && current.models.length > 0 && !current.models.includes(agentModelName)) {
            setAgentModelName(current.models[0]);
          }
        }
      } catch (err) {
        setAgentError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [agentModalOpen, agentModelConfigId, agentModelName]);

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const blockType = e.dataTransfer.getData(DRAG_TYPE_BLOCK);
    if (!blockType || !workspaceRef.current || !containerRef.current) return;
    const workspace = workspaceRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    const ws = workspace as WorkspaceSvg & { getMetrics?: () => { viewLeft?: number; viewTop?: number }; getScale?: () => number };
    const scale = ws.getScale?.() ?? 1;
    const metrics = ws.getMetrics?.();
    const viewLeft = metrics?.viewLeft ?? 0;
    const viewTop = metrics?.viewTop ?? 0;
    const wsX = viewLeft + (e.clientX - rect.left) / scale;
    const wsY = viewTop + (e.clientY - rect.top) / scale;
    if (isRuleGoTriggerBlockType(blockType)) {
      const hasTrigger = (workspace.getAllBlocks(false) as Block[]).some((b) => isRuleGoTriggerBlockType(b.type));
      if (hasTrigger) {
        setError("只能有一个触发器，请先删除画布上已有触发器后再从积木库拖入。");
        return;
      }
    }
    const block = workspace.newBlock(blockType) as BlockSvg;
    block.initSvg();
    block.render();
    block.moveBy(wsX, wsY);
  };

  useEffect(() => {
    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      const msg = ev.reason?.message ?? String(ev.reason);
      if (msg && (msg.includes("Decoding") || msg.includes("EncodingError"))) {
        console.warn("[scratch-blocks] Media/decoding error:", ev.reason);
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  useEffect(() => {
    if (!containerRef.current || workspaceRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BlocklyF = ScratchBlocks as any;
    registerAllBlocks(ScratchBlocks, BlocklyF);

    const meta = import.meta as { env?: { BASE_URL?: string } };
    const baseUrl =
      meta.env?.BASE_URL != null ? String(meta.env.BASE_URL).replace(/\/$/, "") : "";
    const mediaPath = !baseUrl || baseUrl === "/" ? "/scratch-blocks/" : `${baseUrl}/scratch-blocks/`;

    const emptyToolbox = { kind: "flyoutToolbox" as const, contents: [] };
    const workspace = ScratchBlocks.inject(containerRef.current, {
      toolbox: emptyToolbox,
      media: mediaPath,
      renderer: "scratch",
      theme: scratchTheme,
      // 无分类 toolbox 时 Blockly 默认关闭 scrollbars，会导致无法拖动画布；开启后与滚轮缩放并存（move.wheel 默认为 false）
      move: {
        scrollbars: true,
      },
      zoom: {
        controls: false,
        wheel: true,
        startScale: 0.9,
        maxScale: 2,
        minScale: 0.4,
        scaleSpeed: 1.1,
      },
      trashcan: false,
      grid: {
        spacing: 24,
        length: 18,
        colour: "rgba(148, 163, 184, 0.28)",
        snap: true,
      },
    }) as WorkspaceSvg;

    workspaceRef.current = workspace;

    const handleChange = (ev?: { blockId?: string }) => {
      if (suppressWorkspaceDslSyncRef.current) return;
      ensureRuleGoNodeIdsAreUuid(workspace);
      if (ev?.blockId) lastTouchedBlockIdRef.current = ev.blockId;
      const state = ScratchBlocks.serialization.workspaces.save(workspace);
      setJson(JSON.stringify(state, null, 2));
      const nextDsl =
        buildRuleGoDslRef.current?.(
          workspace,
          nameRef.current ?? "",
          debugModeRef.current,
          rootRef.current,
          enabledRef.current
        ) ?? "";
      setDsl(nextDsl);
      setTriggerLayoutErrorRef.current(validateRuleGoTriggerLayout(workspace));
      const topBlocks = workspace.getTopBlocks(true);
      setBlockCount(topBlocks.length);
      const scale = (workspace as WorkspaceSvg & { getScale?: () => number }).getScale?.() ?? 1;
      setZoomPercent(Math.round(scale * 100));
      // 不在 handleChange 里用 getSelected() 覆盖 selectedBlockId，否则焦点移到属性面板时会被清空
    };

    const initialState = ScratchBlocks.serialization.workspaces.save(workspace);
    setJson(JSON.stringify(initialState, null, 2));
    const initialDsl = buildRuleGoDslRef.current?.(workspace) ?? "";
    setDsl(initialDsl);
    setSavedDsl(initialDsl);
    handleChange();

    const changeListener = (ev: unknown) => {
      handleChange(ev as { blockId?: string });
      const e = ev as { type?: string; blockId?: string };
      if (e?.type === "click") {
        if (e?.blockId) {
          const block = workspace.getBlockById(e.blockId);
          if (block?.type?.startsWith("rulego_")) {
            setSelectedBlockId(e.blockId);
          } else {
            setSelectedBlockId(null);
          }
        } else {
          setSelectedBlockId(null);
        }
      }
    };
    workspace.addChangeListener(changeListener);

    const container = containerRef.current;
    const onDblClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const blocks = workspace.getAllBlocks(false);
      for (const block of blocks) {
        if (!block.type.startsWith("rulego_")) continue;
        const svgRoot = (block as BlockSvg).getSvgRoot?.();
        if (svgRoot?.contains(target)) {
          setSelectedBlockId(block.id ?? null);
          e.preventDefault();
          return;
        }
      }
    };
    container.addEventListener("dblclick", onDblClick);

    return () => {
      container.removeEventListener("dblclick", onDblClick);
      workspace.removeChangeListener(changeListener);
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!workspaceRef.current) return;

    let syncName = "";
    let syncDebug = false;
    let syncRoot = true;
    let syncEnabled = true;
    if (editingRule) {
      setName(editingRule.name);
      setDescription(editingRule.description);
      syncName = editingRule.name;
      try {
        const parsed = JSON.parse(editingRule.definition);
        const chain = parsed?.ruleChain;
        syncDebug = Boolean(chain?.debugMode);
        syncRoot = chain?.root !== false;
        syncEnabled = getEnabledFromDefinition(editingRule.definition);
        setDebugMode(syncDebug);
        setRoot(syncRoot);
        setEnabled(syncEnabled);
      } catch {
        setDebugMode(false);
        setRoot(true);
        setEnabled(true);
        syncDebug = false;
        syncRoot = true;
        syncEnabled = true;
      }
    } else {
      setName("");
      setDescription("");
      setDebugMode(false);
      setRoot(true);
      syncName = "";
      syncDebug = false;
      syncRoot = true;
      syncEnabled = true;
    }

    // Blockly 的 change 会同步触发 handleChange；refs 若晚于 state 的 useEffect 更新，会用旧 name/root 生成 DSL，导致 dsl 与 savedDsl 不一致（表现为「已保存仍显示未保存」）。
    nameRef.current = syncName;
    debugModeRef.current = syncDebug;
    rootRef.current = syncRoot;
    enabledRef.current = syncEnabled;

    if (editingRule?.editorJson) {
      suppressWorkspaceDslSyncRef.current = true;
      try {
        const state = JSON.parse(editingRule.editorJson);
        ScratchBlocks.serialization.workspaces.load(state, workspaceRef.current, { recordUndo: false });
        ensureRuleGoNodeIdsAreUuid(workspaceRef.current);
        const parsed = (() => {
          try {
            return JSON.parse(editingRule.definition);
          } catch {
            return {};
          }
        })();
        const chain = parsed?.ruleChain;
        const dslEnabledForLoad = getEnabledFromDefinition(editingRule.definition);
        const loadedDsl = buildRuleGoDsl(
          workspaceRef.current,
          editingRule.name,
          Boolean(chain?.debugMode),
          chain?.root !== false,
          dslEnabledForLoad
        );
        const savedState = ScratchBlocks.serialization.workspaces.save(workspaceRef.current);
        setJson(JSON.stringify(savedState, null, 2));
        setDsl(loadedDsl);
        setSavedDsl(loadedDsl);
        setTriggerLayoutError(validateRuleGoTriggerLayout(workspaceRef.current));
        setBlockCount(workspaceRef.current.getTopBlocks(true).length);
        const scaleAfterLoad =
          (workspaceRef.current as WorkspaceSvg & { getScale?: () => number }).getScale?.() ?? 1;
        setZoomPercent(Math.round(scaleAfterLoad * 100));
        return;
      } catch {
        // ignore malformed json
      } finally {
        suppressWorkspaceDslSyncRef.current = false;
      }
    }

    if (editingRule?.definition) {
      suppressWorkspaceDslSyncRef.current = true;
      try {
        const ruleDsl = JSON.parse(editingRule.definition);
        loadWorkspaceFromRuleGoDsl(ruleDsl, workspaceRef.current);
        ensureRuleGoNodeIdsAreUuid(workspaceRef.current);
        const chain = ruleDsl?.ruleChain;
        const dslEnabledForLoad = getEnabledFromDefinition(editingRule.definition);
        const loadedDsl = buildRuleGoDsl(
          workspaceRef.current,
          editingRule.name,
          Boolean(chain?.debugMode),
          chain?.root !== false,
          dslEnabledForLoad
        );
        const savedState = ScratchBlocks.serialization.workspaces.save(workspaceRef.current);
        setJson(JSON.stringify(savedState, null, 2));
        setDsl(loadedDsl);
        setSavedDsl(loadedDsl);
        setTriggerLayoutError(validateRuleGoTriggerLayout(workspaceRef.current));
        setBlockCount(workspaceRef.current.getTopBlocks(true).length);
        const scaleAfterLoad =
          (workspaceRef.current as WorkspaceSvg & { getScale?: () => number }).getScale?.() ?? 1;
        setZoomPercent(Math.round(scaleAfterLoad * 100));
      } catch (err) {
        setError((err as Error).message || "DSL 解析失败");
      } finally {
        suppressWorkspaceDslSyncRef.current = false;
      }
    }
  }, [editingRule]);

  type SaveRuleOverrides = {
    description?: string;
    enabled?: boolean;
    debugMode?: boolean;
    root?: boolean;
  } | undefined;
  const saveRule = async (ruleName: string, overrides?: SaveRuleOverrides) => {
    const trimmedName = ruleName.trim();
    if (!trimmedName) {
      const msg = "规则名称不能为空";
      setError(msg);
      setSaveFeedback({ type: "error", message: msg });
      return;
    }
    const useDescription = overrides?.description ?? description;
    // 状态以 DSL 为准：有 overrides 时用弹框选择，否则用当前编辑器状态（加载时已从 DSL 解析）
    const useEnabled = overrides?.enabled ?? enabled;
    const useDebugMode = overrides?.debugMode ?? debugMode;
    const useRoot = overrides?.root ?? root;
    if (workspaceRef.current) {
      const te = validateRuleGoTriggerLayout(workspaceRef.current);
      if (te) {
        setError(te);
        setSaveFeedback({ type: "error", message: te });
        return;
      }
    }
    const nextDsl =
      workspaceRef.current
        ? buildRuleGoDsl(workspaceRef.current, trimmedName, useDebugMode, useRoot, useEnabled)
        : dsl;
    if (!nextDsl.trim()) {
      const msg = "DSL 不能为空";
      setError(msg);
      setSaveFeedback({ type: "error", message: msg });
      return;
    }
    // 有画布时以当前工作区序列化为准，避免仅从 DSL 恢复后 editor_json 为空导致 json 状态未更新而误报「Scratch JSON 不能为空」
    const editorJsonPayload = workspaceRef.current
      ? JSON.stringify(ScratchBlocks.serialization.workspaces.save(workspaceRef.current), null, 2)
      : (json ?? "").trim();
    if (!editorJsonPayload.trim()) {
      const msg = "Scratch JSON 不能为空";
      setError(msg);
      setSaveFeedback({ type: "error", message: msg });
      return;
    }
    if (workspaceRef.current) {
      setJson(editorJsonPayload);
      setDsl(nextDsl);
    }
    if (overrides?.root !== undefined) setRoot(overrides.root);
    setSaving(true);
    setError(null);
    try {
      if (editingRule) {
        await update(editingRule.id, {
          name: trimmedName,
          description: String(useDescription).trim(),
          definition: nextDsl.trim(),
          editorJson: editorJsonPayload.trim(),
          requestMetadataParamsJson: editingRule.requestMetadataParamsJson ?? "[]",
          requestMessageBodyParamsJson: editingRule.requestMessageBodyParamsJson ?? "[]",
          responseMessageBodyParamsJson: editingRule.responseMessageBodyParamsJson ?? "[]",
        });
      } else {
        const created = await create({
          name: trimmedName,
          description: String(useDescription).trim(),
          definition: nextDsl.trim(),
          editorJson: editorJsonPayload.trim(),
          requestMetadataParamsJson: "[]",
          requestMessageBodyParamsJson: "[]",
          responseMessageBodyParamsJson: "[]",
        });
        const newId = (created.id ?? "").trim();
        if (!newId) {
          throw new Error("未获得新规则 ID");
        }
        // 先落成功态再导航，避免立即卸载导致后续 setState 与路由切换竞态，被误判为保存失败
        setSaveFeedback({ type: "success" });
        const persistedDslCreate = nextDsl.trim();
        setDsl(persistedDslCreate);
        setSavedDsl(persistedDslCreate);
        nameRef.current = trimmedName;
        debugModeRef.current = useDebugMode;
        rootRef.current = useRoot;
        enabledRef.current = useEnabled;
        queueMicrotask(() => {
          navigate(`/rulego/editor/${newId}`, { replace: true });
        });
      }
      if (editingRule) {
        setSaveFeedback({ type: "success" });
        const persistedDsl = nextDsl.trim();
        setDsl(persistedDsl);
        setSavedDsl(persistedDsl);
        nameRef.current = trimmedName;
        debugModeRef.current = useDebugMode;
        rootRef.current = useRoot;
        enabledRef.current = useEnabled;
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : typeof err === "string"
            ? err
            : String(err ?? "保存失败");
      setError(msg);
      setSaveFeedback({ type: "error", message: msg });
    } finally {
      setSaving(false);
    }
  };

  /**
   * 未操作时仍可能「脏」的原因：
   * - metadata.nodes[].additionalInfo.position（积木坐标）
   * - metadata.endpoints[].additionalInfo.position（端点块同样用 getRelativeToSurfaceXY）
   * - JSON 键插入顺序不一致
   */
  const stripRuleGoNoiseForCompare = (parsed: unknown): unknown => {
    const walk = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(walk);
      if (!v || typeof v !== "object") return v;
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(o)) {
        let child = o[key];
        if (key === "additionalInfo" && child && typeof child === "object") {
          const ai = { ...(child as Record<string, unknown>) };
          delete ai.position;
          if (Object.keys(ai).length === 0) continue;
          child = ai;
        } else {
          child = walk(child);
        }
        out[key] = child;
      }
      return out;
    };
    return walk(parsed);
  };

  const stableSortedDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stableSortedDeep);
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).sort();
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        out[k] = stableSortedDeep(o[k]);
      }
      return out;
    }
    return v;
  };

  const normalizeDslForCompare = (s: string) => {
    const t = (s ?? "").trim();
    if (!t) return "";
    try {
      return JSON.stringify(stableSortedDeep(stripRuleGoNoiseForCompare(JSON.parse(t))));
    } catch {
      return t;
    }
  };
  const isDirty = useMemo(
    () => normalizeDslForCompare(dsl) !== normalizeDslForCompare(savedDsl),
    [dsl, savedDsl]
  );

  const handleSave = async () => {
    if (!name.trim() || !description.trim()) {
      setNameDraft(name);
      setDescriptionDraft(description);
      setEnabledDraftInModal(enabled);
      setDebugDraftInModal(debugMode);
      setNameModalError(null);
      setNameModalOpen(true);
      return;
    }
    await saveRule(name);
  };

  const handleNameConfirm = async () => {
    const trimmedName = nameDraft.trim();
    const trimmedDesc = descriptionDraft.trim();
    if (!trimmedName) {
      setNameModalError("规则名称不能为空");
      return;
    }
    if (!trimmedDesc) {
      setNameModalError("规则描述不能为空");
      return;
    }
    setNameModalError(null);
    setNameModalOpen(false);
    setName(trimmedName);
    setDescription(trimmedDesc);
    setEnabled(enabledDraftInModal);
    setDebugMode(debugDraftInModal);
    await saveRule(trimmedName, {
      description: trimmedDesc,
      enabled: enabledDraftInModal,
      debugMode: debugDraftInModal,
    });
  };

  const handleTestClick = () => {
    if (workspaceRef.current) {
      const te = validateRuleGoTriggerLayout(workspaceRef.current);
      if (te) {
        setError(te);
        return;
      }
    }
    const currentDsl =
      workspaceRef.current ? buildRuleGoDsl(workspaceRef.current, name, debugMode, root) : dsl;
    if (!currentDsl.trim()) {
      setError("画布为空，无法测试");
      return;
    }
    setError(null);
    setTestResult(null);
    setTestConversationHistory([]);
    setTestFollowUpInput("");
    setTestModalOpen(true);
  };

  const handleTestRun = async () => {
    if (workspaceRef.current) {
      const te = validateRuleGoTriggerLayout(workspaceRef.current);
      if (te) {
        setTestResult({ success: false, data: "", error: te, elapsed: 0 });
        return;
      }
    }
    const currentDsl =
      workspaceRef.current ? buildRuleGoDsl(workspaceRef.current, name, debugMode, root) : dsl;
    if (!currentDsl.trim()) {
      setTestResult({ success: false, data: "", error: "画布为空", elapsed: 0 });
      return;
    }
    let metadata: Record<string, string> = {};
    try {
      if (testMetadataJson.trim()) metadata = JSON.parse(testMetadataJson) as Record<string, string>;
    } catch {
      setTestResult({ success: false, data: "", error: "metadata 不是合法 JSON", elapsed: 0 });
      return;
    }
    setTestRunning(true);
    setTestResult(null);
    const dataPayload =
      testConversationHistory.length > 0 && testFollowUpInput.trim()
        ? JSON.stringify({
            data: testFollowUpInput.trim(),
            conversation_history: testConversationHistory,
          })
        : testDataJson.trim() || "{}";
    try {
      const result = await executeRuleGoRuleByDefinition(currentDsl, {
        message_type: testMessageType || "default",
        metadata,
        data: dataPayload,
      });
      setTestResult(result);
      if (result.success && result.data != null) {
        if (testConversationHistory.length > 0) {
          setTestConversationHistory((prev) => [
            ...prev,
            { role: "user", content: testFollowUpInput.trim() },
            { role: "assistant", content: result.data ?? "" },
          ]);
          setTestFollowUpInput("");
        } else {
          let userContent = testDataJson.trim();
          try {
            const parsed = JSON.parse(userContent || "{}");
            if (parsed && typeof parsed.data === "string") userContent = parsed.data;
          } catch {
            // ignore
          }
          setTestConversationHistory([
            { role: "user", content: userContent || "" },
            { role: "assistant", content: result.data ?? "" },
          ]);
        }
      }
    } catch (err) {
      setTestResult({
        success: false,
        data: "",
        error: (err as Error).message || "执行异常",
        elapsed: 0,
      });
    } finally {
      setTestRunning(false);
    }
  };

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const fallbackUuid = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  const ensureRuleGoNodeIdsAreUuid = (workspace: WorkspaceSvg) => {
    const allBlocks = workspace.getAllBlocks(false);
    allBlocks.forEach((block: Block) => {
      if (block.type.startsWith("rulego_") && block.getField("NODE_ID")) {
        const currentId = String(block.getFieldValue("NODE_ID") ?? "").trim();
        if (currentId && !UUID_REGEX.test(currentId)) {
          const uuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
          block.setFieldValue(uuid, "NODE_ID");
        }
      }
    });
  };

  const getFieldValue = (block: Block, name: string) => String(block.getFieldValue(name) ?? "").trim();

  const getBooleanField = (block: Block, name: string) => getFieldValue(block, name) === "TRUE";

  const parseJsonValue = (value: string, fallback: unknown) => {
    if (!value.trim()) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const blockHelpers: { getFieldValue: (b: Block, n: string) => string; getBooleanField: (b: Block, n: string) => boolean; parseJsonValue: (v: string, f: unknown) => unknown } = {
    getFieldValue,
    getBooleanField,
    parseJsonValue,
  };


  const getDefaultConnectionType = (blockType: string) => getBlockDef(blockType)?.defaultConnectionType ?? "Success";

  const buildRuleGoNode = (block: Block) => {
    const def = getBlockDef(block.type);
    if (!def || def.metadataEndpoint) return null;
    const nodeId = getFieldValue(block, "NODE_ID") || block.id;
    const nodeName = getFieldValue(block, "NODE_NAME") || def.nodeType;
    const debugMode = block.getField("DEBUG") ? getBooleanField(block, "DEBUG") : false;
    const configuration = def.getConfiguration(block, blockHelpers);
    return {
      id: nodeId,
      type: def.nodeType,
      name: nodeName,
      debugMode,
      configuration,
    };
  };

  const createBlockForNode = (
    workspace: WorkspaceSvg,
    node: {
      id: string;
      type: string;
      name: string;
      debugMode: boolean;
      configuration?: Record<string, unknown>;
      additionalInfo?: Record<string, unknown>;
    }
  ): BlockSvg => {
    const blockType = getBlockTypeFromNodeType(node.type);
    if (!blockType) {
      throw new Error(`不支持的组件类型: ${node.type}`);
    }

    const block = workspace.newBlock(blockType) as BlockSvg;
    block.setFieldValue(node.id, "NODE_ID");
    block.setFieldValue(node.name || node.type, "NODE_NAME");

    const def = getBlockDef(blockType);
    if (def?.setConfiguration) {
      def.setConfiguration(block, node, blockHelpers);
    }

    const position = (node.additionalInfo as { position?: { x: number; y: number } } | undefined)?.position;
    if (position) {
      block.moveBy(position.x, position.y);
    }

    block.initSvg();
    block.render();
    return block;
  };

  const loadWorkspaceFromRuleGoDsl = (ruleDsl: any, workspace: WorkspaceSvg) => {
    if (!ruleDsl?.metadata) return;

    const nodes = Array.isArray(ruleDsl.metadata.nodes) ? (ruleDsl.metadata.nodes as Array<any>) : [];
    const connections = (ruleDsl.metadata.connections ?? []) as Array<any>;
    const endpoints = Array.isArray(ruleDsl.metadata.endpoints) ? (ruleDsl.metadata.endpoints as Array<Record<string, unknown>>) : [];

    workspace.clear();

    endpoints.forEach((ep) => {
      const bt = getBlockTypeForEndpointDslType(String(ep.type ?? ""));
      if (!bt) return;
      const def = getBlockDef(bt);
      if (!def?.setEndpointDsl) return;
      const epBlock = workspace.newBlock(bt) as BlockSvg;
      def.setEndpointDsl(epBlock, ep, blockHelpers);
      const pos = (ep.additionalInfo as { position?: { x: number; y: number } } | undefined)?.position;
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        epBlock.moveBy(pos.x, pos.y);
      }
      epBlock.initSvg();
      epBlock.render();
    });

    const nodeMap = new Map<string, BlockSvg>();

    nodes.forEach((node) => {
      const block = createBlockForNode(workspace, node);
      nodeMap.set(String(node.id), block);
    });

    const forkSuccessMap = new Map<string, string[]>();
    connections.forEach((c) => {
      if (String(c.type ?? "Success") !== "Success") return;
      const fromId = String(c.fromId);
      const toId = String(c.toId);
      const node = nodes.find((n) => String(n.id) === fromId);
      if (node?.type === "fork") {
        const arr = forkSuccessMap.get(fromId) ?? [];
        arr.push(toId);
        forkSuccessMap.set(fromId, arr);
      }
    });
    forkSuccessMap.forEach((toIds, forkId) => {
      const block = nodeMap.get(forkId) as (Block & { forkCount_?: number; updateShape_?: () => void }) | undefined;
      if (block?.type !== "rulego_fork") return;
      const n = Math.max(1, Math.min(8, toIds.length));
      block.forkCount_ = n;
      block.updateShape_?.();
    });
    const forkSuccessOrder = new Map<string, string[]>();
    forkSuccessMap.forEach((toIds, forkId) => {
      forkSuccessOrder.set(forkId, [...toIds].sort());
    });

    connections.forEach((connection) => {
      const fromBlock = nodeMap.get(String(connection.fromId));
      const toBlock = nodeMap.get(String(connection.toId));
      const toPrev = toBlock ? (toBlock as BlockSvg).previousConnection : null;
      if (!fromBlock || !toBlock || !toPrev) return;
      const type = String(connection.type ?? "Success");
      const fromId = String(connection.fromId);
      const toId = String(connection.toId);

      if (toBlock.type === "rulego_join" && toPrev?.isConnected?.()) {
        const extra = (toBlock.getFieldValue?.("JOIN_EXTRA_INCOMINGS") as string) || "";
        const list = extra ? extra.split(",").map((s) => s.trim()).filter(Boolean) : [];
        if (!list.includes(fromId)) list.push(fromId);
        toBlock.setFieldValue(list.join(", "), "JOIN_EXTRA_INCOMINGS");
        return;
      }

      if (fromBlock.type === "rulego_fork" && type === "Success") {
        const order = forkSuccessOrder.get(fromId);
        const idx = order ? order.indexOf(toId) : -1;
        if (idx >= 0) {
          (fromBlock as Block & { _forkConnIndex?: number })._forkConnIndex = idx;
        }
      }

      const def = getBlockDef(fromBlock.type);
      const inputName = def?.getInputNameForConnectionType?.(type, fromBlock);
      if (inputName) {
        const input = fromBlock.getInput(inputName);
        if (input?.connection) {
          input.connection.connect(toPrev as ScratchBlocks.Connection);
        }
      } else if (fromBlock.nextConnection) {
        // 多分支块（如 restApiCall）Success 走 nextStatement，但 CONFIG 里没有 LINK_TYPE（与 buildMinimalNodeInit 块不同）
        if (fromBlock.getField("LINK_TYPE")) {
          fromBlock.setFieldValue(type, "LINK_TYPE");
          if (connection.label && fromBlock.getField("LINK_LABEL")) {
            fromBlock.setFieldValue(String(connection.label), "LINK_LABEL");
          }
        }
        fromBlock.nextConnection.connect(toPrev as ScratchBlocks.Connection);
      }

      if (fromBlock.type === "rulego_fork") {
        (fromBlock as Block & { _forkConnIndex?: number })._forkConnIndex = undefined;
      }
    });

    nodes.forEach((node: { type?: string; id?: string; configuration?: { do?: string } }) => {
      if (node.type !== "for" || !node.configuration?.do) return;
      const fromBlock = nodeMap.get(String(node.id));
      const toBlock = nodeMap.get(String(node.configuration.do));
      if (!fromBlock || (fromBlock as Block).type !== "rulego_for" || !toBlock || !toBlock.previousConnection) return;
      const hasDoConn = connections.some(
        (c) => String(c.fromId) === String(node.id) && String(c.toId) === String(node.configuration?.do) && c.type === "Do"
      );
      if (hasDoConn) return;
      const input = fromBlock.getInput("branch_do");
      if (input?.connection) {
        input.connection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
      }
    });

    nodes.forEach((node: { type?: string; id?: string; configuration?: { nodeIds?: string[] } }) => {
      if (node.type !== "groupAction" || !Array.isArray(node.configuration?.nodeIds)) return;
      const fromBlock = nodeMap.get(String(node.id));
      if (!fromBlock || (fromBlock as Block).type !== "rulego_groupAction") return;
      const nodeIds = node.configuration.nodeIds;
      nodeIds.forEach((toId, i) => {
        if (i >= 8) return;
        const toBlock = nodeMap.get(String(toId));
        if (!toBlock?.previousConnection) return;
        const input = fromBlock.getInput(`branch_${i}`);
        if (input?.connection) {
          input.connection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
        }
      });
    });

    nodeMap.forEach((blk) => {
      if (blk.type === "rulego_join") {
        const mainPrev = blk.previousConnection?.targetBlock?.();
        const extra = (blk.getFieldValue?.("JOIN_EXTRA_INCOMINGS") as string) || "";
        const extraList = extra ? extra.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const total = (mainPrev ? 1 : 0) + extraList.length;
        blk.setFieldValue(total >= 2 ? ` (${total}路)` : "", "JOIN_ROUTES_LABEL");
      }
    });

    workspace.refreshTheme();
  };

  const buildRuleGoDsl = (
    workspace: WorkspaceSvg,
    ruleName?: string,
    debugModeParam?: boolean,
    rootParam?: boolean,
    enabledParam?: boolean
  ) => {
    const topBlocks = workspace.getTopBlocks(true);
    if (topBlocks.length === 0) return "";

    const nodes: Array<{
      id: string;
      type: string;
      name: string;
      debugMode: boolean;
      configuration: Record<string, unknown>;
      additionalInfo?: Record<string, unknown>;
    }> = [];
    const connections: Array<{ fromId: string; toId: string; type: string; label?: string }> = [];
    const seen = new Set<string>();

    const addNode = (block: Block) => {
      if (seen.has(block.id)) return;
      const node = buildRuleGoNode(block);
      if (!node) return;
      const position = block.getRelativeToSurfaceXY();
      const nodeWithInfo = {
        ...node,
        additionalInfo: {
          blockId: block.id,
          position: {
            x: position.x,
            y: position.y,
          },
        },
      };
      nodes.push(nodeWithInfo);
      seen.add(block.id);
    };

    /** 触发器类 endpoint 块只进 metadata.endpoints，连线在 DSL 中需跳过它们，接到后续第一个真实节点 */
    const skipMetadataEndpointBlocks = (b: Block | null): Block | null => {
      let x = b;
      while (x && getBlockDef(x.type)?.metadataEndpoint) {
        x = x.getNextBlock();
      }
      return x;
    };

    const addConnectionsFromBlock = (fromBlock: Block) => {
      if (getBlockDef(fromBlock.type)?.metadataEndpoint) return;
      const fromId = getFieldValue(fromBlock, "NODE_ID") || fromBlock.id;
      const addConn = (toBlock: Block | null, type: string, label?: string) => {
        const resolved = skipMetadataEndpointBlocks(toBlock);
        if (!resolved) return;
        const toId = getFieldValue(resolved, "NODE_ID") || resolved.id;
        connections.push(label ? { fromId, toId, type, label } : { fromId, toId, type });
      };
      const def = getBlockDef(fromBlock.type);
      const branches = def?.getConnectionBranches(fromBlock, blockHelpers);
      if (branches) {
        branches.forEach(({ inputName, connectionType }) => {
          const target =
            inputName === "__next__" ? fromBlock.getNextBlock() : fromBlock.getInputTargetBlock(inputName) ?? null;
          addConn(target, connectionType);
        });
      } else {
        const next = fromBlock.getNextBlock();
        if (next) {
          const linkType = getFieldValue(fromBlock, "LINK_TYPE") || getDefaultConnectionType(fromBlock.type);
          const label = getFieldValue(fromBlock, "LINK_LABEL");
          addConn(next, linkType, label || undefined);
        }
      }
    };

    const walkChain = (block: Block | null) => {
      let current = block;
      while (current) {
        addNode(current);
        addConnectionsFromBlock(current);
        const def = getBlockDef(current.type);
        const walkInputs = def?.getWalkInputs(current);
        if (walkInputs && walkInputs.length > 0) {
          const cur = current;
          walkInputs.forEach((inputName: string) => {
            if (inputName === "__next__") {
              const nextBlock = cur.getNextBlock();
              if (nextBlock) walkChain(nextBlock);
              return;
            }
            let branchBlock = cur.getInputTargetBlock(inputName);
            while (branchBlock) {
              walkChain(branchBlock);
              branchBlock = branchBlock.getNextBlock();
            }
          });
          current = null;
        } else {
          current = current.getNextBlock();
        }
      }
    };

    topBlocks.forEach((block) => walkChain(block));

    const collectBlocks = (block: Block | null, set: Set<Block>) => {
      if (!block || set.has(block)) return;
      set.add(block);
      collectBlocks(block.getNextBlock(), set);
      const def = getBlockDef(block.type);
      const walkInputs = def?.getWalkInputs(block);
      if (walkInputs) {
        walkInputs.forEach((inputName: string) => {
          if (inputName === "__next__") return;
          let b = block.getInputTargetBlock(inputName);
          while (b) {
            collectBlocks(b, set);
            b = b.getNextBlock();
          }
        });
      }
    };
    const allBlocksSet = new Set<Block>();
    topBlocks.forEach((b) => collectBlocks(b, allBlocksSet));
    allBlocksSet.forEach((block) => {
      if (block.type === "rulego_join") {
        const extra = getFieldValue(block, "JOIN_EXTRA_INCOMINGS") || "";
        const ids = extra.split(",").map((s) => s.trim()).filter(Boolean);
        const joinId = getFieldValue(block, "NODE_ID") || block.id;
        ids.forEach((fromId) => connections.push({ fromId, toId: joinId, type: "Success" }));
      }
    });

    const ruleChainId = editingRule?.id ?? id ?? "rule01";
    const ruleChainName = ruleName?.trim() || name.trim() || "Rule Chain";
    const ruleChainDebugMode = typeof debugModeParam === "boolean" ? debugModeParam : debugMode;
    const ruleChainRoot = typeof rootParam === "boolean" ? rootParam : root;
    const ruleChainEnabled = enabledParam !== undefined ? enabledParam : enabled;

    const endpoints: Record<string, unknown>[] = [];
    workspace.getAllBlocks(false).forEach((b: Block) => {
      const d = getBlockDef(b.type);
      if (d?.metadataEndpoint && d.getEndpointDsl) {
        endpoints.push(d.getEndpointDsl(b, blockHelpers));
      }
    });
    endpoints.sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));

    const metadata: Record<string, unknown> = {
      firstNodeIndex: 0,
      nodes,
      connections,
      ruleChainConnections: [],
    };
    if (endpoints.length > 0) metadata.endpoints = endpoints;

    return JSON.stringify(
      {
        ruleChain: {
          id: ruleChainId,
          name: ruleChainName,
          debugMode: ruleChainDebugMode,
          root: ruleChainRoot,
          disabled: !ruleChainEnabled,
          configuration: {},
          additionalInfo: {},
        },
        metadata,
      },
      null,
      2
    );
  };
  buildRuleGoDslRef.current = buildRuleGoDsl;

  const handleApplyImportDsl = () => {
    setImportDslError(null);
    const ws = workspaceRef.current;
    if (!ws) {
      setImportDslError("工作区未就绪");
      return;
    }
    const raw = importDslText.trim();
    if (!raw) {
      setImportDslError("请粘贴或选择包含规则链 DSL 的 JSON");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setImportDslError("JSON 解析失败，请检查格式");
      return;
    }
    if (!parsed || typeof parsed !== "object" || !(parsed as { metadata?: unknown }).metadata) {
      setImportDslError("DSL 无效：缺少 metadata");
      return;
    }
    const ruleDsl = parsed as {
      ruleChain?: { name?: string; debugMode?: boolean; root?: boolean };
      metadata: unknown;
    };
    const chain = ruleDsl.ruleChain;
    const importedName =
      typeof chain?.name === "string" && chain.name.trim() ? chain.name.trim() : "";
    const nextName = importedName || name;
    const nextDebug = Boolean(chain?.debugMode);
    const nextRoot = chain?.root !== false;
    const dslStr = JSON.stringify(parsed);
    const nextEnabled = getEnabledFromDefinition(dslStr);
    nameRef.current = nextName;
    debugModeRef.current = nextDebug;
    rootRef.current = nextRoot;
    enabledRef.current = nextEnabled;
    suppressWorkspaceDslSyncRef.current = true;
    try {
      loadWorkspaceFromRuleGoDsl(ruleDsl, ws);
      ensureRuleGoNodeIdsAreUuid(ws);
      if (importedName) setName(importedName);
      setDebugMode(nextDebug);
      setRoot(nextRoot);
      setEnabled(nextEnabled);
      const loadedDsl = buildRuleGoDsl(ws, nextName, nextDebug, nextRoot, nextEnabled);
      setDsl(loadedDsl);
      setSavedDsl(loadedDsl);
      setJson(JSON.stringify(ScratchBlocks.serialization.workspaces.save(ws), null, 2));
      setSelectedBlockId(null);
      setError(null);
      setTriggerLayoutError(validateRuleGoTriggerLayout(ws));
      setBlockCount(ws.getTopBlocks(true).length);
      setImportDslOpen(false);
      setImportDslText("");
    } catch (err) {
      setImportDslError((err as Error).message || "加载 DSL 到画布失败");
    } finally {
      suppressWorkspaceDslSyncRef.current = false;
    }
  };

  const getSupportedAgentNodeTypes = useCallback((): string[] => {
    const contents = rulegoToolbox.contents;
    if (!Array.isArray(contents)) return [];
    const out = new Set<string>();
    contents.forEach((cat) => {
      if (!("contents" in cat) || !Array.isArray(cat.contents)) return;
      cat.contents.forEach((item) => {
        if (!("type" in item)) return;
        const def = getBlockDef(String(item.type));
        if (def?.nodeType) out.add(def.nodeType);
      });
    });
    return Array.from(out);
  }, []);

  const handleGenerateAgentPlan = async (opts?: { promptText?: string }) => {
    const prompt = (opts?.promptText ?? agentPrompt).trim();
    if (!prompt) {
      setAgentError("请先输入需求描述");
      return;
    }
    const ws = workspaceRef.current;
    if (!ws) {
      setAgentError("工作区尚未初始化");
      return;
    }
    if (!agentSelectedConfig || !agentModelName.trim()) {
      setAgentError("请选择可用模型配置与模型后再生成预览");
      return;
    }
    setAgentLoading(true);
    setAgentError(null);
    try {
      const currentDsl = buildRuleGoDsl(ws, name, debugMode, root, enabled);
      const supportedNodeTypes = getSupportedAgentNodeTypes();
      const plan = await generateRuleGoPlan({
        prompt,
        current_dsl: currentDsl || "",
        node_types: supportedNodeTypes,
        available_sub_rule_chains: agentAvailableSubRuleChains,
        conversation_history: agentConversationHistory,
        base_url: agentSelectedConfig.baseUrl,
        api_key: agentSelectedConfig.apiKey,
        model: agentModelName.trim(),
        fallback_models: agentSelectedConfig.models.filter((m) => m !== agentModelName.trim()),
      });
      setAgentPlanResult(plan);
      setAgentQuestionAnswers((prev) => {
        const qs = plan.questions ?? [];
        const next: Record<string, string> = {};
        for (const q of qs) {
          if (Object.prototype.hasOwnProperty.call(prev, q)) next[q] = prev[q]!;
        }
        return next;
      });
      setAgentConversationHistory((prev) => [
        ...prev,
        { role: "user", content: prompt },
        { role: "assistant", content: plan.thought?.trim() || "已分析需求并返回规划结果。" },
      ]);
      const preview = buildAgentPreviewItems(plan, new Set(supportedNodeTypes));
      setAgentPreviewItems(preview);
      const defaults = preview.filter((item) => item.valid && item.confidence >= 0.6).map((item) => item.id);
      setAgentSelectedIds(new Set(defaults));
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentLoading(false);
    }
  };

  const handleSubmitAgentAnswers = async () => {
    if (!agentPlanResult?.questions?.length) return;
    const qaPairs = agentPlanResult.questions
      .map((q) => {
        const a = String(agentQuestionAnswers[q] ?? "").trim();
        if (!a) return "";
        return `问题: ${q}\n回答: ${a}`;
      })
      .filter(Boolean);
    if (qaPairs.length === 0) {
      setAgentError("请至少回答一个 Agent 追问");
      return;
    }
    const mergedPrompt = [agentPrompt.trim(), ...qaPairs].filter(Boolean).join("\n\n");
    setAgentPrompt(mergedPrompt);
    await handleGenerateAgentPlan({ promptText: mergedPrompt });
  };

  const getAgentQuickAnswerTemplates = (question: string): string[] => {
    const q = question.toLowerCase();
    if (q.includes("触发") || q.includes("trigger")) {
      return ["使用 HTTP 触发", "使用定时触发（每 5 分钟）", "沿用当前画布已有触发器"];
    }
    if (q.includes("错误") || q.includes("失败") || q.includes("fallback")) {
      return ["失败后记录日志并结束", "失败后走延迟重试 3 次", "失败后发送飞书告警"];
    }
    if (q.includes("输出") || q.includes("通知") || q.includes("result")) {
      return ["结果输出到飞书消息", "结果返回 HTTP 响应", "结果写入数据库"];
    }
    return ["按默认最佳实践处理", "保持最小可用流程", "请你给出推荐并说明理由"];
  };

  const getAgentRecommendedAnswer = (
    question: string,
    context: { hasTrigger: boolean; hasLlm: boolean; hasFeishu: boolean; hasDelay: boolean }
  ): string => {
    const q = question.toLowerCase();
    if (q.includes("触发") || q.includes("trigger")) {
      if (context.hasTrigger) return "建议沿用当前画布已有触发器，减少重复节点并保持入口一致。";
      return "建议使用 HTTP 触发，便于手动调试与后续系统集成。";
    }
    if (q.includes("错误") || q.includes("失败") || q.includes("fallback")) {
      if (context.hasDelay) return "建议沿用现有延迟节点做最多 3 次重试，最终失败再发送告警。";
      return "建议失败后先记录日志，再进行最多 3 次延迟重试，仍失败则发送飞书告警。";
    }
    if (q.includes("输出") || q.includes("通知") || q.includes("result")) {
      if (context.hasFeishu) return "建议沿用当前飞书消息节点输出结果摘要，同时保留 HTTP 返回主结果。";
      return "建议主结果返回 HTTP 响应，同时将关键摘要发送到飞书消息。";
    }
    if ((q.includes("模型") || q.includes("llm")) && context.hasLlm) {
      return "建议复用当前画布已有 LLM 节点配置（模型、温度、技能），仅补充输入输出映射。";
    }
    return "建议先按最小可用方案实现，保留后续扩展点，并在关键分支增加可观测日志。";
  };

  const getAgentRecommendedCandidates = (
    question: string,
    context: { hasTrigger: boolean; hasLlm: boolean; hasFeishu: boolean; hasDelay: boolean }
  ): string[] => {
    const q = question.toLowerCase();
    if (q.includes("触发") || q.includes("trigger")) {
      const base = [
        context.hasTrigger ? "沿用当前画布已有触发器" : "使用 HTTP 触发器",
        "使用定时触发器（每 5 分钟）",
        "使用 WebSocket 触发器",
      ];
      return base;
    }
    if (q.includes("错误") || q.includes("失败") || q.includes("fallback")) {
      const base = [
        context.hasDelay ? "沿用延迟节点，失败重试 3 次后告警" : "失败后延迟重试 3 次，再告警",
        "失败后仅记录日志并终止",
        "失败后直接发送飞书告警",
      ];
      return base;
    }
    if (q.includes("输出") || q.includes("通知") || q.includes("result")) {
      const base = [
        context.hasFeishu ? "沿用飞书节点发送摘要 + HTTP 返回主结果" : "HTTP 返回主结果 + 飞书发送摘要",
        "仅返回 HTTP 响应",
        "写入数据库并发送飞书通知",
      ];
      return base;
    }
    if (q.includes("模型") || q.includes("llm")) {
      const base = [
        context.hasLlm ? "复用现有 LLM 节点配置" : "新建 LLM 节点并使用默认模型配置",
        "增加兜底模型链（主模型失败自动切换）",
        "先用低成本模型，关键路径再切高性能模型",
      ];
      return base;
    }
    return [
      "按最小可用方案实现",
      "按可观测性优先实现（增强日志与错误分支）",
      "按可扩展性优先实现（预留更多分支）",
    ];
  };

  const handleAutoFillAgentAnswers = () => {
    if (!agentPlanResult?.questions?.length) return;
    const next: Record<string, string> = {};
    agentPlanResult.questions.forEach((q) => {
      next[q] = getAgentRecommendedAnswer(q, agentWorkspaceContext);
    });
    setAgentQuestionAnswers((prev) => ({ ...next, ...prev }));
  };

  const applyAgentPreviewSelectionToWorkspace = (opts: { closeModal: boolean }) => {
    const ws = workspaceRef.current;
    if (!ws) {
      setAgentError("工作区尚未初始化");
      return;
    }
    try {
      const currentDsl = buildRuleGoDsl(ws, name, debugMode, root, enabled);
      const nextDsl = applyAgentSelectionsToDsl(currentDsl || "", agentPreviewItems, agentSelectedIds);
      loadWorkspaceFromRuleGoDsl(nextDsl, ws);
      ensureRuleGoNodeIdsAreUuid(ws);
      const loadedDsl = buildRuleGoDsl(ws, name, debugMode, root, enabled);
      setDsl(loadedDsl);
      setJson(JSON.stringify(ScratchBlocks.serialization.workspaces.save(ws), null, 2));
      setTriggerLayoutError(validateRuleGoTriggerLayout(ws));
      setBlockCount(ws.getTopBlocks(true).length);
      if (opts.closeModal) {
        setAgentModalOpen(false);
      } else {
        const appliedIds = agentPreviewItems
          .filter((i) => i.valid && agentSelectedIds.has(i.id))
          .map((i) => i.id);
        if (appliedIds.length) {
          setAgentSelectedIds((prev) => {
            const next = new Set(prev);
            appliedIds.forEach((id) => next.delete(id));
            return next;
          });
        }
      }
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddAgentSelectionsToCanvas = () => applyAgentPreviewSelectionToWorkspace({ closeModal: false });
  const handleApplyAgentSelections = () => applyAgentPreviewSelectionToWorkspace({ closeModal: true });

  const workspaceWs = workspaceRef.current as (WorkspaceSvg & { undo?: () => void; redo?: () => void }) | null;
  const agentQuestionTotal = agentPlanResult?.questions?.length ?? 0;
  const agentQuestionAnswered = (agentPlanResult?.questions ?? []).filter(
    (q) => String(agentQuestionAnswers[q] ?? "").trim().length > 0
  ).length;
  const agentAllQuestionsAnswered = agentQuestionTotal > 0 && agentQuestionAnswered === agentQuestionTotal;
  const agentApplyBlockedByClarification =
    agentPlanResult?.need_clarification === true &&
    agentQuestionTotal > 0 &&
    !agentAllQuestionsAnswered;
  const agentHasApplicableSelection = agentPreviewItems.some((i) => i.valid && agentSelectedIds.has(i.id));
  const agentApplyDisabled = agentApplyBlockedByClarification || !agentHasApplicableSelection;
  const agentApplyDisabledTitle = agentApplyBlockedByClarification
    ? "请先回答 Agent 追问后再应用"
    : !agentHasApplicableSelection
      ? "请至少勾选一项有效预览"
      : undefined;

  const agentClarificationRound =
    Boolean(agentPlanResult?.need_clarification) && (agentPlanResult?.questions?.length ?? 0) > 0;
  const agentPrimaryDisabled =
    agentLoading ||
    !agentSelectedConfig ||
    !agentModelName.trim() ||
    (agentClarificationRound ? agentQuestionAnswered === 0 : !agentPrompt.trim());

  /** 按当前勾选将 Agent 建议合并进当前画布 DSL 后的完整 JSON，供应用前核对 */
  const agentMergedDslPreviewText = useMemo(() => {
    if (!agentModalOpen || !agentPlanResult) return "";
    const ws = workspaceRef.current;
    if (!ws) return "";
    try {
      const current = buildRuleGoDsl(ws, name, debugMode, root, enabled);
      const merged = applyAgentSelectionsToDsl(current || "", agentPreviewItems, agentSelectedIds);
      return JSON.stringify(merged, null, 2);
    } catch (err) {
      return `/* 预览生成失败 */\n${err instanceof Error ? err.message : String(err)}`;
    }
  }, [
    agentModalOpen,
    agentPlanResult,
    agentPreviewItems,
    agentSelectedIds,
    name,
    debugMode,
    root,
    enabled,
    dsl,
  ]);

  useEffect(() => {
    if (!agentPlanResult?.need_clarification) {
      prevAgentAllAnsweredRef.current = false;
      return;
    }
    if (agentAllQuestionsAnswered && !prevAgentAllAnsweredRef.current && !agentReadyPulseShownInSession) {
      prevAgentAllAnsweredRef.current = true;
      setAgentReadyPulseShownInSession(true);
      setAgentReadyPulse(true);
      agentPrimaryActionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      const t = window.setTimeout(() => setAgentReadyPulse(false), 900);
      return () => window.clearTimeout(t);
    }
    if (!agentAllQuestionsAnswered) {
      prevAgentAllAnsweredRef.current = false;
      setAgentReadyPulse(false);
    }
  }, [agentAllQuestionsAnswered, agentPlanResult?.need_clarification, agentReadyPulseShownInSession]);
  const blockLibraryCount = useMemo(() => {
    const contents = rulegoToolbox.contents;
    if (!Array.isArray(contents)) return 0;
    let n = 0;
    for (const cat of contents) {
      if ("contents" in cat && Array.isArray(cat.contents)) n += cat.contents.length;
    }
    return n;
  }, []);

  return (
    <div className="rulego-editor rulego-editor-visual">
      <header className="rulego-editor-header-bar">
        <div className="rulego-editor-title-cluster">
          <div className="rulego-editor-title-row">
            <h1 className="rulego-editor-title">规则编辑器</h1>
            {isDirty ? (
              <span className="rulego-editor-unsaved-badge" title="有未保存的更改">
                未保存
              </span>
            ) : null}
          </div>
          <p
            className={`rulego-editor-rule-name${name.trim() ? "" : " rulego-editor-rule-name--placeholder"}`}
            title={name.trim() || undefined}
          >
            {name.trim() || "未命名规则"}
          </p>
        </div>
        <div className="rulego-editor-toolbar">
          <button
            className={`rulego-toolbar-btn ${isDirty ? "primary" : "save-unchanged"}`}
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty || Boolean(triggerLayoutError)}
            title={
              triggerLayoutError
                ? triggerLayoutError
                : isDirty
                  ? "保存规则"
                  : "无变更，无需保存"
            }
          >
            保存
          </button>
          <button
            className="rulego-toolbar-btn"
            type="button"
            title={triggerLayoutError ? triggerLayoutError : "测试"}
            onClick={handleTestClick}
            disabled={Boolean(triggerLayoutError)}
          >
            测试
          </button>
        </div>
        <div className="rulego-editor-view-controls">
          <button
            className="rulego-toolbar-btn icon"
            type="button"
            title="撤销"
            aria-label="撤销"
            onClick={() => workspaceWs?.undo?.()}
          >
            ↶
          </button>
          <button
            className="rulego-toolbar-btn icon"
            type="button"
            title="重做"
            aria-label="重做"
            onClick={() => workspaceWs?.redo?.()}
          >
            ↷
          </button>
          <button
            className="rulego-toolbar-btn icon"
            type="button"
            title="缩小画布"
            aria-label="缩小画布"
            onClick={() => bumpWorkspaceZoom(-1)}
          >
            −
          </button>
          <span className="rulego-zoom-label" title="当前缩放比例">
            {zoomPercent}%
          </span>
          <button
            className="rulego-toolbar-btn icon"
            type="button"
            title="放大画布"
            aria-label="放大画布"
            onClick={() => bumpWorkspaceZoom(1)}
          >
            +
          </button>
          <button
            className="rulego-toolbar-btn icon"
            type="button"
            title="适配画布"
            aria-label="缩放以适配画布"
            onClick={() => {
              if (workspaceRef.current) {
                const ws = workspaceRef.current as WorkspaceSvg & {
                  zoomToFit?: (opt?: { padding?: number }) => void;
                  getScale?: () => number;
                };
                ws.zoomToFit?.({ padding: 40 });
                requestAnimationFrame(() => {
                  const cur = workspaceRef.current as WorkspaceSvg & { getScale?: () => number } | null;
                  const s = cur?.getScale?.() ?? 1;
                  setZoomPercent(Math.round(s * 100));
                });
              }
            }}
          >
            ⊡
          </button>
        </div>
        <div className="rulego-editor-header-extra">
          <button
            className="rulego-toolbar-btn"
            type="button"
            onClick={() => {
              setAgentError(null);
              setAgentModalOpen(true);
            }}
          >
            Agent 对话
          </button>
          <button className="rulego-toolbar-btn text" type="button" onClick={() => navigate("/rulego")}>
            返回列表
          </button>
          <input
            ref={importDslFileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => {
                setImportDslText(String(reader.result ?? ""));
                setImportDslError(null);
              };
              reader.onerror = () => setImportDslError("读取文件失败");
              reader.readAsText(f, "UTF-8");
              e.target.value = "";
            }}
          />
          <button
            className="rulego-toolbar-btn text"
            type="button"
            title="从 JSON 导入规则链到画布（将替换当前画布内容）"
            onClick={() => {
              setImportDslError(null);
              setImportDslOpen(true);
            }}
          >
            导入
          </button>
          <button
            className="rulego-toolbar-btn text"
            type="button"
            title="查看规则链 DSL"
            onClick={() => {
              if (workspaceRef.current) {
                const te = validateRuleGoTriggerLayout(workspaceRef.current);
                if (te) {
                  setError(te);
                  return;
                }
                ensureRuleGoNodeIdsAreUuid(workspaceRef.current);
                setDsl(buildRuleGoDsl(workspaceRef.current, name, debugMode, root));
              }
              setViewDslOpen(true);
            }}
          >
            导出
          </button>
        </div>
      </header>

      {triggerLayoutError ? (
        <div className="rulego-editor-layout-constraint form-error" role="status">
          {triggerLayoutError}
        </div>
      ) : null}

      <div
        className={`rulego-editor-layout rulego-editor-three-col ${selectedBlockId ? "" : "rulego-editor-side-hidden"}`}
      >
        <div className="rulego-editor-canvas-wrap rulego-editor-single-col-library">
          <div className="rulego-editor-library-col">
            <div className="rulego-panel-title rulego-library-title">
              <span>积木库</span>
              <span className="rulego-badge">{blockLibraryCount}</span>
            </div>
            <input
              type="text"
              className="rulego-library-search"
              placeholder="搜索积木"
              aria-label="搜索积木"
              value={librarySearchKeyword}
              onChange={(e) => setLibrarySearchKeyword(e.target.value)}
            />
            <BlockLibraryPanel workspaceRef={workspaceRef} searchKeyword={librarySearchKeyword} />
          </div>
          <div className="rulego-editor-workspace-col">
            <div className="rulego-panel-title rulego-workspace-title">
              <span>积木工作区</span>
              <span className="rulego-block-count">{blockCount} 个积木</span>
            </div>
            <div
              className="rulego-editor-canvas"
              ref={containerRef}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
            />
          </div>
        </div>
        {selectedBlockId ? (
          <div
            className="rulego-editor-side"
            ref={sidePanelRef}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <BlockConfigModal
              blockId={selectedBlockId}
              workspaceRef={workspaceRef}
              onClose={() => setSelectedBlockId(null)}
              onSaved={() => {
                if (workspaceRef.current) {
                  setDsl(buildRuleGoDsl(workspaceRef.current));
                  setJson(JSON.stringify(ScratchBlocks.serialization.workspaces.save(workspaceRef.current), null, 2));
                }
              }}
              sideError={error}
              inline
              subRuleChains={subRuleChains}
              refContextRules={rules}
              currentRuleId={id ?? ""}
              workspaceDslRevision={dsl}
            />
          </div>
        ) : null}
      </div>

      {importDslOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setImportDslOpen(false);
            setImportDslError(null);
          }}
        >
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>导入规则链 DSL</h3>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setImportDslOpen(false);
                  setImportDslError(null);
                }}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="form-hint" style={{ marginBottom: 10 }}>
                粘贴完整的规则链 JSON（含 ruleChain 与 metadata）。导入后将替换当前画布内容；若 DSL 中含 ruleChain.name，将同步为当前规则名称。
              </p>
              {importDslError ? <div className="form-error" style={{ marginBottom: 8 }}>{importDslError}</div> : null}
              <textarea
                value={importDslText}
                onChange={(e) => {
                  setImportDslText(e.target.value);
                  if (importDslError) setImportDslError(null);
                }}
                rows={18}
                style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
                placeholder='{"ruleChain":{...},"metadata":{...}}'
                spellCheck={false}
              />
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button type="button" className="text-button" onClick={() => importDslFileRef.current?.click()}>
                  选择文件
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setImportDslOpen(false);
                    setImportDslError(null);
                  }}
                >
                  取消
                </button>
                <button type="button" className="primary-button" onClick={handleApplyImportDsl}>
                  导入到画布
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewDslOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setDslCopyFeedback(null);
            setViewDslOpen(false);
          }}
        >
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>规则链 DSL</h3>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setDslCopyFeedback(null);
                  setViewDslOpen(false);
                }}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {dslCopyFeedback ? (
                <p className="form-hint" style={{ marginBottom: 8 }} role="status">
                  {dslCopyFeedback}
                </p>
              ) : null}
              <textarea readOnly value={dsl} rows={20} style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }} />
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    const text = dsl.trim();
                    if (!text) {
                      setDslCopyFeedback("当前 DSL 为空");
                      window.setTimeout(() => setDslCopyFeedback(null), 2000);
                      return;
                    }
                    void (async () => {
                      try {
                        await navigator.clipboard.writeText(dsl);
                        setDslCopyFeedback("已复制到剪贴板");
                      } catch {
                        setDslCopyFeedback("复制失败，请手动选择文本复制");
                      }
                      window.setTimeout(() => setDslCopyFeedback(null), 2000);
                    })();
                  }}
                >
                  复制
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {agentModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setAgentModalOpen(false)}>
          <div className="modal rulego-agent-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Agent 对话编排</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setAgentPrompt("");
                    setAgentPlanResult(null);
                    setAgentPreviewItems([]);
                    setAgentSelectedIds(new Set());
                    setAgentConversationHistory([]);
                    setAgentQuestionAnswers({});
                    setAgentCollapsedQuestions({});
                    setAgentShowOnlyUnanswered(true);
                    setAgentPreviewFilter("all");
                    setAgentMergedDslPreviewOpen(false);
                    setAgentPreviewItemDetailOpen({});
                    setAgentDslPreviewCopyFeedback(null);
                    setAgentReadyPulseShownInSession(false);
                    setAgentError(null);
                  }}
                >
                  新对话
                </button>
                <button type="button" className="text-button" onClick={() => setAgentModalOpen(false)} aria-label="关闭">
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body rulego-agent-modal-body">
              <div className="rulego-agent-input-panel">
                <div className="rulego-agent-panel-section">
                  <div className="rulego-agent-section-label">模型</div>
                  <div className="rulego-agent-model-row">
                    <label className="form-field">
                      <span>模型配置</span>
                      <select
                        value={agentModelConfigId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setAgentModelConfigId(nextId);
                          const cfg = agentModelConfigs.find((c) => c.id === nextId);
                          setAgentModelName(cfg?.models?.[0] ?? "");
                        }}
                      >
                        {agentModelConfigs.length === 0 ? <option value="">暂无模型配置</option> : null}
                        {agentModelConfigs.map((cfg) => (
                          <option key={cfg.id} value={cfg.id}>
                            {cfg.siteDescription || cfg.baseUrl}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      <span>模型</span>
                      <select value={agentModelName} onChange={(e) => setAgentModelName(e.target.value)}>
                        {(agentSelectedConfig?.models ?? []).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                        {(agentSelectedConfig?.models ?? []).length === 0 ? <option value="">暂无可用模型</option> : null}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="rulego-agent-panel-section">
                  <label className="form-field">
                    <span>需求描述</span>
                    <textarea
                      rows={4}
                      value={agentPrompt}
                      onChange={(e) => setAgentPrompt(e.target.value)}
                      placeholder="例如：接收 HTTP 请求后调用 LLM 生成回复，再发送飞书消息"
                    />
                  </label>
                </div>
                <div className="rulego-agent-panel-section rulego-agent-panel-section--actions">
                  <div className="modal-actions rulego-agent-primary-actions">
                    <span className="form-hint rulego-agent-primary-hint">
                      {agentPlanResult?.need_clarification
                        ? agentAllQuestionsAnswered
                          ? "信息已补充完整，点击右侧按钮继续生成预览"
                          : agentQuestionAnswered === 0
                            ? "请至少回答一项追问，或填写上方需求描述后重新生成"
                            : "可继续补充追问后点击右侧按钮，或已全部答完直接继续"
                        : "先生成预览，在右侧勾选节点后再应用到画布"}
                    </span>
                    <button
                      ref={agentPrimaryActionRef}
                      type="button"
                      className={`primary-button ${
                        agentPlanResult?.need_clarification && agentAllQuestionsAnswered ? "rulego-agent-ready-button" : ""
                      } ${agentReadyPulse ? "rulego-agent-ready-pulse" : ""}`}
                      onClick={() =>
                        agentPlanResult?.need_clarification ? void handleSubmitAgentAnswers() : void handleGenerateAgentPlan()
                      }
                      disabled={agentPrimaryDisabled}
                      title={
                        agentPrimaryDisabled && !agentLoading
                          ? !agentSelectedConfig || !agentModelName.trim()
                            ? "请选择模型配置与模型"
                            : agentClarificationRound && agentQuestionAnswered === 0
                              ? "请先回答至少一项追问"
                              : !agentPrompt.trim()
                                ? "请先填写需求描述"
                                : undefined
                          : undefined
                      }
                    >
                      {agentLoading
                        ? "生成中..."
                        : agentPlanResult?.need_clarification
                          ? agentAllQuestionsAnswered
                            ? "可继续生成"
                            : "提交补充信息并继续生成"
                          : "生成预览"}
                    </button>
                  </div>
                  {agentError ? <div className="form-error rulego-agent-inline-error">{agentError}</div> : null}
                </div>
                <div className="rulego-agent-panel-section rulego-agent-panel-section--chat">
                  <div className="rulego-agent-section-label">对话记录</div>
                  <div className="rulego-agent-chat-log">
                    {agentConversationHistory.length === 0 ? (
                      <div className="form-hint">
                        描述目标后点击「生成预览」。Agent 会结合当前画布 DSL 推理；信息不足时会追问。多轮对话会显示在此处。
                        {agentAvailableSubRuleChains.length > 0 ? (
                          <>
                            {" "}
                            规则库中还有 {agentAvailableSubRuleChains.length}{" "}
                            条已启用子规则链，生成规划时会优先尝试用「子规则链」节点（flow / targetId）复用，减少重复搭建。
                          </>
                        ) : null}
                      </div>
                    ) : (
                      agentConversationHistory.map((msg, idx) => (
                        <div
                          key={`${idx}-${msg.role}`}
                          className={`rulego-agent-chat-bubble ${msg.role === "user" ? "user" : "assistant"}`}
                        >
                          <div className="rulego-agent-chat-role">{msg.role === "user" ? "你" : "Agent"}</div>
                          <div className="rulego-agent-chat-content">{msg.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              {agentPlanResult ? (
                <div className="rulego-agent-preview rulego-agent-result-panel">
                  <div className="rulego-agent-result-upper">
                  {agentPlanResult.thought ? (
                    <div className="rulego-agent-thought">
                      <div className="rulego-agent-thought-title">Agent 思考</div>
                      <div className="form-hint">{agentPlanResult.thought}</div>
                    </div>
                  ) : null}
                  {agentPlanResult.questions?.length ? (
                    <div className="rulego-agent-questions">
                      <div className="rulego-agent-questions-head">
                        <div className="rulego-agent-thought-title">
                          Agent 追问（请回答后继续）
                          <span className="rulego-agent-question-progress">已回答 {agentQuestionAnswered} / {agentQuestionTotal}</span>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <label className="form-hint" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={agentShowOnlyUnanswered}
                              onChange={(e) => setAgentShowOnlyUnanswered(e.target.checked)}
                            />
                            仅显示未回答
                          </label>
                          <button type="button" className="text-button" onClick={handleAutoFillAgentAnswers}>
                            一键填充推荐答案
                          </button>
                        </div>
                      </div>
                      {agentPlanResult.questions
                        .filter((q) => (agentShowOnlyUnanswered ? !String(agentQuestionAnswers[q] ?? "").trim() : true))
                        .map((q) => {
                        const collapsed = agentCollapsedQuestions[q] === true;
                        const answer = agentQuestionAnswers[q] ?? "";
                        return (
                          <div key={q} className="form-field rulego-agent-question-item">
                            <div className="rulego-agent-question-head">
                              <span>{q}</span>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() =>
                                  setAgentCollapsedQuestions((prev) => ({ ...prev, [q]: !collapsed }))
                                }
                              >
                                {collapsed ? "展开" : "折叠"}
                              </button>
                            </div>
                            {collapsed ? (
                              <div className="form-hint">{answer ? `已回答：${answer}` : "未回答"}</div>
                            ) : (
                              <>
                                <input
                                  value={answer}
                                  onChange={(e) =>
                                    setAgentQuestionAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                                  }
                                  placeholder="请输入你的回答"
                                />
                                <div className="rulego-agent-candidate-options">
                                  {getAgentRecommendedCandidates(q, agentWorkspaceContext).map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      className={`rulego-agent-candidate-option ${answer === opt ? "active" : ""}`}
                                      onClick={() => setAgentQuestionAnswers((prev) => ({ ...prev, [q]: opt }))}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                                <div className="rulego-agent-quick-answers">
                                  {getAgentQuickAnswerTemplates(q).map((tpl) => (
                                    <button
                                      key={tpl}
                                      type="button"
                                      className="text-button"
                                      onClick={() => setAgentQuestionAnswers((prev) => ({ ...prev, [q]: tpl }))}
                                    >
                                      {tpl}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                      <p className="form-hint rulego-agent-questions-footer-hint">
                        填答后使用左栏主按钮「提交补充信息并继续生成」即可，无需重复操作。
                      </p>
                    </div>
                  ) : null}
                  {agentPlanResult.warnings?.length ? (
                    <div className="form-hint">注意: {agentPlanResult.warnings.join("；")}</div>
                  ) : null}
                  </div>
                  <div className="rulego-agent-result-preview-main">
                  <div className="rulego-agent-preview-toolbar">
                    <div className="form-hint">预览项过滤</div>
                    <div className="rulego-agent-preview-filter">
                      <button
                        type="button"
                        className={`rulego-agent-candidate-option ${agentPreviewFilter === "selected" ? "active" : ""}`}
                        onClick={() => setAgentPreviewFilter("selected")}
                      >
                        仅已勾选
                      </button>
                      <button
                        type="button"
                        className={`rulego-agent-candidate-option ${agentPreviewFilter === "all" ? "active" : ""}`}
                        onClick={() => setAgentPreviewFilter("all")}
                      >
                        全部
                      </button>
                    </div>
                  </div>
                  <div className="rulego-agent-merged-dsl-bar">
                    <button
                      type="button"
                      className={`rulego-agent-candidate-option ${agentMergedDslPreviewOpen ? "active" : ""}`}
                      onClick={() => setAgentMergedDslPreviewOpen((v) => !v)}
                    >
                      {agentMergedDslPreviewOpen ? "隐藏" : "预览"}合并后完整 DSL
                    </button>
                    {agentMergedDslPreviewOpen ? (
                      <button
                        type="button"
                        className="text-button rulego-agent-copy-dsl-btn"
                        onClick={() => {
                          const t = agentMergedDslPreviewText.trim();
                          if (!t || t.startsWith("/*")) return;
                          void (async () => {
                            try {
                              await navigator.clipboard.writeText(agentMergedDslPreviewText);
                              setAgentDslPreviewCopyFeedback("已复制");
                            } catch {
                              setAgentDslPreviewCopyFeedback("复制失败");
                            }
                            window.setTimeout(() => setAgentDslPreviewCopyFeedback(null), 2000);
                          })();
                        }}
                      >
                        复制 JSON
                      </button>
                    ) : null}
                    {agentDslPreviewCopyFeedback ? (
                      <span className="form-hint rulego-agent-copy-dsl-tip" role="status">
                        {agentDslPreviewCopyFeedback}
                      </span>
                    ) : null}
                  </div>
                  {agentMergedDslPreviewOpen ? (
                    <div className="rulego-agent-merged-dsl-preview">
                      <textarea
                        readOnly
                        className="rulego-agent-json-preview-textarea"
                        value={agentMergedDslPreviewText || "（工作区未就绪）"}
                        rows={10}
                        spellCheck={false}
                        aria-label="合并后的规则链 DSL 预览"
                      />
                    </div>
                  ) : null}
                  <div className="rulego-agent-preview-list">
                    {agentPreviewItems
                      .filter((item) => (agentPreviewFilter === "selected" ? agentSelectedIds.has(item.id) : true))
                      .map((item) => {
                        const cbId = `agent-preview-cb-${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
                        const detailOpen = Boolean(agentPreviewItemDetailOpen[item.id]);
                        const detailJson =
                          item.kind === "node" && item.node
                            ? JSON.stringify(
                                {
                                  id: item.node.id,
                                  node_type: item.node.node_type,
                                  name: item.node.name,
                                  configuration: item.node.configuration ?? {},
                                },
                                null,
                                2
                              )
                            : item.kind === "edge" && item.edge
                              ? JSON.stringify(
                                  {
                                    from_id: item.edge.from_id,
                                    to_id: item.edge.to_id,
                                    type: item.edge.type ?? "Success",
                                  },
                                  null,
                                  2
                                )
                              : "";
                        return (
                          <div
                            key={item.id}
                            className={`rulego-agent-preview-item ${item.valid ? "" : "invalid"}`}
                          >
                            <input
                              id={cbId}
                              type="checkbox"
                              className="rulego-agent-preview-item-checkbox"
                              checked={agentSelectedIds.has(item.id)}
                              disabled={!item.valid}
                              onChange={(e) => {
                                setAgentSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(item.id);
                                  else next.delete(item.id);
                                  return next;
                                });
                              }}
                            />
                            <div className="rulego-agent-preview-item-body">
                              <label htmlFor={cbId} className="rulego-agent-preview-item-title-block">
                                <div className="rulego-agent-preview-item-title">{item.title}</div>
                                <div className="form-hint">{item.detail}</div>
                                <div className="form-hint">
                                  置信度: {Math.round(item.confidence * 100)}%
                                  {item.reason ? ` · ${item.reason}` : ""}
                                  {!item.valid && item.validationError ? ` · ${item.validationError}` : ""}
                                </div>
                              </label>
                              {detailJson ? (
                                <>
                                  <button
                                    type="button"
                                    className="text-button rulego-agent-preview-detail-toggle"
                                    onClick={() =>
                                      setAgentPreviewItemDetailOpen((prev) => ({
                                        ...prev,
                                        [item.id]: !prev[item.id],
                                      }))
                                    }
                                  >
                                    {detailOpen ? "收起" : "展开"} JSON 详情
                                  </button>
                                  {detailOpen ? (
                                    <pre className="rulego-agent-item-json-preview" tabIndex={0}>
                                      {detailJson}
                                    </pre>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="text-button" onClick={() => setAgentModalOpen(false)}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={handleAddAgentSelectionsToCanvas}
                      disabled={agentApplyDisabled}
                      title={agentApplyDisabled ? agentApplyDisabledTitle : "合并到当前画布，不关闭对话框；已勾选项在成功后自动取消勾选"}
                    >
                      添加到画布
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleApplyAgentSelections}
                      disabled={agentApplyDisabled}
                      title={agentApplyDisabled ? agentApplyDisabledTitle : undefined}
                    >
                      应用所选项
                    </button>
                  </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {saveFeedback && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          style={{ alignItems: "flex-start", paddingTop: "10vh" }}
          onClick={() => setSaveFeedback(null)}
        >
          <div
            className="modal"
            style={{ maxWidth: 280, padding: "12px 16px 14px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                paddingBottom: 8,
                position: "relative",
                justifyContent: saveFeedback.type === "success" ? "center" : undefined,
              }}
            >
              <h3 style={{ fontSize: 15, textAlign: saveFeedback.type === "success" ? "center" : undefined }}>
                {saveFeedback.type === "success" ? "保存成功" : "保存失败"}
              </h3>
              <button
                type="button"
                className="text-button"
                style={saveFeedback.type === "success" ? { position: "absolute", right: 0 } : undefined}
                onClick={() => setSaveFeedback(null)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            {saveFeedback.type === "error" ? (
              <div className="modal-body" style={{ padding: 0, fontSize: 13 }}>
                <p style={{ margin: 0, color: "var(--color-error, #b91c1c)" }}>{saveFeedback.message}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {nameModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setNameModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>配置规则链</h3>
              <button type="button" className="text-button" onClick={() => setNameModalOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <form
              className="modal-body"
              onSubmit={(event) => {
                event.preventDefault();
                void handleNameConfirm();
              }}
            >
              <label className="form-field">
                <span>规则名称（必填）</span>
                <input
                  value={nameDraft}
                  onChange={(event) => {
                    setNameDraft(event.target.value);
                    if (nameModalError) setNameModalError(null);
                  }}
                  placeholder="请输入规则链名称"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                />
              </label>
              <label className="form-field">
                <span>规则描述（必填）</span>
                <input
                  value={descriptionDraft}
                  onChange={(event) => {
                    setDescriptionDraft(event.target.value);
                    if (nameModalError) setNameModalError(null);
                  }}
                  placeholder="请输入规则描述"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                />
              </label>
              {nameModalError ? <div className="form-error">{nameModalError}</div> : null}
              <div className="modal-actions">
                <button type="button" className="text-button" onClick={() => setNameModalOpen(false)}>
                  取消
                </button>
                <button className="primary-button" type="submit" disabled={saving}>
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {testModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setTestModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>模拟测试规则链</h3>
              <button type="button" className="text-button" onClick={() => setTestModalOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="modal-body" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              <p className="form-hint" style={{ marginBottom: 12 }}>
                与常规调试一致：输入消息类型、元数据与消息体，对当前画布规则链执行一次，查看末端输出。
              </p>
              <p className="form-hint" style={{ marginBottom: 12, padding: 8, background: "var(--color-warning-bg, #fffbeb)", borderRadius: 6, border: "1px solid var(--color-warning, #f59e0b)", fontSize: 13 }}>
                <strong>注意：</strong>若规则链中启用了技能（如 API 追踪），技能执行可能需 <strong>1–3 分钟</strong>。执行期间请<strong>勿关闭本弹窗或应用</strong>，否则会导致技能未执行完毕即终止、结果无法返回。
              </p>
              <label className="form-field">
                <span>消息类型 (message_type)</span>
                <input
                  value={testMessageType}
                  onChange={(e) => setTestMessageType(e.target.value)}
                  placeholder="default"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="form-field">
                <span>元数据 (metadata) JSON</span>
                <JsonEditor
                  value={testMetadataJson}
                  onChange={setTestMetadataJson}
                  height={100}
                  minHeight={80}
                  showFormatButton
                  showExpandButton
                  expandTitle="测试 — 元数据 metadata (JSON)"
                  onFormatError={(msg) => setError(msg)}
                />
              </label>
              <label className="form-field">
                <span>消息体 (data) JSON</span>
                <JsonEditor
                  value={testDataJson}
                  onChange={setTestDataJson}
                  height={140}
                  minHeight={80}
                  showFormatButton
                  showExpandButton
                  expandTitle="测试 — 消息体 data (JSON)"
                  onFormatError={(msg) => setError(msg)}
                />
              </label>
              <div className="modal-actions" style={{ marginTop: 8 }}>
                <button type="button" className="text-button" onClick={() => setTestModalOpen(false)}>
                  关闭
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={testRunning}
                  onClick={() => void handleTestRun()}
                  title={testRunning ? "技能执行可能需 1–3 分钟，请耐心等待" : ""}
                >
                  {testRunning ? "执行中…（请勿关闭窗口）" : "执行"}
                </button>
              </div>
              {testResult !== null && (
                <>
                  <div
                    className="form-field"
                    style={{
                      marginTop: 16,
                      padding: 12,
                      background: testResult.success ? "var(--color-success-bg, #ecfdf5)" : "var(--color-error-bg, #fef2f2)",
                      borderRadius: 8,
                      border: `1px solid ${testResult.success ? "var(--color-success, #10b981)" : "var(--color-error, #ef4444)"}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontWeight: 600 }}>{testResult.success ? "成功" : "失败"}</span>
                      <span style={{ fontSize: 13, color: "#64748b" }}>耗时 {testResult.elapsed} ms</span>
                    </div>
                    {testResult.success ? (
                      <>
                        <JsonEditor
                          value={prettyJsonForDisplay(testResult.data ?? "", "(无输出)")}
                          onChange={() => {}}
                          readOnly
                          height={220}
                          minHeight={120}
                          showExpandButton
                          expandTitle="规则链测试 — 输出"
                        />
                        <p className="form-hint" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                          下方可输入回复并点击「发送」继续对话（若未看到输入框请向下滚动）。
                        </p>
                      </>
                    ) : (
                      <JsonEditor
                        value={prettyJsonForDisplay(testResult.error ?? "", "未知错误")}
                        onChange={() => {}}
                        readOnly
                        height={180}
                        minHeight={100}
                        showExpandButton
                        expandTitle="规则链测试 — 错误信息"
                      />
                    )}
                  </div>
                  {testResult.success && (
                    <div
                      className="form-field"
                      style={{
                        marginTop: 16,
                        padding: 12,
                        background: "var(--color-block-bg, #f1f5f9)",
                        borderRadius: 8,
                        border: "1px solid var(--color-border, #e2e8f0)",
                      }}
                    >
                      <span style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}>继续对话</span>
                      <p className="form-hint" style={{ marginBottom: 8, fontSize: 12 }}>
                        模型若要求补充信息（如范围：前端/后端/全部），在下方输入后点击「发送」继续，无需关闭弹窗。
                      </p>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="text"
                          className="form-input"
                          value={testFollowUpInput}
                          onChange={(e) => setTestFollowUpInput(e.target.value)}
                          placeholder="例如：全部、前端、后端"
                          style={{ flex: 1, minWidth: 0 }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (testFollowUpInput.trim()) void handleTestRun();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="primary-button"
                          disabled={testRunning || !testFollowUpInput.trim()}
                          onClick={() => void handleTestRun()}
                        >
                          {testRunning ? "执行中…" : "发送"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
