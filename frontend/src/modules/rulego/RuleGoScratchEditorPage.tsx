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

type BlockConfigModalProps = {
  blockId: string | null;
  workspaceRef: React.RefObject<WorkspaceSvg | null>;
  onClose: () => void;
  onSaved?: () => void;
};

type CaseItem = { case: string; then: string };

function BlockConfigModal({ blockId, workspaceRef, onClose, onSaved }: BlockConfigModalProps) {
  const block = blockId && workspaceRef.current ? workspaceRef.current.getBlockById(blockId) : null;
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [switchCases, setSwitchCases] = useState<CaseItem[]>([{ case: "true", then: "Case1" }]);

  useEffect(() => {
    if (!block) {
      setForm({});
      setSwitchCases([{ case: "true", then: "Case1" }]);
      return;
    }
    const get = (name: string) => String(block.getFieldValue(name) ?? "").trim();
    const getBool = (name: string) => block.getFieldValue(name) === "TRUE";
    const next: Record<string, string | boolean> = {
      NODE_ID: get("NODE_ID"),
      NODE_NAME: get("NODE_NAME"),
      DEBUG: block.getFieldValue ? getBool("DEBUG") : true,
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
        setSwitchCases(list.length > 0 ? list : [{ case: "true", then: "Case1" }]);
      } catch {
        setSwitchCases([{ case: "true", then: "Case1" }]);
      }
    }
    setForm(next);
  }, [block, blockId]);

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
    Object.entries(form).forEach(([key, value]) => {
      if (form[key] !== undefined && key !== "CASES_JSON" && key !== "GROUP_SLOT_COUNT") set(key, value as string | boolean);
    });
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
    onSaved?.();
    onClose();
  };

  if (!blockId) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal" onClick={(ev) => ev.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>编辑块配置 · {block?.type ?? blockId}</h3>
          <button type="button" className="text-button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {!block ? (
            <p className="confirm-text">块不存在或已被删除，请先在画布中选中一个块。</p>
          ) : (
            <div className="form-grid">
              <label className="form-field">
                <span>节点 ID</span>
                <input
                  value={String(form.NODE_ID ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, NODE_ID: e.target.value }))}
                />
              </label>
              <label className="form-field">
                <span>节点名称</span>
                <input
                  value={String(form.NODE_NAME ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, NODE_NAME: e.target.value }))}
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
                    画布上会同步显示对应数量的 Case 槽位；Default / Failure 为固定槽位。最多 6 个 case。参考{" "}
                    <a href="https://rulego.cc/pages/switch/#%E9%85%8D%E7%BD%AE%E7%A4%BA%E4%BE%8B" target="_blank" rel="noopener noreferrer">
                      RuleGo 条件分支
                    </a>
                  </small>
                </div>
              )}
              {block.type === "rulego_join" && (
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
                  <small className="form-hint" style={{ gridColumn: "1 / -1" }}>
                    参考 <a href="https://rulego.cc/pages/join/" target="_blank" rel="noopener noreferrer">RuleGo 汇聚</a>
                  </small>
                </>
              )}
              {block.type === "rulego_groupAction" && (
                <>
                  <label className="form-field">
                    <span>matchRelationType</span>
                    <select
                      value={String(form.MATCH_RELATION_TYPE ?? "Success")}
                      onChange={(e) => setForm((f) => ({ ...f, MATCH_RELATION_TYPE: e.target.value }))}
                    >
                      <option value="Success">Success</option>
                      <option value="Failure">Failure</option>
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
                  <textarea
                    value={String(form.JS_SCRIPT ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, JS_SCRIPT: e.target.value }))}
                    rows={8}
                    style={{ fontFamily: "monospace", fontSize: 13 }}
                  />
                </label>
              )}
              {block.type === "rulego_restApiCall" && (
                <>
                  <label className="form-field">
                    <span>URL</span>
                    <input
                      value={String(form.REST_URL ?? "")}
                      onChange={(e) => setForm((f) => ({ ...f, REST_URL: e.target.value }))}
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
                    <textarea
                      value={String(form.REST_HEADERS ?? "{}")}
                      onChange={(e) => setForm((f) => ({ ...f, REST_HEADERS: e.target.value }))}
                      rows={2}
                      style={{ fontFamily: "monospace" }}
                    />
                  </label>
                  <label className="form-field" style={{ gridColumn: "1 / -1" }}>
                    <span>Body</span>
                    <textarea
                      value={String(form.REST_BODY ?? "")}
                      onChange={(e) => setForm((f) => ({ ...f, REST_BODY: e.target.value }))}
                      rows={3}
                      style={{ fontFamily: "monospace" }}
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
                    />
                  </label>
                </>
              )}
              <label className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.DEBUG)}
                  onChange={(e) => setForm((f) => ({ ...f, DEBUG: e.target.checked }))}
                />
                <span>调试</span>
              </label>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="text-button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={!block}>
              确定
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const [configModalBlockId, setConfigModalBlockId] = useState<string | null>(null);
  const lastTouchedBlockIdRef = useRef<string | null>(null);
  const MAX_GROUP_SLOTS = 8;

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BlocklyF = ScratchBlocks as any;

    const buildMinimalNodeInit = (options: {
      defaultId: string;
      defaultName: string;
      script?: string;
      category: "rulego_nodes" | "rulego_routes" | "rulego_data" | "rulego_endpoints" | "rulego_routers";
      restFields?: Array<{ name: string; value: string; dropdown?: [string, string][] }>;
    }) => {
      return function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput(options.defaultName), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput(options.defaultId), "NODE_ID");
        if (options.script) config.appendField(new BlocklyF.FieldTextInput(options.script), "JS_SCRIPT");
        if (options.restFields?.length) {
          options.restFields.forEach((f) => {
            if (f.dropdown) config.appendField(new BlocklyF.FieldDropdown(f.dropdown), f.name);
            else config.appendField(new BlocklyF.FieldTextInput(f.value), f.name);
          });
        }
        config.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        config.appendField(
          new BlocklyF.FieldDropdown([["Success", "Success"], ["Failure", "Failure"], ["True", "True"], ["False", "False"]]),
          "LINK_TYPE"
        );
        config.appendField(new BlocklyF.FieldTextInput(""), "LINK_LABEL");
        const configInput = this.getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        if (typeof this.setStyle === "function") this.setStyle(options.category);
      };
    };

    ScratchBlocks.Blocks.rulego_jsFilter = {
      init: function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput("Filter"), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput("s1"), "NODE_ID");
        config.appendField(new BlocklyF.FieldTextInput("return msg.temperature > 50;"), "JS_SCRIPT");
        config.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        this.appendStatementInput("branch_true").appendField("True");
        this.appendStatementInput("branch_false").appendField("False");
        this.appendStatementInput("branch_failure").appendField("Failure");
        const configInput = this.getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        this.setPreviousStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_nodes");
      },
    };

    ScratchBlocks.Blocks.rulego_jsTransform = {
      init: function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput("脚本转换器"), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput("s2"), "NODE_ID");
        config.appendField(
          new BlocklyF.FieldTextInput(
            "metadata['name']='test02';\nmetadata['index']=22;\nmsg['addField']='addValue2';\nreturn {'msg':msg,'metadata':metadata,'msgType':msgType};"
          ),
          "JS_SCRIPT"
        );
        config.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        this.appendStatementInput("branch_success").appendField("Success");
        this.appendStatementInput("branch_failure").appendField("Failure");
        const configInput = this.getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        this.setPreviousStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_nodes");
      },
    };

    ScratchBlocks.Blocks.rulego_jsSwitch = {
      init: function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput("脚本路由"), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput("s3"), "NODE_ID");
        config.appendField(new BlocklyF.FieldTextInput("return ['Success'];"), "JS_SCRIPT");
        config.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        this.appendStatementInput("branch_success").appendField("Success");
        this.appendStatementInput("branch_failure").appendField("Failure");
        this.appendStatementInput("branch_default").appendField("Default");
        const configInput = this.getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_nodes");
      },
    };

    const MAX_SWITCH_CASES = 6;

    ScratchBlocks.Blocks.rulego_switch = {
      init: function (this: Block & { caseCount_?: number; casesJson_?: string; updateShape_?: () => void }) {
        this.caseCount_ = 1;
        this.casesJson_ = '[{"case":"true","then":"Case1"}]';
        this.updateShape_?.();
      },
      mutationToDom: function (this: Block & { caseCount_?: number; casesJson_?: string }) {
        const xml = document.createElement("mutation");
        xml.setAttribute("casecount", String(Math.max(1, Math.min(MAX_SWITCH_CASES, this.caseCount_ ?? 1))));
        const casesEl = document.createElement("cases");
        casesEl.textContent = this.casesJson_ ?? this.getFieldValue?.("CASES_JSON") ?? "[]";
        xml.appendChild(casesEl);
        return xml;
      },
      domToMutation: function (this: Block & { caseCount_?: number; casesJson_?: string; updateShape_?: () => void }, xml: Element) {
        const count = Math.max(1, Math.min(MAX_SWITCH_CASES, parseInt(xml.getAttribute("casecount") || "1", 10)));
        const casesEl = xml.querySelector("cases");
        this.caseCount_ = count;
        this.casesJson_ = casesEl?.textContent?.trim() || this.casesJson_ || "[]";
        this.updateShape_?.();
      },
      updateShape_: function (this: Block & { caseCount_?: number; casesJson_?: string }) {
        const n = Math.max(1, Math.min(MAX_SWITCH_CASES, this.caseCount_ ?? 1));
        let casesJson = "";
        try {
          casesJson = String(this.getFieldValue?.("CASES_JSON") ?? this.casesJson_ ?? "[]").trim() || '[{"case":"true","then":"Case1"}]';
        } catch {
          casesJson = this.casesJson_ || '[{"case":"true","then":"Case1"}]';
        }
        let nodeName = "条件分支";
        let nodeId = "sw1";
        try {
          nodeName = String(this.getFieldValue?.("NODE_NAME") ?? "条件分支");
          nodeId = String(this.getFieldValue?.("NODE_ID") ?? "sw1");
        } catch {}
        const inputNames = this.inputList?.map((inp: { name: string }) => inp.name) ?? [];
        inputNames.forEach((name: string) => this.removeInput(name));
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput(nodeName), "NODE_NAME");
        const configInput = this.appendDummyInput("CONFIG");
        configInput.appendField(new BlocklyF.FieldTextInput(nodeId), "NODE_ID");
        configInput.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        const casesInput = this.appendDummyInput("CASES").appendField(
          new BlocklyF.FieldTextInput(casesJson),
          "CASES_JSON"
        );
        if (configInput.setVisible) configInput.setVisible(false);
        if (casesInput.setVisible) casesInput.setVisible(false);
        for (let i = 0; i < n; i++) {
          this.appendStatementInput(`branch_case_${i}`).appendField(`Case${i + 1}`);
        }
        this.appendStatementInput("branch_default").appendField("Default");
        this.appendStatementInput("branch_failure").appendField("Failure");
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_routes");
      },
    };

    ScratchBlocks.Blocks.rulego_break = {
      init: buildMinimalNodeInit({ defaultId: "br1", defaultName: "Break", category: "rulego_routes" }),
    };

    ScratchBlocks.Blocks.rulego_join = {
      init: function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput("汇聚"), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput("jn1"), "NODE_ID");
        config.appendField(new BlocklyF.FieldNumber("0", 0, 3600, 1), "JOIN_TIMEOUT");
        config.appendField(new BlocklyF.FieldCheckbox(false), "JOIN_MERGE_TO_MAP");
        config.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        this.appendStatementInput("branch_success").appendField("Success");
        this.appendStatementInput("branch_failure").appendField("Failure");
        const configInput = this.getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        this.setPreviousStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_routes");
      },
    };

    ScratchBlocks.Blocks.rulego_for = {
      init: function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput("遍历"), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput("for1"), "NODE_ID");
        config.appendField(new BlocklyF.FieldTextInput("1..3"), "FOR_RANGE");
        config.appendField(new BlocklyF.FieldTextInput(""), "FOR_DO");
        config.appendField(new BlocklyF.FieldDropdown([["忽略", "0"], ["追加", "1"], ["覆盖", "2"], ["异步", "3"]]), "FOR_MODE");
        config.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        this.appendStatementInput("branch_do").appendField("do 遍历体");
        this.appendStatementInput("branch_success").appendField("Success");
        this.appendStatementInput("branch_failure").appendField("Failure");
        const configInput = this.getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_data");
      },
    };

    ScratchBlocks.Blocks.rulego_groupAction = {
      init: function (this: Block & { groupCount_?: number; updateShape_?: () => void }) {
        this.groupCount_ = 1;
        const typeDef = ScratchBlocks.Blocks.rulego_groupAction as { updateShape_?: (this: Block) => void };
        (this as Block & { updateShape_?: () => void }).updateShape_ = () => typeDef.updateShape_?.call(this);
        this.updateShape_?.();
      },
      mutationToDom: function (this: Block & { groupCount_?: number }) {
        const xml = document.createElement("mutation");
        xml.setAttribute("slotcount", String(Math.max(1, Math.min(MAX_GROUP_SLOTS, this.groupCount_ ?? 1))));
        return xml;
      },
      domToMutation: function (this: Block & { groupCount_?: number; updateShape_?: () => void }, xml: Element) {
        this.groupCount_ = Math.max(1, Math.min(MAX_GROUP_SLOTS, parseInt(xml.getAttribute("slotcount") || "1", 10)));
        this.updateShape_?.();
      },
      updateShape_: function (this: Block & { groupCount_?: number }) {
        const n = Math.max(1, Math.min(MAX_GROUP_SLOTS, this.groupCount_ ?? 1));
        const nodeId = this.getFieldValue?.("NODE_ID") ?? "grp1";
        const nodeName = this.getFieldValue?.("NODE_NAME") ?? "节点组";
        const matchRel = this.getFieldValue?.("MATCH_RELATION_TYPE") ?? "Success";
        const matchNum = this.getFieldValue?.("MATCH_NUM") ?? "0";
        const timeout = this.getFieldValue?.("GROUP_TIMEOUT") ?? "0";
        const mergeToMap = this.getFieldValue?.("GROUP_MERGE_TO_MAP") === "TRUE";
        const debug = this.getFieldValue?.("DEBUG") === "TRUE";
        const inputNames = this.inputList?.map((inp: { name: string }) => inp.name) ?? [];
        inputNames.forEach((name: string) => this.removeInput(name));
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput(nodeName), "NODE_NAME");
        const configInput = this.appendDummyInput("CONFIG");
        configInput.appendField(new BlocklyF.FieldTextInput(nodeId), "NODE_ID");
        configInput.appendField(new BlocklyF.FieldDropdown([["Success", "Success"], ["Failure", "Failure"]]), "MATCH_RELATION_TYPE");
        configInput.appendField(new BlocklyF.FieldNumber("0", 0, 99, 1), "MATCH_NUM");
        configInput.appendField(new BlocklyF.FieldNumber("0", 0, 3600, 1), "GROUP_TIMEOUT");
        configInput.appendField(new BlocklyF.FieldCheckbox(false), "GROUP_MERGE_TO_MAP");
        configInput.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        if (configInput.setVisible) configInput.setVisible(false);
        for (let i = 0; i < n; i++) {
          this.appendStatementInput(`branch_${i}`).appendField(`组内节点${i + 1}`);
        }
        this.appendStatementInput("branch_success").appendField("Success");
        this.appendStatementInput("branch_failure").appendField("Failure");
        this.setPreviousStatement(true);
        this.setFieldValue(matchRel, "MATCH_RELATION_TYPE");
        this.setFieldValue(matchNum, "MATCH_NUM");
        this.setFieldValue(timeout, "GROUP_TIMEOUT");
        this.setFieldValue(mergeToMap ? "TRUE" : "FALSE", "GROUP_MERGE_TO_MAP");
        this.setFieldValue(debug ? "TRUE" : "FALSE", "DEBUG");
        if (typeof this.setStyle === "function") this.setStyle("rulego_data");
      },
    };

    ScratchBlocks.Blocks.rulego_restApiCall = {
      init: function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput("HTTP客户端"), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput("rest1"), "NODE_ID");
        config.appendField(new BlocklyF.FieldTextInput("http://localhost:9099/api"), "REST_URL");
        config.appendField(new BlocklyF.FieldDropdown([["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"], ["DELETE", "DELETE"]]), "REST_METHOD");
        config.appendField(new BlocklyF.FieldTextInput("{}"), "REST_HEADERS");
        config.appendField(new BlocklyF.FieldTextInput("{}"), "REST_QUERY");
        config.appendField(new BlocklyF.FieldTextInput(""), "REST_BODY");
        config.appendField(new BlocklyF.FieldTextInput("30000"), "REST_TIMEOUT");
        config.appendField(new BlocklyF.FieldTextInput("200"), "REST_MAX_PARALLEL");
        config.appendField(new BlocklyF.FieldCheckbox(true), "DEBUG");
        this.appendStatementInput("branch_success").appendField("Success");
        this.appendStatementInput("branch_failure").appendField("Failure");
        const configInput = this.getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        this.setPreviousStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_nodes");
      },
    };

    ScratchBlocks.Blocks.rulego_endpoint = {
      init: function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput("Endpoint"), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput("ep1"), "NODE_ID");
        config.appendField(new BlocklyF.FieldTextInput("http"), "EP_PROTOCOL");
        config.appendField(new BlocklyF.FieldTextInput("[]"), "EP_PROCESSORS");
        this.appendStatementInput("ROUTERS").appendField("路由");
        if (config.setVisible) config.setVisible(false);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_endpoints");
      },
    };

    ScratchBlocks.Blocks.rulego_router = {
      init: function (this: Block) {
        this.appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput("Router"), "NODE_NAME");
        const config = this.appendDummyInput("CONFIG");
        config.appendField(new BlocklyF.FieldTextInput("rt1"), "NODE_ID");
        config.appendField(new BlocklyF.FieldTextInput("/api"), "ROUTER_PATH");
        config.appendField(new BlocklyF.FieldDropdown([["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"], ["DELETE", "DELETE"]]), "ROUTER_METHOD");
        config.appendField(new BlocklyF.FieldTextInput("[]"), "ROUTER_PROCESSORS");
        if (config.setVisible) config.setVisible(false);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        if (typeof this.setStyle === "function") this.setStyle("rulego_routers");
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

    const handleChange = (ev?: { blockId?: string }) => {
      if (ev?.blockId) lastTouchedBlockIdRef.current = ev.blockId;
      const state = ScratchBlocks.serialization.workspaces.save(workspace);
      setJson(JSON.stringify(state, null, 2));
      const nextDsl = buildRuleGoDsl(workspace);
      setDsl(nextDsl);
    };

    workspace.addChangeListener((ev: unknown) => {
      handleChange(ev as { blockId?: string });
    });

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

    if (block.type === "rulego_switch") {
      const casesJson =
        getFieldValue(block, "CASES_JSON") ||
        String((block as Block & { casesJson_?: string }).casesJson_ ?? "").trim();
      const cases = parseJsonValue(casesJson, []) as Array<{ case?: string; then?: string }>;
      if (Array.isArray(cases) && cases.length > 0) {
        configuration.cases = cases.map((c) => ({ case: String(c?.case ?? ""), then: String(c?.then ?? "") }));
      }
    }

    if (block.type === "rulego_for") {
      configuration.range = getFieldValue(block, "FOR_RANGE") || "1..3";
      const doBlock = block.getInputTargetBlock("branch_do");
      configuration.do = doBlock
        ? (getFieldValue(doBlock, "NODE_ID") || doBlock.id)
        : (getFieldValue(block, "FOR_DO") || "s3");
      const modeStr = getFieldValue(block, "FOR_MODE");
      configuration.mode = modeStr === "" ? 0 : Number(modeStr) || 0;
    }

    if (block.type === "rulego_join") {
      configuration.timeout = Number(getFieldValue(block, "JOIN_TIMEOUT") ?? 0) || 0;
      configuration.mergeToMap = getBooleanField(block, "JOIN_MERGE_TO_MAP");
    }

    if (block.type === "rulego_groupAction") {
      const slotCount = Math.max(1, Math.min(MAX_GROUP_SLOTS, (block as Block & { groupCount_?: number }).groupCount_ ?? 1));
      const nodeIds: string[] = [];
      for (let i = 0; i < slotCount; i++) {
        const b = block.getInputTargetBlock(`branch_${i}`);
        if (b) nodeIds.push(getFieldValue(b, "NODE_ID") || b.id);
      }
      configuration.nodeIds = nodeIds.length ? nodeIds : (getFieldValue(block, "GROUP_NODE_IDS") || "").split(",").filter(Boolean);
      configuration.matchRelationType = getFieldValue(block, "MATCH_RELATION_TYPE") || "Success";
      configuration.matchNum = Number(getFieldValue(block, "MATCH_NUM") ?? 0) || 0;
      configuration.timeout = Number(getFieldValue(block, "GROUP_TIMEOUT") ?? 0) || 0;
      configuration.mergeToMap = getBooleanField(block, "GROUP_MERGE_TO_MAP");
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

    if (node.type === "switch") {
      const cases = (node.configuration?.cases ?? []) as Array<{ case?: string; then?: string }>;
      const casesArr = cases.length ? cases : [{ case: "true", then: "Case1" }];
      const casesJson = JSON.stringify(casesArr, null, 2);
      (block as Block & { casesJson_?: string }).casesJson_ = casesJson;
      block.setFieldValue(casesJson, "CASES_JSON");
      const domToMutation = (block as Block & { domToMutation?: (xml: Element) => void }).domToMutation;
      if (typeof domToMutation === "function") {
        const xml = document.createElement("mutation");
        xml.setAttribute("casecount", String(Math.max(1, Math.min(6, casesArr.length))));
        const casesEl = document.createElement("cases");
        casesEl.textContent = casesJson;
        xml.appendChild(casesEl);
        domToMutation.call(block, xml);
      }
    }

    if (node.type === "for") {
      block.setFieldValue(String(node.configuration?.range ?? "1..3"), "FOR_RANGE");
      block.setFieldValue(String(node.configuration?.do ?? "s3"), "FOR_DO");
      block.setFieldValue(String(node.configuration?.mode ?? 0), "FOR_MODE");
    }

    if (node.type === "join") {
      block.setFieldValue(String(node.configuration?.timeout ?? 0), "JOIN_TIMEOUT");
      block.setFieldValue(node.configuration?.mergeToMap ? "TRUE" : "FALSE", "JOIN_MERGE_TO_MAP");
    }

    if (node.type === "groupAction") {
      block.setFieldValue(String(node.configuration?.matchRelationType ?? "Success"), "MATCH_RELATION_TYPE");
      block.setFieldValue(String(node.configuration?.matchNum ?? 0), "MATCH_NUM");
      block.setFieldValue(String(node.configuration?.timeout ?? 0), "GROUP_TIMEOUT");
      block.setFieldValue(node.configuration?.mergeToMap ? "TRUE" : "FALSE", "GROUP_MERGE_TO_MAP");
      const nodeIds = (node.configuration?.nodeIds ?? []) as string[];
      const slotCount = Math.max(1, Math.min(MAX_GROUP_SLOTS, nodeIds.length || 1));
      const b = block as Block & { domToMutation?: (xml: Element) => void };
      if (typeof b.domToMutation === "function") {
        const xml = document.createElement("mutation");
        xml.setAttribute("slotcount", String(slotCount));
        b.domToMutation(xml);
      }
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
      if (!fromBlock || !toBlock || !toBlock.previousConnection) return;
      const type = String(connection.type ?? "Success");
      if (fromBlock.type === "rulego_switch") {
        let inputName: string;
        if (type === "Default") inputName = "branch_default";
        else if (type === "Failure") inputName = "branch_failure";
        else {
          const casesJson =
            String(fromBlock.getFieldValue("CASES_JSON") ?? "").trim() ||
            String((fromBlock as Block & { casesJson_?: string }).casesJson_ ?? "").trim();
          const cases = (() => {
            if (!casesJson) return [];
            try {
              return JSON.parse(casesJson) as Array<{ then?: string }>;
            } catch {
              return [];
            }
          })();
          const idx = cases.findIndex((c) => String(c?.then ?? "") === type);
          inputName = idx >= 0 ? `branch_case_${idx}` : type === "Case1" ? "branch_case_0" : type === "Case2" ? "branch_case_1" : type === "Case3" ? "branch_case_2" : type === "Case4" ? "branch_case_3" : type === "Case5" ? "branch_case_4" : type === "Case6" ? "branch_case_5" : "branch_default";
        }
        const input = fromBlock.getInput(inputName);
        if (input?.connection) {
          input.connection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
        }
      } else if (fromBlock.type === "rulego_jsFilter") {
        const inputName = type === "True" ? "branch_true" : type === "False" ? "branch_false" : "branch_failure";
        const input = fromBlock.getInput(inputName);
        if (input?.connection) {
          input.connection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
        }
      } else if (fromBlock.type === "rulego_jsSwitch") {
        const inputName = type === "Failure" ? "branch_failure" : type === "Default" ? "branch_default" : "branch_success";
        const input = fromBlock.getInput(inputName);
        if (input?.connection) {
          input.connection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
        }
      } else if (fromBlock.type === "rulego_for") {
        const inputName = type === "Do" ? "branch_do" : type === "Failure" ? "branch_failure" : "branch_success";
        const input = fromBlock.getInput(inputName);
        if (input?.connection) {
          input.connection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
        }
      } else if (fromBlock.type === "rulego_jsTransform" || fromBlock.type === "rulego_join" || fromBlock.type === "rulego_restApiCall") {
        const inputName = type === "Failure" ? "branch_failure" : "branch_success";
        const input = fromBlock.getInput(inputName);
        if (input?.connection) {
          input.connection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
        }
      } else if (fromBlock.type === "rulego_groupAction") {
        const inputName = type === "Failure" ? "branch_failure" : "branch_success";
        const input = fromBlock.getInput(inputName);
        if (input?.connection) {
          input.connection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
        }
      } else if (fromBlock.nextConnection) {
        fromBlock.setFieldValue(type, "LINK_TYPE");
        if (connection.label) fromBlock.setFieldValue(String(connection.label), "LINK_LABEL");
        fromBlock.nextConnection.connect(toBlock.previousConnection as ScratchBlocks.Connection);
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

    const MAX_SWITCH_CASES_DSL = 6;
    const addConnectionsFromBlock = (fromBlock: Block) => {
      const fromId = getFieldValue(fromBlock, "NODE_ID") || fromBlock.id;
      const addConn = (toBlock: Block | null, type: string, label?: string) => {
        if (!toBlock) return;
        const toId = getFieldValue(toBlock, "NODE_ID") || toBlock.id;
        connections.push(label ? { fromId, toId, type, label } : { fromId, toId, type });
      };
      if (fromBlock.type === "rulego_switch") {
        const casesJson =
          getFieldValue(fromBlock, "CASES_JSON") ||
          String((fromBlock as Block & { casesJson_?: string }).casesJson_ ?? "").trim();
        const cases = parseJsonValue(casesJson, []) as Array<{ then?: string }>;
        for (let i = 0; i < Math.min(MAX_SWITCH_CASES_DSL, cases.length); i++) {
          const thenType = cases[i]?.then ? String(cases[i].then) : `Case${i + 1}`;
          addConn(fromBlock.getInputTargetBlock(`branch_case_${i}`) ?? null, thenType);
        }
        addConn(fromBlock.getInputTargetBlock("branch_default") ?? null, "Default");
        addConn(fromBlock.getInputTargetBlock("branch_failure") ?? null, "Failure");
      } else if (fromBlock.type === "rulego_jsFilter") {
        addConn(fromBlock.getInputTargetBlock("branch_true") ?? null, "True");
        addConn(fromBlock.getInputTargetBlock("branch_false") ?? null, "False");
        addConn(fromBlock.getInputTargetBlock("branch_failure") ?? null, "Failure");
      } else if (fromBlock.type === "rulego_jsSwitch") {
        addConn(fromBlock.getInputTargetBlock("branch_success") ?? null, "Success");
        addConn(fromBlock.getInputTargetBlock("branch_failure") ?? null, "Failure");
        addConn(fromBlock.getInputTargetBlock("branch_default") ?? null, "Default");
      } else if (fromBlock.type === "rulego_for") {
        addConn(fromBlock.getInputTargetBlock("branch_do") ?? null, "Do");
        addConn(fromBlock.getInputTargetBlock("branch_success") ?? null, "Success");
        addConn(fromBlock.getInputTargetBlock("branch_failure") ?? null, "Failure");
      } else if (fromBlock.type === "rulego_jsTransform") {
        addConn(fromBlock.getInputTargetBlock("branch_success") ?? null, "Success");
        addConn(fromBlock.getInputTargetBlock("branch_failure") ?? null, "Failure");
      } else if (fromBlock.type === "rulego_join") {
        addConn(fromBlock.getInputTargetBlock("branch_success") ?? null, "Success");
        addConn(fromBlock.getInputTargetBlock("branch_failure") ?? null, "Failure");
      } else if (fromBlock.type === "rulego_groupAction") {
        addConn(fromBlock.getInputTargetBlock("branch_success") ?? null, "Success");
        addConn(fromBlock.getInputTargetBlock("branch_failure") ?? null, "Failure");
      } else if (fromBlock.type === "rulego_restApiCall") {
        addConn(fromBlock.getInputTargetBlock("branch_success") ?? null, "Success");
        addConn(fromBlock.getInputTargetBlock("branch_failure") ?? null, "Failure");
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
        if (current.type === "rulego_endpoint") {
          addEndpoint(current);
          current = current.getNextBlock();
          continue;
        }
        addNode(current);
        addConnectionsFromBlock(current);
        if (current.type === "rulego_switch") {
          for (let i = 0; i < MAX_SWITCH_CASES_DSL; i++) {
            let branchBlock = current.getInputTargetBlock(`branch_case_${i}`);
            while (branchBlock) {
              walkChain(branchBlock);
              branchBlock = branchBlock.getNextBlock();
            }
          }
          ["branch_default", "branch_failure"].forEach((inputName) => {
            let branchBlock = current.getInputTargetBlock(inputName);
            while (branchBlock) {
              walkChain(branchBlock);
              branchBlock = branchBlock.getNextBlock();
            }
          });
          current = null;
        } else if (current.type === "rulego_jsFilter") {
          ["branch_true", "branch_false", "branch_failure"].forEach((inputName) => {
            let branchBlock = current.getInputTargetBlock(inputName);
            while (branchBlock) {
              walkChain(branchBlock);
              branchBlock = branchBlock.getNextBlock();
            }
          });
          current = null;
        } else if (current.type === "rulego_jsSwitch") {
          ["branch_success", "branch_failure", "branch_default"].forEach((inputName) => {
            let branchBlock = current.getInputTargetBlock(inputName);
            while (branchBlock) {
              walkChain(branchBlock);
              branchBlock = branchBlock.getNextBlock();
            }
          });
          current = null;
        } else if (current.type === "rulego_jsTransform") {
          ["branch_success", "branch_failure"].forEach((inputName) => {
            let branchBlock = current.getInputTargetBlock(inputName);
            while (branchBlock) {
              walkChain(branchBlock);
              branchBlock = branchBlock.getNextBlock();
            }
          });
          current = null;
        } else if (current.type === "rulego_join" || current.type === "rulego_restApiCall") {
          ["branch_success", "branch_failure"].forEach((inputName) => {
            let branchBlock = current.getInputTargetBlock(inputName);
            while (branchBlock) {
              walkChain(branchBlock);
              branchBlock = branchBlock.getNextBlock();
            }
          });
          current = null;
        } else if (current.type === "rulego_groupAction") {
          const gaInputs = (current.inputList ?? [])
            .map((inp: { name: string }) => inp.name)
            .filter((name: string) => name.startsWith("branch_"));
          gaInputs.forEach((inputName: string) => {
            let branchBlock = current.getInputTargetBlock(inputName);
            while (branchBlock) {
              walkChain(branchBlock);
              branchBlock = branchBlock.getNextBlock();
            }
          });
          current = null;
        } else if (current.type === "rulego_for") {
          ["branch_do", "branch_success", "branch_failure"].forEach((inputName) => {
            let branchBlock = current.getInputTargetBlock(inputName);
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
          <div className="form-field" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                const ws = workspaceRef.current;
                const selectedId =
                  (ws as { getSelected?: () => Block | null })?.getSelected?.()?.id ??
                  lastTouchedBlockIdRef.current;
                if (selectedId) setConfigModalBlockId(selectedId);
              }}
            >
              编辑块配置
            </button>
            <small className="form-hint">先在画布中点击选中一个块，再点此按钮在弹框中编辑脚本、URL 等</small>
          </div>
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
      {configModalBlockId !== null && (
        <BlockConfigModal
          blockId={configModalBlockId}
          workspaceRef={workspaceRef}
          onClose={() => setConfigModalBlockId(null)}
        />
      )}
    </div>
  );
}
