import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const blockType = "rulego_fork";
const nodeType = "fork";
const category = "rulego_flow" as const;
const MAX_FORK_BRANCHES = 8;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    const Blocks = (ScratchBlocks as Record<string, unknown>).Blocks as Record<
      string,
      { updateShape_?: (this: Block) => void }
    >;
    Blocks[blockType] = {
      init: function (this: Block & { forkCount_?: number; updateShape_?: () => void }) {
        this.forkCount_ = 2;
        const typeDef = Blocks[blockType];
        (this as Block & { updateShape_?: () => void }).updateShape_ = () => typeDef.updateShape_?.call(this);
        this.updateShape_?.();
      },
      mutationToDom: function (this: Block & { forkCount_?: number }) {
        const xml = document.createElement("mutation");
        xml.setAttribute("branchcount", String(Math.max(1, Math.min(MAX_FORK_BRANCHES, this.forkCount_ ?? 2))));
        return xml;
      },
      domToMutation: function (this: Block & { forkCount_?: number; updateShape_?: () => void }, xml: Element) {
        this.forkCount_ = Math.max(1, Math.min(MAX_FORK_BRANCHES, parseInt(xml.getAttribute("branchcount") || "2", 10)));
        this.updateShape_?.();
      },
      updateShape_: function (this: Block & { forkCount_?: number }) {
        const n = Math.max(1, Math.min(MAX_FORK_BRANCHES, this.forkCount_ ?? 2));
        const nodeId = this.getFieldValue?.("NODE_ID") ?? "fork1";
        const nodeName = this.getFieldValue?.("NODE_NAME") ?? "并行网关";
        const inputNames = this.inputList?.map((inp: { name: string }) => inp.name) ?? [];
        inputNames.forEach((name: string) => this.removeInput(name));
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput(nodeName), "NODE_NAME");
        const configInput = (this as Block).appendDummyInput("CONFIG");
        configInput.appendField(new (BlocklyF as any).FieldTextInput(nodeId), "NODE_ID");
        if (configInput.setVisible) configInput.setVisible(false);
        for (let i = 0; i < n; i++) {
          (this as Block).appendStatementInput(`branch_${i}`).appendField(`并行分支 ${i + 1}`);
        }
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(false);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration() {
    return {};
  },
  setConfiguration(block, node) {
    const branchCount = Math.max(1, Math.min(MAX_FORK_BRANCHES, (node.configuration?.branchCount as number) ?? 2));
    const b = block as Block & { forkCount_?: number; domToMutation?: (xml: Element) => void };
    b.forkCount_ = branchCount;
    if (typeof b.domToMutation === "function") {
      const xml = document.createElement("mutation");
      xml.setAttribute("branchcount", String(branchCount));
      b.domToMutation(xml);
    }
  },
  getConnectionBranches(block, _helpers) {
    const n = Math.max(1, Math.min(MAX_FORK_BRANCHES, (block as Block & { forkCount_?: number }).forkCount_ ?? 2));
    const branches: { inputName: string; connectionType: string }[] = [];
    for (let i = 0; i < n; i++) {
      branches.push({ inputName: `branch_${i}`, connectionType: "Success" });
    }
    branches.push({ inputName: "branch_failure", connectionType: "Failure" });
    return branches;
  },
  getInputNameForConnectionType(type, block) {
    if (type === "Failure") return "branch_failure";
    if (type === "Success" && block) {
      const idx = (block as Block & { _forkConnIndex?: number })._forkConnIndex;
      if (typeof idx === "number" && idx >= 0) return `branch_${idx}`;
    }
    return undefined;
  },
  getWalkInputs(block) {
    const n = Math.max(1, Math.min(MAX_FORK_BRANCHES, (block as Block & { forkCount_?: number }).forkCount_ ?? 2));
    const inputs: string[] = [];
    for (let i = 0; i < n; i++) inputs.push(`branch_${i}`);
    inputs.push("branch_failure");
    return inputs;
  },
};

registerBlockType(def);
export default def;
