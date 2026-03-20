/** PostCSS：必须配置 tailwindcss，否则 Vite 生产构建会原样输出 @tailwind 指令，所有 Tailwind 类在打包后失效 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
