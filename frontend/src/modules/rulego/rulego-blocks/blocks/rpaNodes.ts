/**
 * RPA 组件：Chrome 远程调试（CDP）、Tesseract OCR、macOS 截屏/窗口/桌面点击。
 */
import type { Block } from "blockly/core";
import type { BlockTypeDef, BlockHelpers } from "../types";
import { registerBlockType } from "../registry";
import { UI_RELATION_FAILURE } from "../../relationLabels";

const category = "rulego_rpa" as const;

const branchFailure = {
  getConnectionBranches() {
    return [
      { inputName: "__next__", connectionType: "Success" },
      { inputName: "branch_failure", connectionType: "Failure" },
    ];
  },
  getInputNameForConnectionType(type: string) {
    return type === "Failure" ? "branch_failure" : undefined;
  },
  getWalkInputs() {
    return ["__next__", "branch_failure"];
  },
  defaultConnectionType: "Success" as const,
};

const defaultDebugger = "http://127.0.0.1:9222";

const rpaBrowserNavigate: BlockTypeDef = {
  blockType: "rulego_rpaBrowserNavigate",
  nodeType: "x/rpaBrowserNavigate",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as { FieldTextInput: new (v: string) => unknown };
    blocks[rpaBrowserNavigate.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("浏览器打开URL"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("rpaNav1"), "NODE_ID");
        config.appendField(new F.FieldTextInput(defaultDebugger), "RPA_DEBUGGER_URL");
        config.appendField(new F.FieldTextInput("https://example.com"), "RPA_URL");
        config.appendField(new F.FieldTextInput("30000"), "RPA_TIMEOUT_MS");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      debuggerUrl: helpers.getFieldValue(block, "RPA_DEBUGGER_URL") || defaultDebugger,
      url: helpers.getFieldValue(block, "RPA_URL"),
      timeoutMs: Number(helpers.getFieldValue(block, "RPA_TIMEOUT_MS")) || 30000,
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.debuggerUrl ?? defaultDebugger), "RPA_DEBUGGER_URL");
    block.setFieldValue(String(c.url ?? "https://example.com"), "RPA_URL");
    block.setFieldValue(String(c.timeoutMs ?? "30000"), "RPA_TIMEOUT_MS");
  },
  ...branchFailure,
};

const rpaBrowserClick: BlockTypeDef = {
  blockType: "rulego_rpaBrowserClick",
  nodeType: "x/rpaBrowserClick",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as {
      FieldTextInput: new (v: string) => unknown;
      FieldDropdown: new (opts: [string, string][]) => unknown;
    };
    blocks[rpaBrowserClick.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("浏览器点击"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("rpaClk1"), "NODE_ID");
        config.appendField(new F.FieldTextInput(defaultDebugger), "RPA_DEBUGGER_URL");
        config.appendField(new F.FieldTextInput("button.submit"), "RPA_SELECTOR");
        config.appendField(new F.FieldDropdown([["左键", "left"], ["右键", "right"]]), "RPA_BUTTON");
        config.appendField(new F.FieldTextInput("30000"), "RPA_TIMEOUT_MS");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      debuggerUrl: helpers.getFieldValue(block, "RPA_DEBUGGER_URL") || defaultDebugger,
      selector: helpers.getFieldValue(block, "RPA_SELECTOR"),
      button: helpers.getFieldValue(block, "RPA_BUTTON") || "left",
      timeoutMs: Number(helpers.getFieldValue(block, "RPA_TIMEOUT_MS")) || 30000,
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.debuggerUrl ?? defaultDebugger), "RPA_DEBUGGER_URL");
    block.setFieldValue(String(c.selector ?? "button.submit"), "RPA_SELECTOR");
    block.setFieldValue(String(c.button ?? "left"), "RPA_BUTTON");
    block.setFieldValue(String(c.timeoutMs ?? "30000"), "RPA_TIMEOUT_MS");
  },
  ...branchFailure,
};

const rpaBrowserScreenshot: BlockTypeDef = {
  blockType: "rulego_rpaBrowserScreenshot",
  nodeType: "x/rpaBrowserScreenshot",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as { FieldTextInput: new (v: string) => unknown };
    blocks[rpaBrowserScreenshot.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("浏览器截图"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("rpaShot1"), "NODE_ID");
        config.appendField(new F.FieldTextInput(defaultDebugger), "RPA_DEBUGGER_URL");
        config.appendField(new F.FieldTextInput(""), "RPA_SELECTOR");
        config.appendField(new F.FieldTextInput("30000"), "RPA_TIMEOUT_MS");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      debuggerUrl: helpers.getFieldValue(block, "RPA_DEBUGGER_URL") || defaultDebugger,
      selector: helpers.getFieldValue(block, "RPA_SELECTOR"),
      timeoutMs: Number(helpers.getFieldValue(block, "RPA_TIMEOUT_MS")) || 30000,
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.debuggerUrl ?? defaultDebugger), "RPA_DEBUGGER_URL");
    block.setFieldValue(String(c.selector ?? ""), "RPA_SELECTOR");
    block.setFieldValue(String(c.timeoutMs ?? "30000"), "RPA_TIMEOUT_MS");
  },
  ...branchFailure,
};

const rpaBrowserQuery: BlockTypeDef = {
  blockType: "rulego_rpaBrowserQuery",
  nodeType: "x/rpaBrowserQuery",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as {
      FieldTextInput: new (v: string) => unknown;
      FieldDropdown: new (opts: [string, string][]) => unknown;
    };
    blocks[rpaBrowserQuery.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("浏览器选择器查询"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("rpaQ1"), "NODE_ID");
        config.appendField(new F.FieldTextInput(defaultDebugger), "RPA_DEBUGGER_URL");
        config.appendField(new F.FieldTextInput("h1"), "RPA_SELECTOR");
        config.appendField(
          new F.FieldDropdown([
            ["文本 text", "text"],
            ["HTML", "html"],
            ["输入值 value", "value"],
            ["属性 attr", "attr"],
          ]),
          "RPA_QUERY_MODE"
        );
        config.appendField(new F.FieldTextInput("href"), "RPA_ATTRIBUTE_NAME");
        config.appendField(new F.FieldTextInput("30000"), "RPA_TIMEOUT_MS");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      debuggerUrl: helpers.getFieldValue(block, "RPA_DEBUGGER_URL") || defaultDebugger,
      selector: helpers.getFieldValue(block, "RPA_SELECTOR"),
      queryMode: helpers.getFieldValue(block, "RPA_QUERY_MODE") || "text",
      attributeName: helpers.getFieldValue(block, "RPA_ATTRIBUTE_NAME"),
      timeoutMs: Number(helpers.getFieldValue(block, "RPA_TIMEOUT_MS")) || 30000,
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.debuggerUrl ?? defaultDebugger), "RPA_DEBUGGER_URL");
    block.setFieldValue(String(c.selector ?? "h1"), "RPA_SELECTOR");
    block.setFieldValue(String(c.queryMode ?? "text"), "RPA_QUERY_MODE");
    block.setFieldValue(String(c.attributeName ?? "href"), "RPA_ATTRIBUTE_NAME");
    block.setFieldValue(String(c.timeoutMs ?? "30000"), "RPA_TIMEOUT_MS");
  },
  ...branchFailure,
};

const rpaOcr: BlockTypeDef = {
  blockType: "rulego_rpaOcr",
  nodeType: "x/rpaOcr",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as { FieldTextInput: new (v: string) => unknown };
    blocks[rpaOcr.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("OCR 识别"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("rpaOcr1"), "NODE_ID");
        config.appendField(new F.FieldTextInput(""), "RPA_IMAGE_PATH");
        config.appendField(new F.FieldTextInput("eng"), "RPA_OCR_LANG");
        config.appendField(new F.FieldTextInput("tesseract"), "RPA_TESSERACT_PATH");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      imagePath: helpers.getFieldValue(block, "RPA_IMAGE_PATH"),
      lang: helpers.getFieldValue(block, "RPA_OCR_LANG") || "eng",
      tesseractPath: helpers.getFieldValue(block, "RPA_TESSERACT_PATH") || "tesseract",
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.imagePath ?? ""), "RPA_IMAGE_PATH");
    block.setFieldValue(String(c.lang ?? "eng"), "RPA_OCR_LANG");
    block.setFieldValue(String(c.tesseractPath ?? "tesseract"), "RPA_TESSERACT_PATH");
  },
  ...branchFailure,
};

const rpaScreenCapture: BlockTypeDef = {
  blockType: "rulego_rpaScreenCapture",
  nodeType: "x/rpaScreenCapture",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as {
      FieldTextInput: new (v: string) => unknown;
      FieldDropdown: new (opts: [string, string][]) => unknown;
    };
    blocks[rpaScreenCapture.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("屏幕截图"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("rpaCap1"), "NODE_ID");
        config.appendField(new F.FieldDropdown([["全屏", "full"], ["区域", "region"]]), "RPA_CAPTURE_MODE");
        config.appendField(new F.FieldTextInput("0"), "RPA_REGION_TOP");
        config.appendField(new F.FieldTextInput("0"), "RPA_REGION_LEFT");
        config.appendField(new F.FieldTextInput("800"), "RPA_REGION_W");
        config.appendField(new F.FieldTextInput("600"), "RPA_REGION_H");
        config.appendField(new F.FieldTextInput(""), "RPA_CAPTURE_OUTPUT_PATH");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      mode: helpers.getFieldValue(block, "RPA_CAPTURE_MODE") || "full",
      top: Number(helpers.getFieldValue(block, "RPA_REGION_TOP")) || 0,
      left: Number(helpers.getFieldValue(block, "RPA_REGION_LEFT")) || 0,
      width: Number(helpers.getFieldValue(block, "RPA_REGION_W")) || 0,
      height: Number(helpers.getFieldValue(block, "RPA_REGION_H")) || 0,
      outputPath: helpers.getFieldValue(block, "RPA_CAPTURE_OUTPUT_PATH"),
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.mode ?? "full"), "RPA_CAPTURE_MODE");
    block.setFieldValue(String(c.top ?? "0"), "RPA_REGION_TOP");
    block.setFieldValue(String(c.left ?? "0"), "RPA_REGION_LEFT");
    block.setFieldValue(String(c.width ?? "800"), "RPA_REGION_W");
    block.setFieldValue(String(c.height ?? "600"), "RPA_REGION_H");
    block.setFieldValue(String(c.outputPath ?? ""), "RPA_CAPTURE_OUTPUT_PATH");
  },
  ...branchFailure,
};

const rpaMacWindow: BlockTypeDef = {
  blockType: "rulego_rpaMacWindow",
  nodeType: "x/rpaMacWindow",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as {
      FieldTextInput: new (v: string) => unknown;
      FieldDropdown: new (opts: [string, string][]) => unknown;
    };
    blocks[rpaMacWindow.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("macOS 窗口"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("rpaWin1"), "NODE_ID");
        config.appendField(
          new F.FieldDropdown([
            ["前置窗口信息", "frontmost"],
            ["激活应用", "activate"],
            ["列出窗口", "list"],
          ]),
          "RPA_MAC_ACTION"
        );
        config.appendField(new F.FieldTextInput(""), "RPA_MAC_APP");
        config.appendField(new F.FieldTextInput(""), "RPA_MAC_WINDOW_TITLE");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      action: helpers.getFieldValue(block, "RPA_MAC_ACTION") || "frontmost",
      appName: helpers.getFieldValue(block, "RPA_MAC_APP"),
      windowTitle: helpers.getFieldValue(block, "RPA_MAC_WINDOW_TITLE"),
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.action ?? "frontmost"), "RPA_MAC_ACTION");
    block.setFieldValue(String(c.appName ?? ""), "RPA_MAC_APP");
    block.setFieldValue(String(c.windowTitle ?? ""), "RPA_MAC_WINDOW_TITLE");
  },
  ...branchFailure,
};

const rpaDesktopClick: BlockTypeDef = {
  blockType: "rulego_rpaDesktopClick",
  nodeType: "x/rpaDesktopClick",
  category,
  register(ScratchBlocks, BlocklyF) {
    const blocks = (ScratchBlocks as { Blocks: Record<string, object> }).Blocks;
    const F = BlocklyF as { FieldTextInput: new (v: string) => unknown };
    blocks[rpaDesktopClick.blockType] = {
      init: function (this: Block) {
        (this as Block).appendDummyInput("HEAD").appendField(new F.FieldTextInput("桌面坐标点击"), "NODE_NAME");
        const config = (this as Block).appendDummyInput("CONFIG");
        config.appendField(new F.FieldTextInput("rpaDclk1"), "NODE_ID");
        config.appendField(new F.FieldTextInput("100"), "RPA_CLICK_X");
        config.appendField(new F.FieldTextInput("100"), "RPA_CLICK_Y");
        (this as Block).appendStatementInput("branch_failure").appendField(UI_RELATION_FAILURE);
        const configInput = (this as Block).getInput("CONFIG");
        if (configInput?.setVisible) configInput.setVisible(false);
        (this as Block).setPreviousStatement(true);
        (this as Block).setNextStatement(true);
        if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(category);
      },
    };
  },
  getConfiguration(block: Block, helpers: BlockHelpers) {
    return {
      x: helpers.getFieldValue(block, "RPA_CLICK_X") || "0",
      y: helpers.getFieldValue(block, "RPA_CLICK_Y") || "0",
    };
  },
  setConfiguration(block: Block, node: { configuration?: Record<string, unknown> }) {
    const c = node.configuration ?? {};
    block.setFieldValue(String(c.x ?? "100"), "RPA_CLICK_X");
    block.setFieldValue(String(c.y ?? "100"), "RPA_CLICK_Y");
  },
  ...branchFailure,
};

registerBlockType(rpaBrowserNavigate);
registerBlockType(rpaBrowserClick);
registerBlockType(rpaBrowserScreenshot);
registerBlockType(rpaBrowserQuery);
registerBlockType(rpaOcr);
registerBlockType(rpaScreenCapture);
registerBlockType(rpaMacWindow);
registerBlockType(rpaDesktopClick);

export default {
  rpaBrowserNavigate,
  rpaBrowserClick,
  rpaBrowserScreenshot,
  rpaBrowserQuery,
  rpaOcr,
  rpaScreenCapture,
  rpaMacWindow,
  rpaDesktopClick,
};
