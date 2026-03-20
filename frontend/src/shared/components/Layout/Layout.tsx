import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const menuGroups: { group?: string; items: { path: string; label: string; end?: boolean }[] }[] = [
  {
    items: [
      { path: "/agent", label: "聊天" },
      { path: "/studios", label: "工作室" },
    ],
  },
  {
    group: "控制",
    items: [
      { path: "/route-rewrite", label: "重构路由管理" },
      { path: "/curl-compare", label: "接口对比" },
      { path: "/terminal", label: "终端" },
    ],
  },
  {
    group: "规则引擎",
    items: [
      { path: "/rulego", label: "RuleGo 规则管理", end: true },
      { path: "/rulego/logs", label: "RuleGo 执行日志" },
    ],
  },
  {
    group: "设置",
    items: [
      { path: "/skill-repo", label: "技能仓库" },
      { path: "/settings/agents", label: "Agent 管理" },
      { path: "/settings/mcp", label: "MCP 配置" },
      { path: "/settings/models", label: "模型管理" },
    ],
  },
];

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isRuleGoEditor = location.pathname.startsWith("/rulego/editor");
  const isChatRoute =
    location.pathname === "/agent" || location.pathname.startsWith("/studios");
  /** OpenClaw 风格浅色侧栏 + 主区底（RuleGo 全屏编辑器除外） */
  const openClawChrome = !isRuleGoEditor;

  return (
    <div
      className={`app-shell${isRuleGoEditor ? " app-shell-full" : ""}${openClawChrome ? " app-shell--openclaw" : ""}`}
    >
      {!isRuleGoEditor && (
        <aside className={`app-sidebar${openClawChrome ? " app-sidebar--openclaw" : ""}`}>
          <div className="app-brand">
            <img src="/devpilot-logo.png" alt="DevPilot" className="app-brand-logo" />
          </div>
          <nav className="app-nav">
            {menuGroups.map((group, gi) => (
              <div key={gi} className="app-nav-group">
                {group.group && (
                  <div className="app-nav-group-label">{group.group}</div>
                )}
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end ?? false}
                    className={({ isActive }) =>
                      `app-nav-item${isActive ? " is-active" : ""}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="app-version">
            <span className="app-version-dot" />
            版本 v0.1.0
          </div>
        </aside>
      )}
      <main className={`app-content${isChatRoute ? " app-content--chat" : ""}`}>
        <div className={`app-route${isChatRoute ? " app-route--chat-fill" : ""}`}>{children}</div>
      </main>
    </div>
  );
}
