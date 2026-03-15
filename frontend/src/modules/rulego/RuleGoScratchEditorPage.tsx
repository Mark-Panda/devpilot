import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as ScratchBlocks from "scratch-blocks";
import type { WorkspaceSvg, Block } from "blockly/core";
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
    event: {
      colourPrimary: "#FF6680",
      colourSecondary: "#FF9FB1",
      colourTertiary: "#FF9FB1",
    },
    control: {
      colourPrimary: "#FFAB19",
      colourSecondary: "#FFD08A",
      colourTertiary: "#FFD08A",
    },
    operators: {
      colourPrimary: "#40BF4A",
      colourSecondary: "#7FE089",
      colourTertiary: "#7FE089",
    },
    data: {
      colourPrimary: "#FF8C1A",
      colourSecondary: "#FFB66D",
      colourTertiary: "#FFB66D",
    },
  },
  {
    event: {
      colour: "#FF6680",
    },
    control: {
      colour: "#FFAB19",
    },
    operators: {
      colour: "#40BF4A",
    },
    data: {
      colour: "#FF8C1A",
    },
  }
);

ScratchBlocks.ScratchMsgs?.setLocale?.("zh-cn");

const toolbox = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "事件",
      categorystyle: "event",
      iconURI: "/scratch-blocks/green-flag.svg",
      contents: [
        { kind: "block", type: "event_whenflagclicked" },
        { kind: "block", type: "event_whenbroadcastreceived" },
      ],
    },
    {
      kind: "category",
      name: "控制",
      categorystyle: "control",
      iconURI: "/scratch-blocks/icons/control_repeat.svg",
      contents: [
        { kind: "block", type: "control_repeat" },
        { kind: "block", type: "control_if" },
        { kind: "block", type: "control_if_else" },
      ],
    },
    {
      kind: "category",
      name: "运算",
      categorystyle: "operators",
      iconURI: "/scratch-blocks/icons/arrow.svg",
      contents: [
        { kind: "block", type: "operator_add" },
        { kind: "block", type: "operator_equals" },
        { kind: "block", type: "operator_and" },
      ],
    },
    {
      kind: "category",
      name: "数据",
      categorystyle: "data",
      iconURI: "/scratch-blocks/icons/set-led_blue.svg",
      contents: [
        { kind: "block", type: "data_setvariableto" },
        { kind: "block", type: "data_changevariableby" },
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
    setDsl(generateDslFromWorkspace(workspace));

    const handleChange = () => {
      const state = ScratchBlocks.serialization.workspaces.save(workspace);
      setJson(JSON.stringify(state, null, 2));
      const nextDsl = generateDslFromWorkspace(workspace);
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
        setDsl(generateDslFromWorkspace(workspaceRef.current));
      } catch {
        // ignore malformed json
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

  const stringifyInputValue = (block: Block | null): string => {
    if (!block) return "";
    switch (block.type) {
      case "operator_add": {
        const left = stringifyInputValue(block.getInputTargetBlock("NUM1"));
        const right = stringifyInputValue(block.getInputTargetBlock("NUM2"));
        return `${left} + ${right}`.trim();
      }
      case "operator_equals": {
        const left = stringifyInputValue(block.getInputTargetBlock("OPERAND1"));
        const right = stringifyInputValue(block.getInputTargetBlock("OPERAND2"));
        return `${left} == ${right}`.trim();
      }
      case "operator_and": {
        const left = stringifyInputValue(block.getInputTargetBlock("OPERAND1"));
        const right = stringifyInputValue(block.getInputTargetBlock("OPERAND2"));
        return `${left} && ${right}`.trim();
      }
      case "data_variable": {
        return String(block.getFieldValue("VARIABLE") ?? "");
      }
      case "data_setvariableto":
      case "data_changevariableby": {
        return String(block.getFieldValue("VARIABLE") ?? "");
      }
      default: {
        const value = block.getFieldValue("VALUE");
        return value != null ? String(value) : "";
      }
    }
  };

  const renderStatement = (block: Block | null, indentLevel: number): string => {
    if (!block) return "";
    const indent = "  ".repeat(indentLevel);
    const next = () => renderStatement(block.getNextBlock(), indentLevel);

    switch (block.type) {
      case "event_whenflagclicked": {
        const body = renderStatement(block.getInputTargetBlock("SUBSTACK"), indentLevel + 1);
        const lines = [`${indent}when flag clicked {`, body, `${indent}}`, next()].filter(Boolean);
        return lines.join("\n");
      }
      case "event_whenbroadcastreceived": {
        const message = String(block.getFieldValue("BROADCAST_OPTION") ?? "");
        const body = renderStatement(block.getInputTargetBlock("SUBSTACK"), indentLevel + 1);
        const lines = [`${indent}when broadcast ${message} {`, body, `${indent}}`, next()].filter(Boolean);
        return lines.join("\n");
      }
      case "control_repeat": {
        const times = stringifyInputValue(block.getInputTargetBlock("TIMES"));
        const body = renderStatement(block.getInputTargetBlock("SUBSTACK"), indentLevel + 1);
        const lines = [`${indent}repeat (${times || "?"}) {`, body, `${indent}}`, next()].filter(Boolean);
        return lines.join("\n");
      }
      case "control_if": {
        const condition = stringifyInputValue(block.getInputTargetBlock("CONDITION"));
        const body = renderStatement(block.getInputTargetBlock("SUBSTACK"), indentLevel + 1);
        const lines = [`${indent}if (${condition || "?"}) {`, body, `${indent}}`, next()].filter(Boolean);
        return lines.join("\n");
      }
      case "control_if_else": {
        const condition = stringifyInputValue(block.getInputTargetBlock("CONDITION"));
        const body = renderStatement(block.getInputTargetBlock("SUBSTACK"), indentLevel + 1);
        const elseBody = renderStatement(block.getInputTargetBlock("SUBSTACK2"), indentLevel + 1);
        const lines = [
          `${indent}if (${condition || "?"}) {`,
          body,
          `${indent}} else {`,
          elseBody,
          `${indent}}`,
          next(),
        ].filter(Boolean);
        return lines.join("\n");
      }
      case "data_setvariableto": {
        const variable = String(block.getFieldValue("VARIABLE") ?? "");
        const value = stringifyInputValue(block.getInputTargetBlock("VALUE"));
        const line = `${indent}set ${variable} = ${value || "?"}`;
        return [line, next()].filter(Boolean).join("\n");
      }
      case "data_changevariableby": {
        const variable = String(block.getFieldValue("VARIABLE") ?? "");
        const value = stringifyInputValue(block.getInputTargetBlock("VALUE"));
        const line = `${indent}change ${variable} by ${value || "?"}`;
        return [line, next()].filter(Boolean).join("\n");
      }
      default: {
        const line = `${indent}${block.type}`;
        return [line, next()].filter(Boolean).join("\n");
      }
    }
  };

  const generateDslFromWorkspace = (workspace: WorkspaceSvg) => {
    const topBlocks = workspace.getTopBlocks(true);
    if (topBlocks.length === 0) return "";
    return topBlocks.map((block) => renderStatement(block, 0)).filter(Boolean).join("\n\n");
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
