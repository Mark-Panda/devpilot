import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as ScratchBlocks from "scratch-blocks";
import type { WorkspaceSvg, Block, BlockSvg } from "blockly/core";
import { getEnabledFromDefinition, isSubRuleChain } from "./dslUtils";
import { useRuleGoRules } from "./useRuleGoRules";
import {
  executeRuleGoRuleByDefinition,
  listAvailableSkills,
  type AvailableSkillItem,
  type ExecuteRuleOutput,
} from "./useRuleGoApi";
import {
  registerAllBlocks,
  toolbox as rulegoToolbox,
  getBlockDef,
  getBlockTypeFromNodeType,
} from "./rulego-blocks";
import { JsEditor, JsonEditor, SqlEditor } from "../../shared/components";
import { BlockLibraryPanel, DRAG_TYPE_BLOCK } from "./BlockLibraryPanel";
import { UI_RELATION_FAILURE } from "./relationLabels";
import { listModelConfigs } from "../model-management/useModelConfigApi";
import type { ModelConfig } from "../model-management/types";

const scratchTheme = new ScratchBlocks.Theme(
  "scratch",
  {
    rulego_trigger: {
      colourPrimary: "#ef4444",
      colourSecondary: "#f87171",
      colourTertiary: "#fca5a5",
    },
    rulego_action: {
      colourPrimary: "#3b82f6",
      colourSecondary: "#60a5fa",
      colourTertiary: "#93c5fd",
    },
    rulego_condition: {
      colourPrimary: "#14b8a6",
      colourSecondary: "#2dd4bf",
      colourTertiary: "#5eead4",
    },
    rulego_data: {
      colourPrimary: "#f59e0b",
      colourSecondary: "#fbbf24",
      colourTertiary: "#fde68a",
    },
    rulego_flow: {
      colourPrimary: "#8b5cf6",
      colourSecondary: "#a78bfa",
      colourTertiary: "#c4b5fd",
    },
    rulego_db: {
      colourPrimary: "#0d9488",
      colourSecondary: "#14b8a6",
      colourTertiary: "#5eead4",
    },
    rulego_file: {
      colourPrimary: "#b45309",
      colourSecondary: "#d97706",
      colourTertiary: "#fbbf24",
    },
    rulego_tracer: {
      colourPrimary: "#0891b2",
      colourSecondary: "#06b6d4",
      colourTertiary: "#67e8f9",
    },
  },
  {
    rulego_trigger: { colour: "#ef4444" },
    rulego_action: { colour: "#3b82f6" },
    rulego_condition: { colour: "#14b8a6" },
    rulego_data: { colour: "#f59e0b" },
    rulego_flow: { colour: "#8b5cf6" },
    rulego_db: { colour: "#0d9488" },
    rulego_file: { colour: "#b45309" },
    rulego_tracer: { colour: "#0891b2" },
  }
);

(ScratchBlocks as { ScratchMsgs?: { setLocale?: (locale: string) => void } }).ScratchMsgs?.setLocale?.("zh-cn");

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

type SubRuleChainOption = { id: string; name: string };

type BlockConfigModalProps = {
  blockId: string | null;
  workspaceRef: React.RefObject<WorkspaceSvg | null>;
  onClose: () => void;
  onSaved?: () => void;
  /** 内嵌模式：在右侧属性面板中渲染，无遮罩无取消 */
  inline?: boolean;
  /** 子规则链列表（DSL 中 root 为 false 的规则链），用于 flow 块的 targetId 下拉 */
  subRuleChains?: SubRuleChainOption[];
};

type CaseItem = { case: string; then: string };

function BlockConfigModal({ blockId, workspaceRef, onClose, onSaved, inline, subRuleChains = [] }: BlockConfigModalProps) {
  const block = blockId && workspaceRef.current ? workspaceRef.current.getBlockById(blockId) : null;
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [switchCases, setSwitchCases] = useState<CaseItem[]>([{ case: "true", then: "Case1" }]);
  const [availableSkills, setAvailableSkills] = useState<AvailableSkillItem[]>([]);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  /** 用于鼠标离开时判断是否有未保存修改 */
  const initialFormRef = useRef<Record<string, string | boolean>>({});
  const initialSwitchCasesRef = useRef<CaseItem[]>([]);
  const initialDbClientParamsRef = useRef<Array<{ type: "string" | "number"; value: string }>>([]);
  const [confirmUnsavedOpen, setConfirmUnsavedOpen] = useState(false);
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
    if (block.type === "rulego_apiRouteTracer_gitPrepare") {
      next.WORK_DIR = get("WORK_DIR");
    }
    if (block.type === "rulego_apiRouteTracer_agentAnalyze") {
      next.AGENT_CMD = get("AGENT_CMD") || "agent";
      next.TIMEOUT_SEC = get("TIMEOUT_SEC") || "180";
      next.MAX_RETRIES = get("MAX_RETRIES") || "2";
    }
    if (block.type === "rulego_sourcegraphSearch") {
      next.SG_ENDPOINT = get("SG_ENDPOINT") || "https://sourcegraph.com";
      next.SG_TOKEN = get("SG_TOKEN");
      next.SG_TIMEOUT_SEC = get("SG_TIMEOUT_SEC") || "30";
      next.SG_DEFAULT_QUERY = get("SG_DEFAULT_QUERY");
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
    if (block.type === "rulego_join") {
      const raw = get("JOIN_EXTRA_INCOMINGS") || "";
      const extra = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
      setJoinExtraIncomings(extra);
      const mainPrev = block.previousConnection?.targetBlock?.();
      const total = (mainPrev ? 1 : 0) + extra.length;
      block.setFieldValue(total >= 2 ? ` (${total}路)` : "", "JOIN_ROUTES_LABEL");
    } else {
      setJoinExtraIncomings([]);
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
    return false;
  }, [form, switchCases, dbClientParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!block) return;
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
    Object.entries(form).forEach(([key, value]) => {
      if (form[key] === undefined || key === "CASES_JSON" || key === "GROUP_SLOT_COUNT" || key === "FORK_BRANCH_COUNT" || key === "NODE_ID" || key === "DEBUG" || llmParamKeys.has(key))
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
    if (block.type === "rulego_dbClient") {
      const sql = String(form.DB_SQL ?? "");
      const paramCount = (sql.match(/\?/g) || []).length;
      block.setFieldValue(JSON.stringify(dbClientParams.slice(0, paramCount)), "DB_PARAMS");
    }
    onSaved?.();
    initialFormRef.current = { ...form };
    initialSwitchCasesRef.current = switchCases.map((c) => ({ ...c }));
    initialDbClientParamsRef.current = dbClientParams.map((p) => ({ ...p }));
    if (!inline) onClose();
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
              RuleGo 条件分支
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
            参考 <a href="https://rulego.cc/pages/fork/#%E9%85%8D%E7%BD%AE" target="_blank" rel="noopener noreferrer">RuleGo 并行网关</a>
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
              <a href="https://rulego.cc/pages/join/" target="_blank" rel="noopener noreferrer">RuleGo 汇聚</a>
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
            <a href="https://rulego.cc/pages/group-action/" target="_blank" rel="noopener noreferrer">RuleGo 节点组</a>
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
              RuleGo 遍历组件
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
      {block.type === "rulego_delay" && (
        <>
          <label className="form-field">
            <span>延迟时间 (ms)</span>
            <input
              value={String(form.DELAY_MS ?? "60000")}
              onChange={(e) => setForm((f) => ({ ...f, DELAY_MS: e.target.value }))}
              placeholder="60000 或 ${metadata.delay}"
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
      {block.type === "rulego_apiRouteTracer_gitPrepare" && (
        <>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>工作目录 (workDir)</span>
            <input
              value={String(form.WORK_DIR ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, WORK_DIR: e.target.value }))}
              placeholder="克隆/更新服务的父目录"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            支持完整 Router JSON（按 data 下标取项，下标来自 metadata 的 api_route_tracer_service_index 或 for 注入的 _loopIndex）；也支持 for 遍历 msg.data 时传入的单条 service 对象。
          </p>
        </>
      )}
      {block.type === "rulego_apiRouteTracer_agentAnalyze" && (
        <>
          <label className="form-field">
            <span>Agent 命令 (agentCommand)</span>
            <input
              value={String(form.AGENT_CMD ?? "agent")}
              onChange={(e) => setForm((f) => ({ ...f, AGENT_CMD: e.target.value }))}
              placeholder="agent"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            <span>单次超时 (秒)</span>
            <input
              type="number"
              value={String(form.TIMEOUT_SEC ?? "180")}
              onChange={(e) => setForm((f) => ({ ...f, TIMEOUT_SEC: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>最大重试次数 (maxRetries)</span>
            <input
              type="number"
              value={String(form.MAX_RETRIES ?? "2")}
              onChange={(e) => setForm((f) => ({ ...f, MAX_RETRIES: e.target.value }))}
            />
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            依赖前置节点写入的 metadata：api_route_tracer_service_path、trace_url、trace_method。首次完整提示词，重试时切换为简化提示词。
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
          </label>
          <label className="form-field">
            <span>超时 (秒)</span>
            <input
              type="number"
              value={String(form.SG_TIMEOUT_SEC ?? "30")}
              onChange={(e) => setForm((f) => ({ ...f, SG_TIMEOUT_SEC: e.target.value }))}
            />
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
          </label>
          <p className="form-hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            调用 <code>/.api/graphql</code>，使用官方 search 查询；消息 data 可为纯文本或 JSON{" "}
            <code>{"{\"query\":\"repo:foo/bar func\"}"}</code>。鉴权头为 <code>Authorization: token …</code>。
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
            后端 <code>restApiCall</code> 使用 FastHTTP 实现；配置与 RuleGo 标准一致。
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
              placeholder="${data}"
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
                <span className="form-hint">支持 RuleGo 组件配置变量；数字类型在 DSL 中会输出为 number</span>
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
    <form ref={formRef} className="block-config-inline-form" onSubmit={handleSubmit}>
      {formBody}
      <div className="block-config-inline-actions">
        <button type="submit" className="primary-button" disabled={!block}>
          确定
        </button>
      </div>
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
        <div
          className="block-config-inline"
          onMouseLeave={handleMouseLeaveConfig}
        >
          <div className="block-config-inline-header">
            <h3>块属性 · {block?.type ?? blockId}</h3>
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [dsl, setDsl] = useState("");
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [root, setRoot] = useState(true);
  const [enabledDraftInModal, setEnabledDraftInModal] = useState(true);
  const [debugDraftInModal, setDebugDraftInModal] = useState(false);
  const [nameModalError, setNameModalError] = useState<string | null>(null);
  const [viewDslOpen, setViewDslOpen] = useState(false);
  const [viewJsonOpen, setViewJsonOpen] = useState(false);
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
  const [librarySearchKeyword, setLibrarySearchKeyword] = useState("");
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

  /** 规则管理中 root 为 false 的子规则链，供 flow 块 targetId 下拉选择 */
  const subRuleChains = useMemo(
    () => rules.filter((r) => isSubRuleChain(r.definition ?? "")).map((r) => ({ id: r.id, name: r.name })),
    [rules]
  );

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
    const block = workspace.newBlock(blockType) as BlockSvg;
    block.initSvg();
    block.render();
    block.moveBy(wsX, wsY);
  };

  useEffect(() => {
    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      const msg = ev.reason?.message ?? String(ev.reason);
      if (msg && (msg.includes("Decoding") || msg.includes("EncodingError"))) {
        console.warn("[RuleGo] Media/decoding error (scratch-blocks):", ev.reason);
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
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.9,
        maxScale: 2,
        minScale: 0.4,
        scaleSpeed: 1.1,
      },
      trashcan: false,
      grid: { spacing: 20, length: 3, colour: "#334155", snap: true },
    }) as WorkspaceSvg;

    workspaceRef.current = workspace;

    const handleChange = (ev?: { blockId?: string }) => {
      ensureRuleGoNodeIdsAreUuid(workspace);
      if (ev?.blockId) lastTouchedBlockIdRef.current = ev.blockId;
      const state = ScratchBlocks.serialization.workspaces.save(workspace);
      setJson(JSON.stringify(state, null, 2));
      const nextDsl = buildRuleGoDsl(
        workspace,
        nameRef.current ?? "",
        debugModeRef.current,
        rootRef.current,
        enabledRef.current
      );
      setDsl(nextDsl);
      const topBlocks = workspace.getTopBlocks(true);
      setBlockCount(topBlocks.length);
      // 不在 handleChange 里用 getSelected() 覆盖 selectedBlockId，否则焦点移到属性面板时会被清空
    };

    const initialState = ScratchBlocks.serialization.workspaces.save(workspace);
    setJson(JSON.stringify(initialState, null, 2));
    const initialDsl = buildRuleGoDsl(workspace);
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

    if (editingRule) {
      setName(editingRule.name);
      setDescription(editingRule.description);
      setDsl(editingRule.definition);
      setSavedDsl(editingRule.definition ?? "");
      setJson(editingRule.editorJson);
      try {
        const parsed = JSON.parse(editingRule.definition);
        const chain = parsed?.ruleChain;
        setDebugMode(Boolean(chain?.debugMode));
        setRoot(chain?.root !== false);
        setEnabled(getEnabledFromDefinition(editingRule.definition));
      } catch {
        setDebugMode(false);
        setRoot(true);
        setEnabled(true);
      }
    } else {
      setName("");
      setDescription("");
      setDebugMode(false);
      setRoot(true);
    }

    if (editingRule?.editorJson) {
      try {
        const state = JSON.parse(editingRule.editorJson);
        ScratchBlocks.serialization.workspaces.load(state, workspaceRef.current, { recordUndo: false });
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
        setDsl(loadedDsl);
        setSavedDsl(loadedDsl);
        return;
      } catch {
        // ignore malformed json
      }
    }

    if (editingRule?.definition) {
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
        setDsl(loadedDsl);
        setSavedDsl(loadedDsl);
      } catch (err) {
        setError((err as Error).message || "RuleGo DSL 解析失败");
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
    const nextDsl =
      workspaceRef.current
        ? buildRuleGoDsl(workspaceRef.current, trimmedName, useDebugMode, useRoot, useEnabled)
        : dsl;
    if (!nextDsl.trim()) {
      const msg = "RuleGo DSL 不能为空";
      setError(msg);
      setSaveFeedback({ type: "error", message: msg });
      return;
    }
    if (!json.trim()) {
      const msg = "Scratch JSON 不能为空";
      setError(msg);
      setSaveFeedback({ type: "error", message: msg });
      return;
    }
    if (workspaceRef.current) {
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
          editorJson: json.trim(),
        });
      } else {
        const created = await create({
          name: trimmedName,
          description: String(useDescription).trim(),
          definition: nextDsl.trim(),
          editorJson: json.trim(),
        });
        // 新建保存后跳转到该规则的编辑 URL，后续点击保存会走 update 而非再次 create
        navigate(`/rulego/editor/${created.id}`, { replace: true });
      }
      setSaveFeedback({ type: "success" });
      setSavedDsl(nextDsl.trim());
    } catch (err) {
      const msg = (err as Error).message || "保存失败";
      setError(msg);
      setSaveFeedback({ type: "error", message: msg });
    } finally {
      setSaving(false);
    }
  };

  const normalizeDslForCompare = (s: string) => {
    const t = (s ?? "").trim();
    if (!t) return "";
    try {
      return JSON.stringify(JSON.parse(t));
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
        error: (err as Error).message || "执行失败",
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
    if (!def) return null;
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
    if (!ruleDsl?.metadata?.nodes) return;

    const nodes = ruleDsl.metadata.nodes as Array<any>;
    const connections = (ruleDsl.metadata.connections ?? []) as Array<any>;

    workspace.clear();

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
        fromBlock.setFieldValue(type, "LINK_TYPE");
        if (connection.label) fromBlock.setFieldValue(String(connection.label), "LINK_LABEL");
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

    const addConnectionsFromBlock = (fromBlock: Block) => {
      const fromId = getFieldValue(fromBlock, "NODE_ID") || fromBlock.id;
      const addConn = (toBlock: Block | null, type: string, label?: string) => {
        if (!toBlock) return;
        const toId = getFieldValue(toBlock, "NODE_ID") || toBlock.id;
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
        metadata: {
          firstNodeIndex: 0,
          nodes,
          connections,
          ruleChainConnections: [],
        },
      },
      null,
      2
    );
  };

  const workspaceWs = workspaceRef.current as (WorkspaceSvg & { undo?: () => void; redo?: () => void; zoom?: (delta: number, cursor?: { x: number; y: number }) => void; getScale?: () => number }) | null;
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
        <h1 className="rulego-editor-title">可视化规则编辑器</h1>
        <div className="rulego-editor-toolbar">
          <button
            className={`rulego-toolbar-btn ${isDirty ? "primary" : "save-unchanged"}`}
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            title={isDirty ? "保存规则" : "无变更，无需保存"}
          >
            保存
          </button>
          <button className="rulego-toolbar-btn" type="button" title="测试" onClick={handleTestClick}>
            测试
          </button>
        </div>
        <div className="rulego-editor-view-controls">
          <button
            className="rulego-toolbar-btn icon"
            type="button"
            title="撤销"
            onClick={() => workspaceWs?.undo?.()}
          >
            ↶
          </button>
          <button
            className="rulego-toolbar-btn icon"
            type="button"
            title="重做"
            onClick={() => workspaceWs?.redo?.()}
          >
            ↷
          </button>
          <span className="rulego-zoom-label" title="缩放">
            {workspaceWs?.getScale ? `${Math.round((workspaceWs.getScale() ?? 1) * 100)}%` : "100%"}
          </span>
          <button
            className="rulego-toolbar-btn icon"
            type="button"
            title="适配画布"
            onClick={() => {
              if (workspaceRef.current) {
                const ws = workspaceRef.current as WorkspaceSvg & { zoomToFit?: (opt?: { padding?: number }) => void };
                ws.zoomToFit?.({ padding: 40 });
              }
            }}
          >
            ⊡
          </button>
        </div>
        <div className="rulego-editor-header-extra">
          <button className="rulego-toolbar-btn text" type="button" onClick={() => navigate("/rulego")}>
            返回列表
          </button>
          <button
            className="rulego-toolbar-btn text"
            type="button"
            title="弹出 RuleGo DSL"
            onClick={() => {
              if (workspaceRef.current) {
                ensureRuleGoNodeIdsAreUuid(workspaceRef.current);
                setDsl(buildRuleGoDsl(workspaceRef.current, name, debugMode, root));
              }
              setViewDslOpen(true);
            }}
          >
            导出
          </button>
          <button
            className="rulego-toolbar-btn text"
            type="button"
            onClick={() => {
              if (workspaceRef.current) {
                setJson(JSON.stringify(ScratchBlocks.serialization.workspaces.save(workspaceRef.current), null, 2));
              }
              setViewJsonOpen(true);
            }}
          >
            查看 JSON
          </button>
        </div>
      </header>

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
            <div className="rulego-panel-title">属性设置</div>
            {error ? <div className="form-error">{error}</div> : null}
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
              inline
              subRuleChains={subRuleChains}
            />
          </div>
        ) : null}
      </div>

      {viewDslOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setViewDslOpen(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>RuleGo DSL</h3>
              <button type="button" className="text-button" onClick={() => setViewDslOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="modal-body">
              <textarea readOnly value={dsl} rows={20} style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }} />
            </div>
          </div>
        </div>
      )}

      {viewJsonOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setViewJsonOpen(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Scratch JSON</h3>
              <button type="button" className="text-button" onClick={() => setViewJsonOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="modal-body">
              <textarea readOnly value={json} rows={20} style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }} />
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
                参考 RuleGo 调试：输入消息类型、元数据与消息体，对当前画布规则链执行一次，查看末端输出。
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
                        <pre style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {testResult.data || "(无输出)"}
                        </pre>
                        <p className="form-hint" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                          下方可输入回复并点击「发送」继续对话（若未看到输入框请向下滚动）。
                        </p>
                      </>
                    ) : (
                      <pre style={{ margin: 0, fontSize: 13, color: "var(--color-error, #b91c1c)", whiteSpace: "pre-wrap" }}>
                        {testResult.error || "未知错误"}
                      </pre>
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
