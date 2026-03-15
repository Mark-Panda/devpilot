import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as ScratchBlocks from "scratch-blocks";
import type { WorkspaceSvg, Block, BlockSvg } from "blockly/core";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useRuleGoRules } from "./useRuleGoRules";

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (workerId: string, label: string) => Worker;
  };
};

if (!monacoGlobal.MonacoEnvironment) {
  monacoGlobal.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };
}

const scratchTheme = new ScratchBlocks.Theme(
  "scratch",
  {
    rulego_nodes: {
      colourPrimary: "#6366f1",
      colourSecondary: "#a5b4fc",
      colourTertiary: "#c7d2fe",
    },
    rulego_routes: {
      colourPrimary: "#f59e0b",
      colourSecondary: "#fcd34d",
      colourTertiary: "#fde68a",
    },
    rulego_data: {
      colourPrimary: "#10b981",
      colourSecondary: "#6ee7b7",
      colourTertiary: "#a7f3d0",
    },
    rulego_endpoints: {
      colourPrimary: "#0ea5e9",
      colourSecondary: "#7dd3fc",
      colourTertiary: "#bae6fd",
    },
    rulego_routers: {
      colourPrimary: "#ec4899",
      colourSecondary: "#f9a8d4",
      colourTertiary: "#fbcfe8",
    },
  },
  {
    rulego_nodes: {
      colour: "#6366f1",
    },
    rulego_routes: {
      colour: "#f59e0b",
    },
    rulego_data: {
      colour: "#10b981",
    },
    rulego_endpoints: {
      colour: "#0ea5e9",
    },
    rulego_routers: {
      colour: "#ec4899",
    },
  }
);

ScratchBlocks.ScratchMsgs?.setLocale?.("zh-cn");

const toolbox = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "规则链节点",
      categorystyle: "rulego_nodes",
      contents: [
        { kind: "block", type: "rulego_jsFilter" },
        { kind: "block", type: "rulego_jsTransform" },
        { kind: "block", type: "rulego_jsSwitch" },
        { kind: "block", type: "rulego_restApiCall" },
      ],
    },
    {
      kind: "category",
      name: "条件与路由",
      categorystyle: "rulego_routes",
      contents: [
        { kind: "block", type: "rulego_switch" },
        { kind: "block", type: "rulego_break" },
        { kind: "block", type: "rulego_join" },
      ],
    },
    {
      kind: "category",
      name: "数据处理",
      categorystyle: "rulego_data",
      contents: [
        { kind: "block", type: "rulego_for" },
        { kind: "block", type: "rulego_groupAction" },
      ],
    },
    {
      kind: "category",
      name: "Endpoints",
      categorystyle: "rulego_endpoints",
      contents: [
        { kind: "block", type: "rulego_endpoint" },
      ],
    },
    {
      kind: "category",
      name: "Routers",
      categorystyle: "rulego_routers",
      contents: [
        { kind: "block", type: "rulego_router" },
      ],
    },
  ],
};

export default function RuleGoScratchEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rules, create, update } = useRuleGoRules();
  const workspaceRef = useRef<WorkspaceSvg | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dslEditorContainerRef = useRef<HTMLDivElement | null>(null);
  const dslEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const syncingDslRef = useRef(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [dsl, setDsl] = useState("");
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editingRule = useMemo(() => rules.find((rule) => rule.id === id), [rules, id]);

  useEffect(() => {
    if (!dslEditorContainerRef.current || dslEditorRef.current) return;

    const editor = monaco.editor.create(dslEditorContainerRef.current, {
      value: dsl,
      language: "plaintext",
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
    });

    dslEditorRef.current = editor;

    const subscription = editor.onDidChangeModelContent(() => {
      if (syncingDslRef.current) return;
      setDsl(editor.getValue());
    });

    return () => {
      subscription.dispose();
      editor.dispose();
      dslEditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!dslEditorRef.current) return;
    const editor = dslEditorRef.current;
    const currentValue = editor.getValue();
    if (currentValue === dsl) return;
    syncingDslRef.current = true;
    editor.setValue(dsl);
    syncingDslRef.current = false;
  }, [dsl]);

  useEffect(() => {
    if (!containerRef.current || workspaceRef.current) return;

    const buildNodeJson = (options: {
      label: string;
      defaultId: string;
      defaultName: string;
      script?: string;
      category: "rulego_nodes" | "rulego_routes" | "rulego_data" | "rulego_endpoints" | "rulego_routers";
      extraFields?: Array<Record<string, unknown>>;
    }) => {
      const args0 = [
        { type: "field_input", name: "NODE_ID", text: options.defaultId },
        { type: "field_input", name: "NODE_NAME", text: options.defaultName },
      ] as Array<Record<string, unknown>>;

      if (options.script) {
        args0.push({ type: "field_input", name: "JS_SCRIPT", text: options.script });
      }

      if (options.extraFields?.length) {
        args0.push(...options.extraFields);
      }

      args0.push({ type: "field_checkbox", name: "DEBUG", checked: true });
      args0.push({
        type: "field_dropdown",
        name: "LINK_TYPE",
        options: [
          ["Success", "Success"],
          ["Failure", "Failure"],
          ["True", "True"],
          ["False", "False"],
        ],
      });
      args0.push({ type: "field_input", name: "LINK_LABEL", text: "" });

      const baseIndex = 2;
      const scriptIndex = options.script ? baseIndex + 1 : null;
      const extraStartIndex = baseIndex + (options.script ? 1 : 0) + 1;
      const debugIndex = baseIndex + (options.script ? 1 : 0) + (options.extraFields?.length ?? 0) + 1;
      const linkTypeIndex = debugIndex + 1;
      const linkLabelIndex = debugIndex + 2;

      const suffix = options.script ? ` 脚本 %${scriptIndex}` : "";
      const extraSuffix = options.extraFields
        ? options.extraFields.map((field, index) => ` ${String(field.name)} %${extraStartIndex + index}`).join("")
        : "";

      return {
        message0: `${options.label} %1 名称 %2${suffix}${extraSuffix} 调试 %${debugIndex} 关系 %${linkTypeIndex} 标签 %${linkLabelIndex}`,
        args0,
        previousStatement: null,
        nextStatement: null,
        extensions: ["shape_statement"],
        style: options.category,
      };
    };

    ScratchBlocks.Blocks.rulego_jsFilter = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "jsFilter",
            defaultId: "s1",
            defaultName: "Filter",
            script: "return msg!='bb';",
            category: "rulego_nodes",
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_jsTransform = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "jsTransform",
            defaultId: "s2",
            defaultName: "Transform",
            script:
              "metadata['test']='test02';\nmetadata['index']=50;\nmsgType='TEST_MSG_TYPE2';\nvar msg2=JSON.parse(msg);\nmsg2['aa']=66;\nreturn {'msg':msg2,'metadata':metadata,'msgType':msgType};",
            category: "rulego_nodes",
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_jsSwitch = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "jsSwitch",
            defaultId: "s3",
            defaultName: "Switch",
            script: "return msgType;",
            category: "rulego_nodes",
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_switch = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "switch",
            defaultId: "sw1",
            defaultName: "Switch",
            category: "rulego_routes",
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_break = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "break",
            defaultId: "br1",
            defaultName: "Break",
            category: "rulego_routes",
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_join = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "join",
            defaultId: "jn1",
            defaultName: "Join",
            category: "rulego_routes",
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_for = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "for",
            defaultId: "for1",
            defaultName: "For",
            category: "rulego_data",
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_groupAction = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "groupAction",
            defaultId: "grp1",
            defaultName: "Group",
            category: "rulego_data",
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_restApiCall = {
      init: function (this: Block) {
        this.jsonInit(
          buildNodeJson({
            label: "restApiCall",
            defaultId: "rest1",
            defaultName: "Rest API",
            category: "rulego_nodes",
            extraFields: [
              { type: "field_input", name: "REST_URL", text: "http://localhost:9099/api" },
              {
                type: "field_dropdown",
                name: "REST_METHOD",
                options: [
                  ["GET", "GET"],
                  ["POST", "POST"],
                  ["PUT", "PUT"],
                  ["DELETE", "DELETE"],
                ],
              },
              { type: "field_input", name: "REST_HEADERS", text: "{}" },
              { type: "field_input", name: "REST_QUERY", text: "{}" },
              { type: "field_input", name: "REST_BODY", text: "" },
              { type: "field_input", name: "REST_TIMEOUT", text: "30000" },
              { type: "field_input", name: "REST_MAX_PARALLEL", text: "200" },
            ],
          })
        );
      },
    };

    ScratchBlocks.Blocks.rulego_endpoint = {
      init: function (this: Block) {
        this.jsonInit({
          message0: "endpoint %1 名称 %2 协议 %3 处理器 %4 路由 %5",
          args0: [
            { type: "field_input", name: "NODE_ID", text: "ep1" },
            { type: "field_input", name: "NODE_NAME", text: "Endpoint" },
            { type: "field_input", name: "EP_PROTOCOL", text: "http" },
            { type: "field_input", name: "EP_PROCESSORS", text: "[]" },
            { type: "input_statement", name: "ROUTERS" },
          ],
          previousStatement: null,
          nextStatement: null,
          style: "rulego_endpoints",
          extensions: ["shape_statement"],
        });
      },
    };

    ScratchBlocks.Blocks.rulego_router = {
      init: function (this: Block) {
        this.jsonInit({
          message0: "router %1 名称 %2 路径 %3 方法 %4 处理器 %5",
          args0: [
            { type: "field_input", name: "NODE_ID", text: "rt1" },
            { type: "field_input", name: "NODE_NAME", text: "Router" },
            { type: "field_input", name: "ROUTER_PATH", text: "/api" },
            {
              type: "field_dropdown",
              name: "ROUTER_METHOD",
              options: [
                ["GET", "GET"],
                ["POST", "POST"],
                ["PUT", "PUT"],
                ["DELETE", "DELETE"],
              ],
            },
            { type: "field_input", name: "ROUTER_PROCESSORS", text: "[]" },
          ],
          previousStatement: null,
          nextStatement: null,
          style: "rulego_routers",
          extensions: ["shape_statement"],
        });
      },
    };

    const workspace = ScratchBlocks.inject(containerRef.current, {
      toolbox,
      media: "/scratch-blocks/",
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
      trashcan: true,
      grid: { spacing: 20, length: 3, colour: "#e2e8f0", snap: true },
    }) as WorkspaceSvg;

    workspaceRef.current = workspace;

    const initialState = ScratchBlocks.serialization.workspaces.save(workspace);
    setJson(JSON.stringify(initialState, null, 2));
    setDsl(buildRuleGoDsl(workspace));

    const handleChange = () => {
      const state = ScratchBlocks.serialization.workspaces.save(workspace);
      setJson(JSON.stringify(state, null, 2));
      const nextDsl = buildRuleGoDsl(workspace);
      setDsl(nextDsl);
    };

    workspace.addChangeListener(handleChange);

    return () => {
      workspace.removeChangeListener(handleChange);
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!workspaceRef.current) return;
    if (!editingRule) return;

    setName(editingRule.name);
    setDescription(editingRule.description);
    setEnabled(editingRule.enabled);
    setDsl(editingRule.definition);
    setJson(editingRule.editorJson);

    if (editingRule.editorJson) {
      try {
        const state = JSON.parse(editingRule.editorJson);
        ScratchBlocks.serialization.workspaces.load(state, workspaceRef.current, { recordUndo: false });
        setDsl(buildRuleGoDsl(workspaceRef.current));
        return;
      } catch {
        // ignore malformed json
      }
    }

    if (editingRule.definition) {
      try {
        const ruleDsl = JSON.parse(editingRule.definition);
        loadWorkspaceFromRuleGoDsl(ruleDsl, workspaceRef.current);
        setDsl(buildRuleGoDsl(workspaceRef.current));
      } catch (err) {
        setError((err as Error).message || "RuleGo DSL 解析失败");
      }
    }
  }, [editingRule]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("规则名称不能为空");
      return;
    }
    if (!dsl.trim()) {
      setError("RuleGo DSL 不能为空");
      return;
    }
    if (!json.trim()) {
      setError("Scratch JSON 不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingRule) {
        await update(editingRule.id, {
          name: name.trim(),
          description: description.trim(),
          enabled,
          definition: dsl.trim(),
          editorJson: json.trim(),
        });
      } else {
        await create({
          name: name.trim(),
          description: description.trim(),
          enabled,
          definition: dsl.trim(),
          editorJson: json.trim(),
        });
      }
      navigate("/rulego");
    } catch (err) {
      setError((err as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const getFieldValue = (block: Block, name: string) => String(block.getFieldValue(name) ?? "").trim();

  const getBooleanField = (block: Block, name: string) => getFieldValue(block, name) === "TRUE";

  const getNodeType = (blockType: string) => {
    switch (blockType) {
      case "rulego_jsFilter":
        return "jsFilter";
      case "rulego_jsTransform":
        return "jsTransform";
      case "rulego_jsSwitch":
        return "jsSwitch";
      case "rulego_switch":
        return "switch";
      case "rulego_break":
        return "break";
      case "rulego_join":
        return "join";
      case "rulego_for":
        return "for";
      case "rulego_groupAction":
        return "groupAction";
      case "rulego_restApiCall":
        return "restApiCall";
      case "rulego_endpoint":
        return "endpoint";
      case "rulego_router":
        return "router";
      default:
        return "";
    }
  };

  const getDefaultConnectionType = (blockType: string) => {
    if (blockType === "rulego_jsFilter") return "True";
    return "Success";
  };

  const buildRuleGoNode = (block: Block) => {
    const nodeType = getNodeType(block.type);
    if (!nodeType) return null;
    const nodeId = getFieldValue(block, "NODE_ID") || block.id;
    const nodeName = getFieldValue(block, "NODE_NAME") || nodeType;
    const debugMode = getBooleanField(block, "DEBUG");

    const configuration: Record<string, unknown> = {};
    if (block.type === "rulego_jsFilter" || block.type === "rulego_jsTransform" || block.type === "rulego_jsSwitch") {
      configuration.jsScript = getFieldValue(block, "JS_SCRIPT");
    }

    if (block.type === "rulego_restApiCall") {
      configuration.restEndpointUrlPattern = getFieldValue(block, "REST_URL");
      configuration.requestMethod = getFieldValue(block, "REST_METHOD");
      configuration.maxParallelRequestsCount = Number(getFieldValue(block, "REST_MAX_PARALLEL") || "0");
      configuration.headers = parseJsonValue(getFieldValue(block, "REST_HEADERS"), {});
      configuration.query = parseJsonValue(getFieldValue(block, "REST_QUERY"), {});
      configuration.body = getFieldValue(block, "REST_BODY");
      configuration.timeout = Number(getFieldValue(block, "REST_TIMEOUT") || "0");
    }

    return {
      id: nodeId,
      type: nodeType,
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
    const typeToBlock: Record<string, string> = {
      jsFilter: "rulego_jsFilter",
      jsTransform: "rulego_jsTransform",
      jsSwitch: "rulego_jsSwitch",
      restApiCall: "rulego_restApiCall",
      switch: "rulego_switch",
      break: "rulego_break",
      join: "rulego_join",
      for: "rulego_for",
      groupAction: "rulego_groupAction",
      endpoint: "rulego_endpoint",
      router: "rulego_router",
    };

    const blockType = typeToBlock[node.type];
    if (!blockType) {
      throw new Error(`不支持的组件类型: ${node.type}`);
    }

    const block = workspace.newBlock(blockType) as BlockSvg;
    block.setFieldValue(node.id, "NODE_ID");
    block.setFieldValue(node.name || node.type, "NODE_NAME");
    block.setFieldValue(node.debugMode ? "TRUE" : "FALSE", "DEBUG");

    if (node.type === "jsFilter" || node.type === "jsTransform" || node.type === "jsSwitch") {
      const script = String(node.configuration?.jsScript ?? "");
      block.setFieldValue(script, "JS_SCRIPT");
    }

    if (node.type === "restApiCall") {
      block.setFieldValue(String(node.configuration?.restEndpointUrlPattern ?? ""), "REST_URL");
      block.setFieldValue(String(node.configuration?.requestMethod ?? "POST"), "REST_METHOD");
      block.setFieldValue(String(node.configuration?.maxParallelRequestsCount ?? 0), "REST_MAX_PARALLEL");
      block.setFieldValue(JSON.stringify(node.configuration?.headers ?? {}), "REST_HEADERS");
      block.setFieldValue(JSON.stringify(node.configuration?.query ?? {}), "REST_QUERY");
      block.setFieldValue(String(node.configuration?.body ?? ""), "REST_BODY");
      block.setFieldValue(String(node.configuration?.timeout ?? 30000), "REST_TIMEOUT");
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
    const endpoints = (ruleDsl.metadata.endpoints ?? []) as Array<any>;

    workspace.clear();

    const nodeMap = new Map<string, BlockSvg>();

    nodes.forEach((node) => {
      const block = createBlockForNode(workspace, node);
      nodeMap.set(String(node.id), block);
    });

    endpoints.forEach((endpoint) => {
      const block = createBlockForNode(workspace, endpoint);
      nodeMap.set(String(endpoint.id), block);

      const routers = (endpoint.routers ?? []) as Array<any>;
      let previousRouter: BlockSvg | null = null;
      routers.forEach((router) => {
        const routerBlock = createBlockForNode(workspace, {
          id: String(router.id ?? "router"),
          type: "router",
          name: String(router.name ?? "Router"),
          debugMode: false,
          configuration: router.configuration ?? {},
          additionalInfo: router.additionalInfo ?? {},
        });

        const previousConnection = previousRouter?.nextConnection as unknown as ScratchBlocks.Connection | null;
        const routerConnection = routerBlock.previousConnection as unknown as ScratchBlocks.Connection | null;
        if (previousConnection && routerConnection) {
          previousConnection.connect(routerConnection);
        }
        previousRouter = routerBlock;
      });

      if (previousRouter) {
        const input = block.getInput("ROUTERS");
        const previousConnection = previousRouter.previousConnection as unknown as ScratchBlocks.Connection | null;
        if (input?.connection && previousConnection) {
          input.connection.connect(previousConnection);
        }
      }
    });

    connections.forEach((connection) => {
      const fromBlock = nodeMap.get(String(connection.fromId));
      const toBlock = nodeMap.get(String(connection.toId));
      if (fromBlock && toBlock && fromBlock.nextConnection && toBlock.previousConnection) {
        fromBlock.setFieldValue(String(connection.type ?? "Success"), "LINK_TYPE");
        if (connection.label) {
          fromBlock.setFieldValue(String(connection.label), "LINK_LABEL");
        }
        fromBlock.nextConnection.connect(toBlock.previousConnection);
      }
    });

    workspace.refreshTheme();
  };

  const parseJsonValue = (value: string, fallback: unknown) => {
    if (!value.trim()) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const buildRuleGoDsl = (workspace: WorkspaceSvg) => {
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
    const endpoints: Array<Record<string, unknown>> = [];
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

    const addEndpoint = (block: Block) => {
      if (seen.has(block.id)) return;
      const position = block.getRelativeToSurfaceXY();
      const endpointId = getFieldValue(block, "NODE_ID") || block.id;
      const endpointName = getFieldValue(block, "NODE_NAME") || "Endpoint";
      const endpoint = {
        id: endpointId,
        type: getNodeType(block.type) || "endpoint",
        name: endpointName,
        debugMode: getBooleanField(block, "DEBUG"),
        configuration: {
          protocol: getFieldValue(block, "EP_PROTOCOL"),
        },
        processors: parseJsonValue(getFieldValue(block, "EP_PROCESSORS"), []),
        routers: [] as Array<Record<string, unknown>>,
        additionalInfo: {
          blockId: block.id,
          position: {
            x: position.x,
            y: position.y,
          },
        },
      };

      let routerBlock = block.getInputTargetBlock("ROUTERS");
      while (routerBlock) {
        if (routerBlock.type !== "rulego_router") {
          routerBlock = routerBlock.getNextBlock();
          continue;
        }
        endpoint.routers.push({
          id: getFieldValue(routerBlock, "NODE_ID") || routerBlock.id,
          name: getFieldValue(routerBlock, "NODE_NAME") || "Router",
          configuration: {
            path: getFieldValue(routerBlock, "ROUTER_PATH"),
            method: getFieldValue(routerBlock, "ROUTER_METHOD"),
          },
          processors: parseJsonValue(getFieldValue(routerBlock, "ROUTER_PROCESSORS"), []),
        });
        routerBlock = routerBlock.getNextBlock();
      }

      endpoints.push(endpoint);
      seen.add(block.id);
    };

    const walkChain = (block: Block | null) => {
      let current = block;
      while (current) {
        if (current.type === "rulego_endpoint") {
          addEndpoint(current);
          current = current.getNextBlock();
          continue;
        }
        addNode(current);
        const next = current.getNextBlock();
        if (next) {
          if (next.type === "rulego_endpoint") {
            addEndpoint(next);
          } else {
            addNode(next);
          }
          const fromId = getFieldValue(current, "NODE_ID") || current.id;
          const toId = getFieldValue(next, "NODE_ID") || next.id;
          const linkType = getFieldValue(current, "LINK_TYPE") || getDefaultConnectionType(current.type);
          const label = getFieldValue(current, "LINK_LABEL");
          connections.push(label ? { fromId, toId, type: linkType, label } : { fromId, toId, type: linkType });
        }
        current = next;
      }
    };

    topBlocks.forEach((block) => walkChain(block));

    const ruleChainId = editingRule?.id ?? id ?? "rule01";
    const ruleChainName = name.trim() || "Rule Chain";

    return JSON.stringify(
      {
        ruleChain: {
          id: ruleChainId,
          name: ruleChainName,
          debugMode: false,
          root: true,
          disabled: !enabled,
          configuration: {},
          additionalInfo: {},
        },
        metadata: {
          firstNodeIndex: 0,
          nodes,
          connections,
          ruleChainConnections: [],
          endpoints,
        },
      },
      null,
      2
    );
  };

  return (
    <div className="rulego-editor">
      <div className="rulego-editor-header">
        <div>
          <h2>{editingRule ? "编辑 RuleGo 规则" : "新增 RuleGo 规则"}</h2>
          <p className="page-subtitle">可视化构建 Scratch 规则并保存 DSL</p>
        </div>
        <div className="page-actions">
          <button className="text-button" type="button" onClick={() => navigate("/rulego")}>
            返回列表
          </button>
          <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
            保存
          </button>
        </div>
      </div>

      <div className="rulego-editor-layout">
        <div className="rulego-editor-canvas" ref={containerRef} />
        <div className="rulego-editor-side">
          <label className="form-field">
            <span>规则名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="form-field">
            <span>规则描述</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="form-field">
            <span>RuleGo DSL</span>
            <div className="rulego-dsl-editor" ref={dslEditorContainerRef} />
          </label>
          <label className="form-field">
            <span>Scratch JSON</span>
            <textarea value={json} onChange={(event) => setJson(event.target.value)} rows={10} readOnly />
          </label>
          <label className="form-field">
            <span>启用</span>
            <select value={enabled ? "true" : "false"} onChange={(event) => setEnabled(event.target.value === "true")}>
              <option value="true">启用</option>
              <option value="false">停用</option>
            </select>
          </label>
          {error ? <div className="form-error">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
