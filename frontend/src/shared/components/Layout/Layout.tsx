import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const menuItems = [
  { path: "/route-rewrite", label: "重构路由管理" },
  { path: "/api-tester", label: "API 调试" },
  { path: "/codegen", label: "代码生成" },
  { path: "/database", label: "数据库管理" },
  { path: "/terminal", label: "终端" },
  { path: "/mock-server", label: "Mock 服务" },
  { path: "/rulego", label: "RuleGo 规则管理" },
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
          <div className="app-brand">DevPilot</div>
          <nav className="app-nav">
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
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
