import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./shared/components";
import { RouteRewritePage } from "./modules/route-rewrite";
import { ModelManagementPage } from "./modules/model-management";
import { PlaceholderPage } from "./modules/placeholder";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/route-rewrite" replace />} />
          <Route path="/route-rewrite" element={<RouteRewritePage />} />
          <Route
            path="/api-tester"
            element={<PlaceholderPage title="API 调试" />}
          />
          <Route
            path="/codegen"
            element={<PlaceholderPage title="代码生成" />}
          />
          <Route
            path="/database"
            element={<PlaceholderPage title="数据库管理" />}
          />
          <Route path="/terminal" element={<PlaceholderPage title="终端" />} />
          <Route
            path="/mock-server"
            element={<PlaceholderPage title="Mock 服务" />}
          />
          <Route path="/settings/models" element={<ModelManagementPage />} />
          <Route
            path="*"
            element={<PlaceholderPage title="未找到页面" />}
          />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
