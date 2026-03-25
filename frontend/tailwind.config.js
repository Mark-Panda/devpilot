/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}", "./src/**/*.mdx"],
  theme: {
    extend: {
      colors: {
        /** 与 globals.css 中工作室 .studio-pixel 主色一致，供各页 Tailwind 使用 */
        studio: {
          deep: "#08080e",
          bg: "#0f0f18",
          panel: "#18182a",
          "panel-2": "#222236",
          border: "#4a4d6a",
          hot: "#e94560",
          text: "#e8e8f0",
          muted: "#8b8ba4",
          code: "#12121c",
        },
      },
    },
  },
};
