/**
 * RuleGo 官方 Endpoint 触发器（metadata.endpoints），与引擎 DSL 一致。
 * 参考：https://github.com/rulego/rulego/tree/main/endpoint
 * 类型：endpoint/http、endpoint/ws、endpoint/mqtt、endpoint/schedule、endpoint/net
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const category = "rulego_trigger" as const;

function boolDropdown(BlocklyF: unknown) {
  return new (BlocklyF as any).FieldDropdown([
    ["否", "FALSE"],
    ["是", "TRUE"],
  ]);
}

function splitProcessors(s: string): string[] | undefined {
  const a = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return a.length ? a : undefined;
}

function parseExtraRouters(helpers: BlockHelpers, block: Block): unknown[] {
  const raw = helpers.getFieldValue(block, "EP_EXTRA_ROUTERS_JSON").trim();
  if (!raw) return [];
  try {
    const v = helpers.parseJsonValue(raw, []) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function buildAdditionalInfo(block: Block): Record<string, unknown> | undefined {
  const pos = block.getRelativeToSurfaceXY();
  if (typeof pos?.x !== "number" || typeof pos?.y !== "number") return undefined;
  return { position: { x: pos.x, y: pos.y } };
}

function applyRouterToFields(
  block: Block,
  r: Record<string, unknown> | undefined,
  defaults: { path: string; to: string; method?: string }
) {
  const from = (r?.from ?? {}) as { path?: string; processors?: string[] };
  const to = (r?.to ?? {}) as { path?: string; wait?: boolean; processors?: string[] };
  const params = r?.params as unknown[] | undefined;
  block.setFieldValue(String(from.path ?? defaults.path), "RT_PATH");
  block.setFieldValue(String(to.path ?? defaults.to), "RT_TO");
  if (block.getField("RT_METHOD")) {
    const m = params?.[0];
    block.setFieldValue(m != null ? String(m) : defaults.method ?? "POST", "RT_METHOD");
  }
  if (block.getField("RT_WAIT")) {
    block.setFieldValue(to.wait ? "TRUE" : "FALSE", "RT_WAIT");
  }
  if (block.getField("RT_TO_PROCESSORS")) {
    block.setFieldValue(Array.isArray(to.processors) ? to.processors.join(", ") : "", "RT_TO_PROCESSORS");
  }
  if (block.getField("RT_FROM_PROCESSORS")) {
    block.setFieldValue(Array.isArray(from.processors) ? from.processors.join(", ") : "", "RT_FROM_PROCESSORS");
  }
  if (block.getField("RT_ID")) {
    block.setFieldValue(String(r?.id ?? ""), "RT_ID");
  }
}

// --- HTTP endpoint/http ---
const httpBlockType = "rulego_endpoint_http";
const httpDef: BlockTypeDef = {
  blockType: httpBlockType,
  nodeType: "endpoint/http",
  category,
  metadataEndpoint: true,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[httpBlockType] = {
      init: function (this: Block) {
        (this as Block)
          .appendDummyInput("HEAD")
          .appendField(new (BlocklyF as any).FieldTextInput("HTTP 端点"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("http_ep1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "EP_EXTRA_ROUTERS_JSON");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "RT_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(":9090"), "EP_SERVER");
        config.appendField(boolDropdown(BlocklyF), "EP_ALLOW_CORS");
        config.appendField(new (BlocklyF as any).FieldTextInput("POST"), "RT_METHOD");
        config.appendField(new (BlocklyF as any).FieldTextInput("/api/v1/hook"), "RT_PATH");
        config.appendField(new (BlocklyF as any).FieldTextInput("chain:default"), "RT_TO");
        config.appendField(boolDropdown(BlocklyF), "RT_WAIT");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "RT_TO_PROCESSORS");
        if (config.setVisible) config.setVisible(false);
        (this as Block).setPreviousStatement(false);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration() {
    return {};
  },
  getConnectionBranches() {
    return null;
  },
  getWalkInputs() {
    return null;
  },
  defaultConnectionType: "Success",
  getEndpointDsl(block, helpers) {
    const id = helpers.getFieldValue(block, "NODE_ID") || block.id;
    const name = helpers.getFieldValue(block, "NODE_NAME") || "HTTP 端点";
    const server = helpers.getFieldValue(block, "EP_SERVER") || ":9090";
    const configuration: Record<string, unknown> = { server };
    if (helpers.getBooleanField(block, "EP_ALLOW_CORS")) configuration.allowCors = true;
    const method = helpers.getFieldValue(block, "RT_METHOD") || "POST";
    const path = helpers.getFieldValue(block, "RT_PATH") || "/";
    const toPath = helpers.getFieldValue(block, "RT_TO");
    const wait = helpers.getBooleanField(block, "RT_WAIT");
    const toProcessors = splitProcessors(helpers.getFieldValue(block, "RT_TO_PROCESSORS"));
    const routerId =
      helpers.getFieldValue(block, "RT_ID").trim() ||
      path.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") ||
      "r1";
    const mainRouter: Record<string, unknown> = {
      id: routerId,
      params: [method],
      from: { path, configuration: {} },
      to: {
        path: toPath,
        wait,
        ...(toProcessors ? { processors: toProcessors } : {}),
      },
    };
    const extra = parseExtraRouters(helpers, block);
    const routers = [mainRouter, ...extra];
    const out: Record<string, unknown> = {
      id,
      type: "endpoint/http",
      name,
      configuration,
      routers,
    };
    const ai = buildAdditionalInfo(block);
    if (ai) out.additionalInfo = ai;
    return out;
  },
  setEndpointDsl(block, ep, helpers) {
    const id = String(ep.id ?? "").trim();
    const name = String(ep.name ?? "").trim();
    if (id) block.setFieldValue(id, "NODE_ID");
    if (name) block.setFieldValue(name, "NODE_NAME");
    const cfg = (ep.configuration ?? {}) as Record<string, unknown>;
    block.setFieldValue(String(cfg.server ?? ":9090"), "EP_SERVER");
    block.setFieldValue(cfg.allowCors ? "TRUE" : "FALSE", "EP_ALLOW_CORS");
    const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
    if (routers.length > 0) {
      applyRouterToFields(block, routers[0], { path: "/api/v1/hook", to: "chain:default", method: "POST" });
    }
    if (routers.length > 1) {
      block.setFieldValue(JSON.stringify(routers.slice(1), null, 2), "EP_EXTRA_ROUTERS_JSON");
    } else {
      block.setFieldValue("", "EP_EXTRA_ROUTERS_JSON");
    }
    void helpers;
  },
};
registerBlockType(httpDef);

// --- WebSocket endpoint/ws ---
const wsBlockType = "rulego_endpoint_ws";
const wsDef: BlockTypeDef = {
  blockType: wsBlockType,
  nodeType: "endpoint/ws",
  category,
  metadataEndpoint: true,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[wsBlockType] = {
      init: function (this: Block) {
        (this as Block)
          .appendDummyInput("HEAD")
          .appendField(new (BlocklyF as any).FieldTextInput("WebSocket 端点"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("ws_ep1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "EP_EXTRA_ROUTERS_JSON");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "RT_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(":9090"), "EP_SERVER");
        config.appendField(new (BlocklyF as any).FieldTextInput("GET"), "RT_METHOD");
        config.appendField(new (BlocklyF as any).FieldTextInput("/ws"), "RT_PATH");
        config.appendField(new (BlocklyF as any).FieldTextInput("chain:default"), "RT_TO");
        config.appendField(boolDropdown(BlocklyF), "RT_WAIT");
        if (config.setVisible) config.setVisible(false);
        (this as Block).setPreviousStatement(false);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration() {
    return {};
  },
  getConnectionBranches() {
    return null;
  },
  getWalkInputs() {
    return null;
  },
  defaultConnectionType: "Success",
  getEndpointDsl(block, helpers) {
    const id = helpers.getFieldValue(block, "NODE_ID") || block.id;
    const name = helpers.getFieldValue(block, "NODE_NAME") || "WebSocket 端点";
    const server = helpers.getFieldValue(block, "EP_SERVER") || ":9090";
    const param = helpers.getFieldValue(block, "RT_METHOD") || "GET";
    const path = helpers.getFieldValue(block, "RT_PATH") || "/ws";
    const toPath = helpers.getFieldValue(block, "RT_TO");
    const wait = helpers.getBooleanField(block, "RT_WAIT");
    const routerId =
      helpers.getFieldValue(block, "RT_ID").trim() ||
      path.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") ||
      "r1";
    const mainRouter: Record<string, unknown> = {
      id: routerId,
      params: [param],
      from: { path, configuration: {} },
      to: { path: toPath, wait },
    };
    const extra = parseExtraRouters(helpers, block);
    const out: Record<string, unknown> = {
      id,
      type: "endpoint/ws",
      name,
      configuration: { server },
      routers: [mainRouter, ...extra],
    };
    const ai = buildAdditionalInfo(block);
    if (ai) out.additionalInfo = ai;
    return out;
  },
  setEndpointDsl(block, ep, helpers) {
    const id = String(ep.id ?? "").trim();
    const name = String(ep.name ?? "").trim();
    if (id) block.setFieldValue(id, "NODE_ID");
    if (name) block.setFieldValue(name, "NODE_NAME");
    const cfg = (ep.configuration ?? {}) as Record<string, unknown>;
    block.setFieldValue(String(cfg.server ?? ":9090"), "EP_SERVER");
    const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
    if (routers.length > 0) {
      applyRouterToFields(block, routers[0], { path: "/ws", to: "chain:default", method: "GET" });
    }
    if (routers.length > 1) {
      block.setFieldValue(JSON.stringify(routers.slice(1), null, 2), "EP_EXTRA_ROUTERS_JSON");
    } else {
      block.setFieldValue("", "EP_EXTRA_ROUTERS_JSON");
    }
    void helpers;
  },
};
registerBlockType(wsDef);

// --- MQTT endpoint/mqtt ---
const mqttBlockType = "rulego_endpoint_mqtt";
const mqttDef: BlockTypeDef = {
  blockType: mqttBlockType,
  nodeType: "endpoint/mqtt",
  category,
  metadataEndpoint: true,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[mqttBlockType] = {
      init: function (this: Block) {
        (this as Block)
          .appendDummyInput("HEAD")
          .appendField(new (BlocklyF as any).FieldTextInput("MQTT 端点"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("mqtt_ep1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "EP_EXTRA_ROUTERS_JSON");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "RT_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("127.0.0.1:1883"), "EP_SERVER");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "EP_USER");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "EP_PASS");
        config.appendField(new (BlocklyF as any).FieldTextInput("1"), "EP_QOS");
        config.appendField(new (BlocklyF as any).FieldTextInput("rulego_mqtt"), "EP_CLIENT_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("sensors/+/data"), "RT_PATH");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "RT_FROM_PROCESSORS");
        config.appendField(new (BlocklyF as any).FieldTextInput("chain:default"), "RT_TO");
        if (config.setVisible) config.setVisible(false);
        (this as Block).setPreviousStatement(false);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration() {
    return {};
  },
  getConnectionBranches() {
    return null;
  },
  getWalkInputs() {
    return null;
  },
  defaultConnectionType: "Success",
  getEndpointDsl(block, helpers) {
    const id = helpers.getFieldValue(block, "NODE_ID") || block.id;
    const name = helpers.getFieldValue(block, "NODE_NAME") || "MQTT 端点";
    const server = helpers.getFieldValue(block, "EP_SERVER") || "127.0.0.1:1883";
    const qos = parseInt(helpers.getFieldValue(block, "EP_QOS") || "1", 10);
    const configuration: Record<string, unknown> = {
      server,
      username: helpers.getFieldValue(block, "EP_USER"),
      password: helpers.getFieldValue(block, "EP_PASS"),
      qos: Number.isFinite(qos) ? qos : 1,
      clientId: helpers.getFieldValue(block, "EP_CLIENT_ID") || "rulego_mqtt",
    };
    const path = helpers.getFieldValue(block, "RT_PATH") || "sensors/+/data";
    const toPath = helpers.getFieldValue(block, "RT_TO");
    const fromProcessors = splitProcessors(helpers.getFieldValue(block, "RT_FROM_PROCESSORS"));
    const routerId = helpers.getFieldValue(block, "RT_ID").trim() || path.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || "r1";
    const from: Record<string, unknown> = { path, configuration: {} };
    if (fromProcessors) from.processors = fromProcessors;
    const mainRouter: Record<string, unknown> = {
      id: routerId,
      from,
      to: { path: toPath },
    };
    const extra = parseExtraRouters(helpers, block);
    const out: Record<string, unknown> = {
      id,
      type: "endpoint/mqtt",
      name,
      configuration,
      routers: [mainRouter, ...extra],
    };
    const ai = buildAdditionalInfo(block);
    if (ai) out.additionalInfo = ai;
    return out;
  },
  setEndpointDsl(block, ep, helpers) {
    const id = String(ep.id ?? "").trim();
    const name = String(ep.name ?? "").trim();
    if (id) block.setFieldValue(id, "NODE_ID");
    if (name) block.setFieldValue(name, "NODE_NAME");
    const cfg = (ep.configuration ?? {}) as Record<string, unknown>;
    block.setFieldValue(String(cfg.server ?? "127.0.0.1:1883"), "EP_SERVER");
    block.setFieldValue(String(cfg.username ?? ""), "EP_USER");
    block.setFieldValue(String(cfg.password ?? ""), "EP_PASS");
    block.setFieldValue(String(cfg.qos ?? "1"), "EP_QOS");
    block.setFieldValue(String(cfg.clientId ?? "rulego_mqtt"), "EP_CLIENT_ID");
    const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
    if (routers.length > 0) {
      const r0 = routers[0];
      block.setFieldValue(String(r0?.id ?? ""), "RT_ID");
      applyRouterToFields(block, r0, { path: "sensors/+/data", to: "chain:default" });
    }
    if (routers.length > 1) {
      block.setFieldValue(JSON.stringify(routers.slice(1), null, 2), "EP_EXTRA_ROUTERS_JSON");
    } else {
      block.setFieldValue("", "EP_EXTRA_ROUTERS_JSON");
    }
    void helpers;
  },
};
registerBlockType(mqttDef);

// --- Schedule endpoint/schedule ---
const scheduleBlockType = "rulego_endpoint_schedule";
const scheduleDef: BlockTypeDef = {
  blockType: scheduleBlockType,
  nodeType: "endpoint/schedule",
  category,
  metadataEndpoint: true,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[scheduleBlockType] = {
      init: function (this: Block) {
        (this as Block)
          .appendDummyInput("HEAD")
          .appendField(new (BlocklyF as any).FieldTextInput("定时端点"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("sched_ep1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "EP_EXTRA_ROUTERS_JSON");
        config.appendField(new (BlocklyF as any).FieldTextInput("*/1 * * * * *"), "RT_PATH");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "EP_PROCESSORS");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "RT_TO");
        if (config.setVisible) config.setVisible(false);
        (this as Block).setPreviousStatement(false);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration() {
    return {};
  },
  getConnectionBranches() {
    return null;
  },
  getWalkInputs() {
    return null;
  },
  defaultConnectionType: "Success",
  getEndpointDsl(block, helpers) {
    const id = helpers.getFieldValue(block, "NODE_ID") || block.id;
    const name = helpers.getFieldValue(block, "NODE_NAME") || "定时端点";
    const cron = helpers.getFieldValue(block, "RT_PATH") || "*/1 * * * * *";
    const epProcessors = splitProcessors(helpers.getFieldValue(block, "EP_PROCESSORS"));
    const toPath = helpers.getFieldValue(block, "RT_TO");
    const mainRouter: Record<string, unknown> = {
      from: { path: cron },
    };
    if (toPath) {
      (mainRouter as { to?: Record<string, unknown> }).to = { path: toPath };
    }
    const extra = parseExtraRouters(helpers, block);
    const out: Record<string, unknown> = {
      id,
      type: "endpoint/schedule",
      name,
      configuration: {},
      routers: [mainRouter, ...extra],
    };
    if (epProcessors) out.processors = epProcessors;
    const ai = buildAdditionalInfo(block);
    if (ai) out.additionalInfo = ai;
    return out;
  },
  setEndpointDsl(block, ep, helpers) {
    const id = String(ep.id ?? "").trim();
    const name = String(ep.name ?? "").trim();
    if (id) block.setFieldValue(id, "NODE_ID");
    if (name) block.setFieldValue(name, "NODE_NAME");
    const procs = ep.processors as string[] | undefined;
    block.setFieldValue(Array.isArray(procs) ? procs.join(", ") : "", "EP_PROCESSORS");
    const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
    if (routers.length > 0) {
      const from = (routers[0].from ?? {}) as { path?: string };
      block.setFieldValue(String(from.path ?? "*/1 * * * * *"), "RT_PATH");
      const to = (routers[0].to ?? {}) as { path?: string };
      block.setFieldValue(String(to.path ?? ""), "RT_TO");
    }
    if (routers.length > 1) {
      block.setFieldValue(JSON.stringify(routers.slice(1), null, 2), "EP_EXTRA_ROUTERS_JSON");
    } else {
      block.setFieldValue("", "EP_EXTRA_ROUTERS_JSON");
    }
    void helpers;
  },
};
registerBlockType(scheduleDef);

// --- TCP/UDP endpoint/net ---
const netBlockType = "rulego_endpoint_net";
const netDef: BlockTypeDef = {
  blockType: netBlockType,
  nodeType: "endpoint/net",
  category,
  metadataEndpoint: true,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[netBlockType] = {
      init: function (this: Block) {
        (this as Block)
          .appendDummyInput("HEAD")
          .appendField(new (BlocklyF as any).FieldTextInput("TCP/UDP 端点"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("net_ep1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "EP_EXTRA_ROUTERS_JSON");
        config.appendField(new (BlocklyF as any).FieldTextInput("tcp"), "EP_PROTOCOL");
        config.appendField(new (BlocklyF as any).FieldTextInput(":8888"), "EP_SERVER");
        config.appendField(new (BlocklyF as any).FieldTextInput(".*"), "RT_PATH");
        config.appendField(new (BlocklyF as any).FieldTextInput("chain:default"), "RT_TO");
        if (config.setVisible) config.setVisible(false);
        (this as Block).setPreviousStatement(false);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration() {
    return {};
  },
  getConnectionBranches() {
    return null;
  },
  getWalkInputs() {
    return null;
  },
  defaultConnectionType: "Success",
  getEndpointDsl(block, helpers) {
    const id = helpers.getFieldValue(block, "NODE_ID") || block.id;
    const name = helpers.getFieldValue(block, "NODE_NAME") || "TCP/UDP 端点";
    const protocol = helpers.getFieldValue(block, "EP_PROTOCOL") || "tcp";
    const server = helpers.getFieldValue(block, "EP_SERVER") || ":8888";
    const path = helpers.getFieldValue(block, "RT_PATH") || ".*";
    const toPath = helpers.getFieldValue(block, "RT_TO");
    const mainRouter: Record<string, unknown> = {
      from: { path, configuration: {} },
      to: { path: toPath },
    };
    const extra = parseExtraRouters(helpers, block);
    const out: Record<string, unknown> = {
      id,
      type: "endpoint/net",
      name,
      configuration: { protocol, server },
      routers: [mainRouter, ...extra],
    };
    const ai = buildAdditionalInfo(block);
    if (ai) out.additionalInfo = ai;
    return out;
  },
  setEndpointDsl(block, ep, helpers) {
    const id = String(ep.id ?? "").trim();
    const name = String(ep.name ?? "").trim();
    if (id) block.setFieldValue(id, "NODE_ID");
    if (name) block.setFieldValue(name, "NODE_NAME");
    const cfg = (ep.configuration ?? {}) as Record<string, unknown>;
    block.setFieldValue(String(cfg.protocol ?? "tcp"), "EP_PROTOCOL");
    block.setFieldValue(String(cfg.server ?? ":8888"), "EP_SERVER");
    const routers = (ep.routers ?? []) as Array<Record<string, unknown>>;
    if (routers.length > 0) {
      applyRouterToFields(block, routers[0], { path: ".*", to: "chain:default" });
    }
    if (routers.length > 1) {
      block.setFieldValue(JSON.stringify(routers.slice(1), null, 2), "EP_EXTRA_ROUTERS_JSON");
    } else {
      block.setFieldValue("", "EP_EXTRA_ROUTERS_JSON");
    }
    void helpers;
  },
};
registerBlockType(netDef);

/** DSL metadata.endpoints[].type → Blockly blockType（兼容简写 type） */
export const ENDPOINT_DSL_TYPE_TO_BLOCK: Record<string, string> = {
  "endpoint/http": "rulego_endpoint_http",
  http: "rulego_endpoint_http",
  "endpoint/ws": "rulego_endpoint_ws",
  websocket: "rulego_endpoint_ws",
  "endpoint/websocket": "rulego_endpoint_ws",
  "endpoint/mqtt": "rulego_endpoint_mqtt",
  mqtt: "rulego_endpoint_mqtt",
  "endpoint/schedule": "rulego_endpoint_schedule",
  schedule: "rulego_endpoint_schedule",
  "endpoint/net": "rulego_endpoint_net",
  net: "rulego_endpoint_net",
};

export function getBlockTypeForEndpointDslType(type: string): string {
  return ENDPOINT_DSL_TYPE_TO_BLOCK[type] ?? "";
}
