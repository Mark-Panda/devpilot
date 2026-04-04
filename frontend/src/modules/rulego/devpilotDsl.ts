import { emptyRuleChainParamsJson } from "./ruleChainRequestParams";

/** 与后端 rulego.devpilot DSL 约定一致 */
export const DEVPILOT_DSL_SCHEMA_VERSION = 1;

export type DevPilotIOArrays = {
  request_metadata_params: unknown[];
  request_message_body_params: unknown[];
  response_message_body_params: unknown[];
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseParamsArrayFromIO(raw: unknown): string {
  if (raw == null) return emptyRuleChainParamsJson();
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return emptyRuleChainParamsJson();
    try {
      JSON.parse(t);
      return t;
    } catch {
      return emptyRuleChainParamsJson();
    }
  }
  if (Array.isArray(raw)) {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return emptyRuleChainParamsJson();
    }
  }
  return emptyRuleChainParamsJson();
}

/** 从 definition JSON 读取 ruleChain.configuration.devpilot（若存在） */
export function parseDevPilotFromDefinition(definition: string): {
  description: string;
  requestMetadataParamsJson: string;
  requestMessageBodyParamsJson: string;
  responseMessageBodyParamsJson: string;
  editorJson: string;
  skillDirName: string;
} | null {
  const def = definition?.trim();
  if (!def) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(def);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const chain = (parsed as { ruleChain?: unknown }).ruleChain;
  if (!chain || typeof chain !== "object" || Array.isArray(chain)) return null;
  const configuration = (chain as { configuration?: unknown }).configuration;
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return null;
  const devpilot = (configuration as { devpilot?: unknown }).devpilot;
  if (!devpilot || typeof devpilot !== "object" || Array.isArray(devpilot)) return null;
  const dp = devpilot as {
    description?: unknown;
    io?: unknown;
    editor?: unknown;
    skill?: unknown;
  };
  const io = dp.io && typeof dp.io === "object" && !Array.isArray(dp.io) ? (dp.io as Record<string, unknown>) : {};
  const editor =
    dp.editor && typeof dp.editor === "object" && !Array.isArray(dp.editor)
      ? (dp.editor as Record<string, unknown>)
      : {};
  const skill =
    dp.skill && typeof dp.skill === "object" && !Array.isArray(dp.skill)
      ? (dp.skill as Record<string, unknown>)
      : {};
  const scratch = asString(editor.scratch_json);
  return {
    description: asString(dp.description),
    requestMetadataParamsJson: parseParamsArrayFromIO(io.request_metadata_params),
    requestMessageBodyParamsJson: parseParamsArrayFromIO(io.request_message_body_params),
    responseMessageBodyParamsJson: parseParamsArrayFromIO(io.response_message_body_params),
    editorJson: scratch,
    skillDirName: asString(skill.dir_name),
  };
}

function paramsJsonStringToArray(s: string): unknown[] {
  const t = s?.trim() || "[]";
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** 将三套参数字符串解析为可写入 DSL 的数组（保持 JSON 数组元素原样） */
export function paramsJsonStringsToIOArrays(
  requestMetadataParamsJson: string,
  requestMessageBodyParamsJson: string,
  responseMessageBodyParamsJson: string
): DevPilotIOArrays {
  return {
    request_metadata_params: paramsJsonStringToArray(requestMetadataParamsJson),
    request_message_body_params: paramsJsonStringToArray(requestMessageBodyParamsJson),
    response_message_body_params: paramsJsonStringToArray(responseMessageBodyParamsJson),
  };
}

export type BuildDevPilotConfigurationInput = {
  description: string;
  requestMetadataParamsJson: string;
  requestMessageBodyParamsJson: string;
  responseMessageBodyParamsJson: string;
  editorScratchJson: string;
  skillDirName?: string;
};

/** 生成写入 ruleChain.configuration 的对象（含 devpilot 与其它 configuration 合并） */
export function buildRuleChainConfigurationWithDevPilot(
  existingConfiguration: Record<string, unknown> | undefined,
  input: BuildDevPilotConfigurationInput
): Record<string, unknown> {
  const base =
    existingConfiguration && typeof existingConfiguration === "object" && !Array.isArray(existingConfiguration)
      ? { ...existingConfiguration }
      : {};
  const io = paramsJsonStringsToIOArrays(
    input.requestMetadataParamsJson,
    input.requestMessageBodyParamsJson,
    input.responseMessageBodyParamsJson
  );
  base.devpilot = {
    schema_version: DEVPILOT_DSL_SCHEMA_VERSION,
    description: String(input.description ?? "").trim(),
    io,
    editor: {
      scratch_json: String(input.editorScratchJson ?? "").trim(),
    },
    skill: {
      dir_name: String(input.skillDirName ?? "").trim(),
    },
  };
  return base;
}

/** 从 DSL 读取 devpilot.skill.dir_name */
export function getSkillDirNameFromDefinition(definition: string): string {
  return parseDevPilotFromDefinition(definition)?.skillDirName?.trim() ?? "";
}

/** 在保留 metadata 等的前提下，把 devpilot 写入 definition（供表单仅改 flags 时使用） */
export function mergeDevPilotIntoDefinitionString(
  definition: string,
  input: BuildDevPilotConfigurationInput
): string {
  const def = definition?.trim();
  if (!def) return def;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(def) as Record<string, unknown>;
  } catch {
    return definition;
  }
  if (!parsed || typeof parsed !== "object") return definition;
  const ruleChain = (parsed.ruleChain ?? {}) as Record<string, unknown>;
  const existingCfg = ruleChain.configuration as Record<string, unknown> | undefined;
  ruleChain.configuration = buildRuleChainConfigurationWithDevPilot(existingCfg, input);
  parsed.ruleChain = ruleChain;
  return JSON.stringify(parsed, null, 2);
}
