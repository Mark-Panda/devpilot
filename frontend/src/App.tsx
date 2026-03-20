import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./shared/components";
import { RouteRewritePage } from "./modules/route-rewrite";
import { CurlComparePage } from "./modules/curl-compare";
import { ModelManagementPage } from "./modules/model-management";
import { RuleGoPage, RuleGoScratchEditorPage, RuleGoLogsPage, RuleGoLogDetailPage } from "./modules/rulego";
import { SkillRepoPage } from "./modules/skill-repo";
import { PlaceholderPage } from "./modules/placeholder";
import { AgentChatPage } from "./modules/agent/pages/AgentChatPage";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/agent" replace />} />
          <Route path="/agent" element={<AgentChatPage />} />
          <Route path="/route-rewrite" element={<RouteRewritePage />} />
          <Route path="/curl-compare" element={<CurlComparePage />} />
          <Route path="/terminal" element={<PlaceholderPage title="终端" />} />
          <Route path="/settings/models" element={<ModelManagementPage />} />
          <Route path="/rulego" element={<RuleGoPage />} />
          <Route path="/rulego/editor" element={<RuleGoScratchEditorPage />} />
          <Route path="/rulego/editor/:id" element={<RuleGoScratchEditorPage />} />
          <Route path="/rulego/logs" element={<RuleGoLogsPage />} />
          <Route path="/rulego/logs/:id" element={<RuleGoLogDetailPage />} />
          <Route path="/skill-repo" element={<SkillRepoPage />} />
          <Route
            path="*"
            element={<PlaceholderPage title="未找到页面" />}
          />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
