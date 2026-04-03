/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 为 `true` 时 `/rulego/editor` 与 `/rulego/editor/:id` 使用 Flowgram 编辑器（默认仍为 Scratch） */
  readonly VITE_RULEGO_USE_FREE_LAYOUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
