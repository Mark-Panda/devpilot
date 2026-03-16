import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_groupAction";
const nodeType = "groupAction";
const category = "rulego_data" as const;
const MAX_GROUP_SLOTS = 8;

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
      init: function (this: Block & { groupCount_?: number; updateShape_?: () => void }) {
        this.groupCount_ = 1;
        const typeDef = Blocks[blockType];
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
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput(nodeName), "NODE_NAME");
        const configInput = (this as Block).appendDummyInput("CONFIG");
        configInput.appendField(new (BlocklyF as any).FieldTextInput(nodeId), "NODE_ID");
        configInput.appendField(
          new (BlocklyF as any).FieldDropdown([["Success", "Success"], ["Failure", "Failure"]]),
          "MATCH_RELATION_TYPE"
        );
        configInput.appendField(new (BlocklyF as any).FieldNumber("0", 0, 99, 1), "MATCH_NUM");
        configInput.appendField(new (BlocklyF as any).FieldNumber("0", 0, 3600, 1), "GROUP_TIMEOUT");
        configInput.appendField(new (BlocklyF as any).FieldCheckbox(false), "GROUP_MERGE_TO_MAP");
        configInput.appendField(new (BlocklyF as any).FieldCheckbox(true), "DEBUG");
        if (configInput.setVisible) configInput.setVisible(false);
        for (let i = 0; i < n; i++) {
          (this as Block).appendStatementInput(`branch_${i}`).appendField(`组内节点${i + 1}`);
        }
        (this as Block).appendStatementInput("branch_success").appendField("Success");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        (this as Block).setPreviousStatement(true);
        this.setFieldValue(matchRel, "MATCH_RELATION_TYPE");
        this.setFieldValue(matchNum, "MATCH_NUM");
        this.setFieldValue(timeout, "GROUP_TIMEOUT");
        this.setFieldValue(mergeToMap ? "TRUE" : "FALSE", "GROUP_MERGE_TO_MAP");
        this.setFieldValue(debug ? "TRUE" : "FALSE", "DEBUG");
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block, helpers) {
    const slotCount = Math.max(1, Math.min(MAX_GROUP_SLOTS, (block as Block & { groupCount_?: number }).groupCount_ ?? 1));
    const nodeIds: string[] = [];
    for (let i = 0; i < slotCount; i++) {
      const b = block.getInputTargetBlock(`branch_${i}`);
      if (b) nodeIds.push(helpers.getFieldValue(b, "NODE_ID") || b.id);
    }
    const fallback = (helpers.getFieldValue(block, "GROUP_NODE_IDS") || "").split(",").filter(Boolean);
    return {
      nodeIds: nodeIds.length ? nodeIds : fallback,
      matchRelationType: helpers.getFieldValue(block, "MATCH_RELATION_TYPE") || "Success",
      matchNum: Number(helpers.getFieldValue(block, "MATCH_NUM") ?? 0) || 0,
      timeout: Number(helpers.getFieldValue(block, "GROUP_TIMEOUT") ?? 0) || 0,
      mergeToMap: helpers.getBooleanField(block, "GROUP_MERGE_TO_MAP"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.matchRelationType ?? "Success"), "MATCH_RELATION_TYPE");
    block.setFieldValue(String(c.matchNum ?? 0), "MATCH_NUM");
    block.setFieldValue(String(c.timeout ?? 0), "GROUP_TIMEOUT");
    block.setFieldValue(c.mergeToMap ? "TRUE" : "FALSE", "GROUP_MERGE_TO_MAP");
    const nodeIds = (c.nodeIds ?? []) as string[];
    const slotCount = Math.max(1, Math.min(MAX_GROUP_SLOTS, nodeIds.length || 1));
    const b = block as Block & { domToMutation?: (xml: Element) => void };
    if (typeof b.domToMutation === "function") {
      const xml = document.createElement("mutation");
      xml.setAttribute("slotcount", String(slotCount));
      b.domToMutation(xml);
    }
  },
  getConnectionBranches() {
    return [
      { inputName: "branch_success", connectionType: "Success" },
      { inputName: "branch_failure", connectionType: "Failure" },
    ];
  },
  getInputNameForConnectionType(type) {
    return type === "Failure" ? "branch_failure" : "branch_success";
  },
  getWalkInputs(block) {
    const inputNames = (block.inputList ?? []).map((inp: { name: string }) => inp.name);
    return inputNames.filter((name: string) => name.startsWith("branch_"));
  },
};

registerBlockType(def);
export default def;
