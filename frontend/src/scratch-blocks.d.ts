declare module "scratch-blocks" {
  import * as Blockly from "blockly/core";

  export enum ScratchBlocksTheme {
    CLASSIC = "classic",
    CAT_BLOCKS = "catblocks",
  }

  export interface ScratchBlocksOptions extends Blockly.BlocklyOptions {
    scratchTheme?: ScratchBlocksTheme;
  }

  export function inject(container: Element, options: ScratchBlocksOptions): Blockly.WorkspaceSvg;

  export const ScratchMsgs: {
    setLocale: (locale: string) => void;
  };

  export = Blockly;
}

declare module "monaco-editor/esm/vs/editor/editor.worker?worker" {
  const EditorWorker: new () => Worker;
  export default EditorWorker;
}
