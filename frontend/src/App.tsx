import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./shared/components";
import { RouteRewritePage } from "./modules/route-rewrite";
import { CurlComparePage } from "./modules/curl-compare";
import { ModelManagementPage } from "./modules/model-management";
import {
  RuleGoPage,
  RuleGoScratchEditorPage,
  RuleGoLogsPage,
  RuleGoLogDetailPage,
  RuleGoExecuteRulePage,
} from "./modules/rulego";
import { RuleGoFreeEditorPage } from "./modules/rulego-free";

/** `VITE_RULEGO_USE_FREE_LAYOUT=true` 时主规则链编辑路由走 Flowgram；默认 Blockly Scratch */
const RuleGoMainEditorPage =
  import.meta.env.VITE_RULEGO_USE_FREE_LAYOUT === "true"
    ? RuleGoFreeEditorPage
    : RuleGoScratchEditorPage;
import { SkillRepoPage } from "./modules/skill-repo";
import { PlaceholderPage } from "./modules/placeholder";
import { AgentChatPage } from "./modules/agent/pages/AgentChatPage";
import { AgentManagementPage } from "./modules/agent/pages/AgentManagementPage";
import { MCPManagementPage } from "./modules/agent/pages/MCPManagementPage";
import { StudioListPage } from "./modules/studio/pages/StudioListPage";
import { StudioWorkspacePage } from "./modules/studio/pages/StudioWorkspacePage";
import { WorkspacePage } from "./modules/workspace";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/agent" replace />} />
          <Route path="/agent" element={<AgentChatPage />} />
          <Route path="/studios" element={<StudioListPage />} />
          <Route path="/studios/:studioId" element={<StudioWorkspacePage />} />
          <Route path="/route-rewrite" element={<RouteRewritePage />} />
          <Route path="/curl-compare" element={<CurlComparePage />} />
          <Route path="/terminal" element={<PlaceholderPage title="终端" />} />
          <Route path="/settings/models" element={<ModelManagementPage />} />
          <Route path="/settings/agents" element={<AgentManagementPage />} />
          <Route path="/settings/mcp" element={<MCPManagementPage />} />
          <Route path="/settings/workspaces" element={<WorkspacePage />} />
          <Route path="/rulego" element={<RuleGoPage />} />
          <Route path="/rulego/editor" element={<RuleGoMainEditorPage />} />
          <Route path="/rulego/editor/:id" element={<RuleGoMainEditorPage />} />
          <Route path="/rulego/editor-v2/demo" element={<RuleGoFreeEditorPage />} />
          <Route path="/rulego/editor-v2" element={<RuleGoFreeEditorPage />} />
          <Route path="/rulego/editor-v2/:id" element={<RuleGoFreeEditorPage />} />
          <Route path="/rulego/execute" element={<RuleGoExecuteRulePage />} />
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
