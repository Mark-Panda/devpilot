/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}", "./src/**/*.mdx"],
  theme: {
    extend: {
      colors: {
        /** 与 globals.css :root / .studio-pixel 浅色主题一致（Tailwind 类名走此处，勿与旧深色混淆） */
        studio: {
          deep: "#f1f5f9",
          bg: "#f8fafc",
          panel: "#ffffff",
          "panel-2": "#f1f5f9",
          border: "#e2e8f0",
          hot: "#e11d48",
          "hot-hover": "#be123c",
          text: "#0f172a",
          muted: "#64748b",
          code: "#f1f5f9",
        },
      },
    },
  },
};
