import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const menuGroups: { group?: string; items: { path: string; label: string; end?: boolean }[] }[] = [
  {
    items: [
      { path: "/agent", label: "聊天" },
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

  return (
    <div className={`app-shell${isRuleGoEditor ? " app-shell-full" : ""}`}>
      {!isRuleGoEditor && (
        <aside className="app-sidebar">
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
      <main className="app-content">{children}</main>
    </div>
  );
}
