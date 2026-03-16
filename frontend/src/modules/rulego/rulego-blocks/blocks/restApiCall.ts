import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";

const blockType = "rulego_restApiCall";
const nodeType = "restApiCall";
const category = "rulego_nodes" as const;

const def: BlockTypeDef = {
  blockType,
  nodeType,
  category,
  register(ScratchBlocks, BlocklyF) {
    (ScratchBlocks as Record<string, unknown>).Blocks[blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new (BlocklyF as any).FieldTextInput("HTTP客户端"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new (BlocklyF as any).FieldTextInput("rest1"), "NODE_ID");
        config.appendField(new (BlocklyF as any).FieldTextInput("http://localhost:9099/api"), "REST_URL");
        config.appendField(
          new (BlocklyF as any).FieldDropdown([["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"], ["DELETE", "DELETE"]]),
          "REST_METHOD"
        );
        config.appendField(new (BlocklyF as any).FieldTextInput("{}"), "REST_HEADERS");
        config.appendField(new (BlocklyF as any).FieldTextInput("{}"), "REST_QUERY");
        config.appendField(new (BlocklyF as any).FieldTextInput(""), "REST_BODY");
        config.appendField(new (BlocklyF as any).FieldTextInput("30000"), "REST_TIMEOUT");
        config.appendField(new (BlocklyF as any).FieldTextInput("200"), "REST_MAX_PARALLEL");
        config.appendField(new (BlocklyF as any).FieldCheckbox(true), "DEBUG");
        (this as Block).appendStatementInput("branch_success").appendField("Success");
        (this as Block).appendStatementInput("branch_failure").appendField("Failure");
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block, helpers) {
    return {
      restEndpointUrlPattern: helpers.getFieldValue(block, "REST_URL"),
      requestMethod: helpers.getFieldValue(block, "REST_METHOD"),
      maxParallelRequestsCount: Number(helpers.getFieldValue(block, "REST_MAX_PARALLEL") || "0"),
      headers: helpers.parseJsonValue(helpers.getFieldValue(block, "REST_HEADERS"), {}),
      query: helpers.parseJsonValue(helpers.getFieldValue(block, "REST_QUERY"), {}),
      body: helpers.getFieldValue(block, "REST_BODY"),
      timeout: Number(helpers.getFieldValue(block, "REST_TIMEOUT") || "0"),
    };
  },
  setConfiguration(block, node) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.restEndpointUrlPattern ?? ""), "REST_URL");
    block.setFieldValue(String(c.requestMethod ?? "POST"), "REST_METHOD");
    block.setFieldValue(String(c.maxParallelRequestsCount ?? 0), "REST_MAX_PARALLEL");
    block.setFieldValue(JSON.stringify(c.headers ?? {}), "REST_HEADERS");
    block.setFieldValue(JSON.stringify(c.query ?? {}), "REST_QUERY");
    block.setFieldValue(String(c.body ?? ""), "REST_BODY");
    block.setFieldValue(String(c.timeout ?? 30000), "REST_TIMEOUT");
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
  getWalkInputs() {
    return ["branch_success", "branch_failure"];
  },
};

registerBlockType(def);
export default def;
