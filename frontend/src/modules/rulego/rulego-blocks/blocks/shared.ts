import type { Block } from "blockly/core";
import type { BlockTypeCategory } from "../types";

export interface MinimalNodeOptions {
  defaultId: string;
  defaultName: string;
  script?: string;
  category: BlockTypeCategory;
  restFields?: Array<{ name: string; value: string; dropdown?: [string, string][] }>;
}

export function buildMinimalNodeInit(
  BlocklyF: { FieldTextInput: new (v: string) => unknown; FieldCheckbox: new (v: boolean) => unknown; FieldDropdown: new (opts: [string, string][]) => unknown },
  options: MinimalNodeOptions
) {
  return function (this: Block) {
    (this as Block).appendDummyInput("HEAD").appendField(new BlocklyF.FieldTextInput(options.defaultName) as never, "NODE_NAME");
    const config = (this as Block).appendDummyInput("CONFIG");
    config.appendField(new BlocklyF.FieldTextInput(options.defaultId) as never, "NODE_ID");
    if (options.script) config.appendField(new BlocklyF.FieldTextInput(options.script) as never, "JS_SCRIPT");
    if (options.restFields?.length) {
      options.restFields.forEach((f) => {
        if (f.dropdown) config.appendField(new BlocklyF.FieldDropdown(f.dropdown) as never, f.name);
        else config.appendField(new BlocklyF.FieldTextInput(f.value) as never, f.name);
      });
    }
    config.appendField(new BlocklyF.FieldCheckbox(true) as never, "DEBUG");
    config.appendField(
      new BlocklyF.FieldDropdown([["Success", "Success"], ["Failure", "Failure"], ["True", "True"], ["False", "False"]]) as never,
      "LINK_TYPE"
    );
    config.appendField(new BlocklyF.FieldTextInput("") as never, "LINK_LABEL");
    const configInput = (this as Block).getInput("CONFIG");
    if (configInput?.setVisible) configInput.setVisible(false);
    (this as Block).setPreviousStatement(true);
    (this as Block).setNextStatement(true);
    if (typeof (this as Block).setStyle === "function") (this as Block).setStyle(options.category);
  };
}
