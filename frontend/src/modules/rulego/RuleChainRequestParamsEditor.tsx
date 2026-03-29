import { useEffect, useRef, useState } from "react";
import {
  buildRuleChainParamsCommentedPreview,
  buildRuleChainParamsPreviewValue,
  emptyRuleChainParamsJson,
  importRuleChainParamsFromObjectJson,
  newParamNodeId,
  parseRuleChainParamsJson,
  serializeRuleChainParamsNodes,
  type RuleChainParamNode,
  type RuleChainParamType,
} from "./ruleChainRequestParams";

type RuleChainRequestParamsEditorProps = {
  title: string;
  value: string;
  onChange: (json: string) => void;
};

type Path = number[];

function updateAtPath(
  nodes: RuleChainParamNode[],
  path: Path,
  updater: (node: RuleChainParamNode) => RuleChainParamNode
): RuleChainParamNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  return nodes.map((node, idx) => {
    if (idx !== head) return node;
    if (rest.length === 0) return updater(node);
    return { ...node, children: updateAtPath(node.children, rest, updater) };
  });
}

function removeAtPath(nodes: RuleChainParamNode[], path: Path): RuleChainParamNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  if (rest.length === 0) return nodes.filter((_, i) => i !== head);
  return nodes.map((n, i) =>
    i === head ? { ...n, children: removeAtPath(n.children, rest) } : n
  );
}

function insertSiblingAfter(
  nodes: RuleChainParamNode[],
  path: Path,
  factory: () => RuleChainParamNode
): RuleChainParamNode[] {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    const next = [...nodes];
    next.splice(head + 1, 0, factory());
    return next;
  }
  return nodes.map((n, i) =>
    i === head ? { ...n, children: insertSiblingAfter(n.children, rest, factory) } : n
  );
}

function addChildAtPath(
  nodes: RuleChainParamNode[],
  path: Path,
  factory: () => RuleChainParamNode
): RuleChainParamNode[] {
  return updateAtPath(nodes, path, (node) => ({ ...node, children: [...node.children, factory()] }));
}

function defaultNode(type: RuleChainParamType = "string"): RuleChainParamNode {
  return {
    id: newParamNodeId(),
    key: "",
    type,
    required: false,
    description: "",
    children: [],
  };
}

export default function RuleChainRequestParamsEditor({
  title,
  value,
  onChange,
}: RuleChainRequestParamsEditorProps) {
  const [nodes, setNodes] = useState<RuleChainParamNode[]>(() => parseRuleChainParamsJson(value));
  const [viewMode, setViewMode] = useState<"table" | "jsonOut">("table");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  /** 与 props.value 一致且来源于本组件 onChange 时跳过重新 parse，否则会生成新 id、key 变化导致输入框失焦 */
  const lastEmittedJsonRef = useRef<string>(value);

  useEffect(() => {
    if (value === lastEmittedJsonRef.current) {
      return;
    }
    lastEmittedJsonRef.current = value;
    setNodes(parseRuleChainParamsJson(value));
  }, [value]);

  const pushChange = (next: RuleChainParamNode[]) => {
    setNodes(next);
    const json = serializeRuleChainParamsNodes(next);
    lastEmittedJsonRef.current = json;
    onChange(json);
  };

  const updateNode = (path: Path, patch: Partial<RuleChainParamNode>) => {
    const next = updateAtPath(nodes, path, (node) => {
      const merged = { ...node, ...patch };
      if (patch.type && patch.type !== "object" && patch.type !== "array") {
        merged.children = [];
      }
      return merged;
    });
    pushChange(next);
  };

  const addRoot = () => pushChange([...nodes, defaultNode()]);

  const applyImport = () => {
    setImportError(null);
    try {
      const imported = importRuleChainParamsFromObjectJson(importText);
      pushChange(imported);
      setImportOpen(false);
      setImportText("");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const previewObj = buildRuleChainParamsPreviewValue(nodes);
  const previewObjText = JSON.stringify(previewObj, null, 2);
  const previewWithComments = buildRuleChainParamsCommentedPreview(nodes);

  const renderTreeRows = (list: RuleChainParamNode[], level: number, prefix: Path = []) =>
    list.map((node, idx) => {
      const path = [...prefix, idx];
      const canNest = node.type === "object" || node.type === "array";
      return (
        <div key={node.id}>
          <div className="rulego-request-params-row">
            <span className="rulego-request-params-cell rulego-request-params-cell--status">
              <span className={node.key.trim() ? "rulego-request-params-ok rulego-request-params-ok--on" : "rulego-request-params-ok"} />
            </span>
            <input
              className="rulego-request-params-input"
              style={{ paddingLeft: 8 + level * 18 }}
              value={node.key}
              onChange={(e) => updateNode(path, { key: e.target.value })}
              placeholder={level === 0 ? "key" : "child_key"}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
            />
            <select
              className="rulego-request-params-type"
              value={node.type}
              onChange={(e) => updateNode(path, { type: e.target.value as RuleChainParamType })}
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="array">array</option>
              <option value="object">object</option>
            </select>
            <div className="rulego-request-params-cell rulego-request-params-cell--req">
              <button
                type="button"
                className={node.required ? "rulego-request-params-req rulego-request-params-req--on" : "rulego-request-params-req"}
                onClick={() => updateNode(path, { required: !node.required })}
                title={node.required ? "必填" : "可选"}
                aria-pressed={node.required}
              >
                *
              </button>
            </div>
            <input
              className="rulego-request-params-input"
              value={node.description}
              onChange={(e) => updateNode(path, { description: e.target.value })}
              placeholder="描述（输出为 // 注释）"
              autoCapitalize="off"
              autoComplete="off"
            />
            <div className="rulego-request-params-row-actions">
              {canNest ? (
                <button
                  type="button"
                  className="text-button"
                  title="添加子节点"
                  onClick={() => pushChange(addChildAtPath(nodes, path, () => defaultNode()))}
                >
                  +子
                </button>
              ) : null}
              <button
                type="button"
                className="text-button"
                title="添加同级节点"
                onClick={() => pushChange(insertSiblingAfter(nodes, path, () => defaultNode()))}
              >
                +
              </button>
              <button
                type="button"
                className="text-button rulego-request-params-remove"
                title="删除节点"
                onClick={() => pushChange(removeAtPath(nodes, path))}
              >
                删
              </button>
            </div>
          </div>
          {node.children.length > 0 ? renderTreeRows(node.children, level + 1, path) : null}
        </div>
      );
    });

  return (
    <div className="rulego-request-params">
      <div className="rulego-request-params-head">
        <span className="rulego-request-params-title">{title}</span>
        <div className="rulego-request-params-actions">
          <div className="rulego-request-params-view-toggle" role="group" aria-label="展示方式">
            <button
              type="button"
              aria-pressed={viewMode === "table"}
              onClick={() => setViewMode("table")}
            >
              表格
            </button>
            <button type="button" aria-pressed={viewMode === "jsonOut"} onClick={() => setViewMode("jsonOut")}>
              输出 JSON
            </button>
          </div>
          <button type="button" className="text-button" onClick={() => setImportOpen(true)}>
            导入 JSON
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              pushChange(parseRuleChainParamsJson(emptyRuleChainParamsJson()));
            }}
          >
            清空
          </button>
        </div>
      </div>
      <p className="form-hint rulego-request-params-hint">
        支持树形层级编辑（YApi 风格），并实时构造 JSON；描述会以 <code>// 注释</code> 形式出现在输出预览中。
      </p>

      {viewMode === "jsonOut" ? (
        <div className="rulego-request-params-json-panel">
          <textarea
            className="rulego-request-params-json-textarea"
            value={previewWithComments}
            readOnly
            spellCheck={false}
            aria-label={`${title} 参数 JSON（含注释）`}
          />
          <textarea
            className="rulego-request-params-json-textarea"
            value={previewObjText}
            readOnly
            spellCheck={false}
            aria-label={`${title} 参数 JSON（纯结构）`}
          />
          <div className="rulego-request-params-json-actions">
            <span className="form-hint">上框：带注释预览（JSONC 风格）；下框：可直接复制使用的纯 JSON。</span>
          </div>
        </div>
      ) : null}

      {viewMode === "table" ? (
        <>
      <div className="rulego-request-params-table rulego-request-params-table--tree">
        <div className="rulego-request-params-row rulego-request-params-row--head">
          <span className="rulego-request-params-cell rulego-request-params-cell--status" aria-hidden />
          <span className="rulego-request-params-cell">参数名</span>
          <span className="rulego-request-params-cell rulego-request-params-cell--type">类型</span>
          <span className="rulego-request-params-cell rulego-request-params-cell--req" title="必填">
            *
          </span>
          <span className="rulego-request-params-cell rulego-request-params-cell--desc">说明</span>
          <span className="rulego-request-params-cell rulego-request-params-cell--del">操作</span>
        </div>
        {nodes.length === 0 ? <div className="rulego-request-params-empty">暂无参数，点击下方「添加根参数」</div> : renderTreeRows(nodes, 0)}
      </div>
      <button type="button" className="rulego-request-params-add" onClick={addRoot}>
        添加根参数
      </button>
        </>
      ) : null}

      {importOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="导入 JSON"
          onClick={() => setImportOpen(false)}
        >
          <div className="modal modal--import-json" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-header">
              <h3>导入 JSON — {title}</h3>
              <button type="button" className="text-button" onClick={() => setImportOpen(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <label className="form-field">
                <span>粘贴对象 JSON（将覆盖当前表格）。支持 // 与 /* */ 注释；对象数组会解析为 array 并保留元素对象内的字段（例如每项含 repo）。</span>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={8}
                  placeholder={'{\n  "repos": [\n    { "repo": "https://gitlab.com/group/repo.git" }\n  ]\n}'}
                  spellCheck={false}
                  className="rulego-request-params-import-textarea"
                />
              </label>
              {importError ? <div className="form-error">{importError}</div> : null}
            </div>
            <div className="modal-actions">
              <button type="button" className="text-button" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button type="button" className="primary-button" onClick={applyImport}>
                解析并覆盖
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
