import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_switch";
const nodeType = "switch";
const category = "rulego_condition" as const;
const MAX_SWITCH_CASES = 6;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    blocks[blockType] = {
      init: function (this: Block & { caseCount_?: number; casesJson_?: string; updateShape_?: () => void }) {
        this.caseCount_ = 1;
        this.casesJson_ = '[{"case":"true","then":"Case1"}]';
        this.updateShape_?.();
      },
      mutationToDom: function (this: Block & { caseCount_?: number; casesJson_?: string }) {
        const xml = document.createElement("mutation");
        xml.setAttribute("casecount", String(Math.max(1, Math.min(MAX_SWITCH_CASES, this.caseCount_ ?? 1))));
        const casesEl = document.createElement("cases");
        casesEl.textContent = this.casesJson_ ?? (this.getFieldValue?.("CASES_JSON") ?? "[]");
        xml.appendChild(casesEl);
        return xml;
      },
      domToMutation: function (
        this: Block & { caseCount_?: number; casesJson_?: string; updateShape_?: () => void },
        xml: Element
      ) {
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
          casesJson =
            String(this.getFieldValue?.("CASES_JSON") ?? this.casesJson_ ?? "[]").trim() ||
            '[{"case":"true","then":"Case1"}]';
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
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput(nodeName), "NODE_NAME");
        const configInput = (this as Block).appendDummyInput("CONFIG");
        configInput.appendField(new (BlocklyF as any).FieldTextInput(nodeId), "NODE_ID");
        const casesInput = (this as Block)
          .appendDummyInput("CASES")
          .appendField(new (BlocklyF as any).FieldTextInput(casesJson), "CASES_JSON");
        if (configInput.setVisible) configInput.setVisible(false);
        if (casesInput.setVisible) casesInput.setVisible(false);
        for (let i = 0; i < n; i++) {
          (this as Block).appendStatementInput(`branch_case_${i}`).appendField(`Case${i + 1}`);
        }
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block, helpers) {
    const casesJson =
      helpers.getFieldValue(block, "CASES_JSON") ||
      String((block as Block & { casesJson_?: string }).casesJson_ ?? "").trim();
    const cases = helpers.parseJsonValue(casesJson, []) as Array<{ case?: string; then?: string }>;
    if (Array.isArray(cases) && cases.length > 0) {
      return {
        cases: cases.map((c) => ({ case: String(c?.case ?? ""), then: String(c?.then ?? "") })),
      };
    }
    return {};
  },
  setConfiguration(block, node) {
    const cases = (node.configuration?.cases ?? []) as Array<{ case?: string; then?: string }>;
    const casesArr = cases.length ? cases : [{ case: "true", then: "Case1" }];
    const casesJson = JSON.stringify(casesArr, null, 2);
    (block as Block & { casesJson_?: string }).casesJson_ = casesJson;
    block.setFieldValue(casesJson, "CASES_JSON");
    const domToMutation = (block as Block & { domToMutation?: (xml: Element) => void }).domToMutation;
    if (typeof domToMutation === "function") {
      const xml = document.createElement("mutation");
      xml.setAttribute("casecount", String(Math.max(1, Math.min(MAX_SWITCH_CASES, casesArr.length))));
      const casesEl = document.createElement("cases");
      casesEl.textContent = casesJson;
      xml.appendChild(casesEl);
      domToMutation.call(block, xml);
    }
  },
  getConnectionBranches(block, helpers) {
    const casesJson =
      helpers.getFieldValue(block, "CASES_JSON") ||
      String((block as Block & { casesJson_?: string }).casesJson_ ?? "").trim();
    const cases = helpers.parseJsonValue(casesJson, []) as Array<{ then?: string }>;
    const branches: { inputName: string; connectionType: string }[] = [];
    for (let i = 0; i < Math.min(MAX_SWITCH_CASES, cases.length); i++) {
      const thenType = cases[i]?.then ? String(cases[i].then) : `Case${i + 1}`;
      branches.push({ inputName: `branch_case_${i}`, connectionType: thenType });
    }
    branches.push({ inputName: "__next__", connectionType: "Default" });
    branches.push({ inputName: "branch_failure", connectionType: "Failure" });
    return branches;
  },
  getInputNameForConnectionType(type, block) {
    if (type === "Default") return undefined;
    if (type === "Failure") return "branch_failure";
    if (!block) return undefined;
    const casesJson =
      String(block.getFieldValue("CASES_JSON") ?? "").trim() ||
      String((block as Block & { casesJson_?: string }).casesJson_ ?? "").trim();
    let cases: Array<{ then?: string }> = [];
    try {
      cases = JSON.parse(casesJson || "[]") as Array<{ then?: string }>;
    } catch {}
    const idx = cases.findIndex((c) => String(c?.then ?? "") === type);
    if (idx >= 0) return `branch_case_${idx}`;
    const fallback: Record<string, string> = {
      Case1: "branch_case_0",
      Case2: "branch_case_1",
      Case3: "branch_case_2",
      Case4: "branch_case_3",
      Case5: "branch_case_4",
      Case6: "branch_case_5",
    };
    return fallback[type] ?? undefined;
  },
  getWalkInputs(block) {
    const casesJson =
      String(block.getFieldValue("CASES_JSON") ?? "").trim() ||
      String((block as Block & { casesJson_?: string }).casesJson_ ?? "").trim();
    let cases: unknown[] = [];
    try {
      cases = JSON.parse(casesJson || "[]") as unknown[];
    } catch {}
    const n = Math.min(MAX_SWITCH_CASES, Array.isArray(cases) ? cases.length : 0);
    const inputs: string[] = [];
    for (let i = 0; i < n; i++) inputs.push(`branch_case_${i}`);
    inputs.push("__next__", "branch_failure");
    return inputs;
  },
};

registerBlockType(def);
export default def;
