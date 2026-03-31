# RuleGo 样例：Node→Go 重构证据链

## `node-to-go-harness-sample.definition.json`

可在 DevPilot **规则链编辑器** 中通过「导入 DSL」加载（导入后请将 `ruleChain.id` 改为库中唯一 id，或新建规则后粘贴 `metadata` 段落）。

链顺序说明：

1. **startTrigger**：手动触发。
2. **apiRouteTracer/gitPrepare**：填写真实 `gitlabUrl` 与 `workDir`；成功后 metadata 会有 `api_route_tracer_service_path`。
3. **refactor/apiIoContext**：`workDir` 留空则使用上一步 metadata；扫描常见 Node 路由目录，输出 `devpilot.refactor.apiIoContext/v1`。
4. **jsTransform**：把上一步的 `msg.data` 包进 `apiIoContext` 键，并从 metadata 读取 `refactor_tls_sample`、`refactor_os_sample`（可在执行前通过请求参数注入，或改为 **fork** 并行接 `volcTls/searchLogs`、`opensearch/search` 再 **join** 合并）。
5. **refactor/evidencePack**：输出规范证据包 `devpilot.refactor.evidencePack/v1`，供下游 **ai/llm** 生成 `api-io-manifest` 等。

在 `ev_pack1` 之后可继续接 **ai/llm**、**cursor/acp_agent**、**exec**（需在 UI 中配置密钥与命令，不宜写死在本 JSON）。

## `evidence-pack-input.example.json`

展示若**单独**向 **refactor/evidencePack** 提供 `msg.data` 时应采用的 JSON 形状（键名与节点内 `pick*` 逻辑一致）。

## OpenSpec 目录模板

仓库内另有 `openspec/changes/_template-node-service-to-go/`，可复制后改 `change-id` 使用。
