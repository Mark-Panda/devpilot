import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const menuItems: { path: string; label: string; end?: boolean }[] = [
  { path: "/route-rewrite", label: "重构路由管理" },
  { path: "/curl-compare", label: "接口对比" },
  { path: "/terminal", label: "终端" },
  { path: "/rulego", label: "RuleGo 规则管理", end: true },
  { path: "/rulego/logs", label: "RuleGo 执行日志" },
  { path: "/skill-repo", label: "技能仓库" },
  { path: "/settings/models", label: "模型管理" }
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
            {menuItems.map((item) => (
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
          </nav>
        </aside>
      )}
      <main className="app-content">{children}</main>
    </div>
  );
}
