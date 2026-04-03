/**
 * RuleGo 自由布局编辑器主页面
 * 
 * 基于 Flowgram.ai free-layout-editor 重写的规则链编辑器
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import {
  FreeLayoutEditorProvider,
  EditorRenderer,
  type FreeLayoutPluginContext,
} from '@flowgram.ai/free-layout-editor';
import '@flowgram.ai/free-layout-editor/index.css';
import './styles/index.css';

import { useRuleGoRules } from '../rulego/useRuleGoRules';
import { generateRuleGoPlan, type GenerateRuleGoPlanResult } from '../rulego/useRuleGoApi';
import { applyAgentSelectionsToDsl, buildAgentPreviewItems, type AgentPreviewItem } from '../rulego/agentPlanner';
import { getEnabledFromDefinition, isSubRuleChain, summarizeRuleNodesForAgent } from '../rulego/dslUtils';
import { listModelConfigs } from '../model-management/useModelConfigApi';
import type { ModelConfig } from '../model-management/types';
import { useRuleGoEditorProps } from './hooks/useRuleGoEditorProps';
import { rulegoNodeRegistries } from './nodes';
import { buildRuleGoDsl, formatDslError } from './dsl/buildRuleGoDsl';
import { loadRuleGoDsl } from './dsl/loadRuleGoDsl';
import type { RuleGoDsl } from './types/dsl';
import { RuleGoDslModals } from './components/RuleGoDslModals';
import { RuleGoEditorToolbar } from './components/RuleGoEditorToolbar';
import { RuleGoNodeConfigModal } from './components/RuleGoNodeConfigModal';
import { RuleGoNodePanel } from './components/RuleGoNodePanel';
import { RuleGoNodeConfigModalProvider } from './context/RuleGoNodeConfigModalContext';

/**
 * 主编辑器组件
 */
export default function RuleGoFreeEditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: routeRuleId } = useParams<{ id: string }>();
  const isDemoBlankCanvas = location.pathname.endsWith('/demo');

  const { rules, loading: rulesLoading, refresh, create, update } = useRuleGoRules();
  const editingRule = useMemo(
    () => (routeRuleId ? rules.find((r) => r.id === routeRuleId) : undefined),
    [rules, routeRuleId]
  );

  // 状态管理
  const [ruleName, setRuleName] = useState('新规则链');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [root, setRoot] = useState(true);
  
  const [currentDsl, setCurrentDsl] = useState('');
  const [savedDsl, setSavedDsl] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 每次 Flowgram onInit 递增，供「从路由加载 DSL」effect 在编辑器就绪后再跑 */
  const [editorSession, setEditorSession] = useState(0);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [exportText, setExportText] = useState('');

  const [agentRequirement, setAgentRequirement] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentPlanError, setAgentPlanError] = useState<string | null>(null);
  const [agentPlanResult, setAgentPlanResult] = useState<GenerateRuleGoPlanResult | null>(null);
  const [agentPreviewItems, setAgentPreviewItems] = useState<AgentPreviewItem[]>([]);
  const [agentSelectedIds, setAgentSelectedIds] = useState<Set<string>>(new Set());
  const [agentQuestionAnswers, setAgentQuestionAnswers] = useState<Record<string, string>>({});
  const [agentConversationHistory, setAgentConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [agentModelConfigs, setAgentModelConfigs] = useState<ModelConfig[]>([]);
  const [agentModelConfigId, setAgentModelConfigId] = useState('');
  const [agentModelName, setAgentModelName] = useState('');

  // 编辑器上下文引用
  const editorContextRef = useRef<FreeLayoutPluginContext | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const dslBuildDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAppliedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    loadAppliedForIdRef.current = null;
  }, [routeRuleId, isDemoBlankCanvas]);

  // 初始数据：带路由 id 时先空画布，由 DSL 加载；`/demo` 空白；否则展示内置示例
  const initialData = useMemo(() => {
    if (isDemoBlankCanvas) {
      return { nodes: [], edges: [] };
    }
    if (routeRuleId) {
      return { nodes: [], edges: [] };
    }
    return {
      nodes: [
        {
          id: 'http-trigger-initial',
          type: 'http-trigger',
          meta: {
            position: { x: 120, y: 160 },
          },
          data: {
            name: 'HTTP 端点',
            server: ':9090',
            allowCors: false,
            routerId: '',
            method: 'POST',
            path: '/api/v1/hook',
            to: 'chain:default',
            wait: false,
            toProcessors: '',
            extraRoutersJson: '',
          },
        },
        {
          id: 'start-trigger-initial',
          type: 'start-trigger',
          meta: {
            position: { x: 300, y: 200 },
          },
          data: {},
        },
        {
          id: 'rest-api-call-test',
          type: 'rest-api-call',
          meta: {
            position: { x: 550, y: 200 },
          },
          data: {
            restEndpointUrlPattern: 'http://localhost:9099/api/test',
            requestMethod: 'POST',
            headers: {},
            query: {},
            body: '',
            timeout: 30000,
            maxParallelRequestsCount: 200,
          },
        },
        {
          id: 'llm-test',
          type: 'llm',
          meta: {
            position: { x: 820, y: 160 },
          },
          data: {
            url: 'https://ai.gitee.com/v1',
            key: '',
            model: 'gpt-4o-mini',
            models: [],
            systemPrompt: 'You are a helpful assistant.',
            messages: [{ role: 'user', content: 'Hello' }],
            params: {
              temperature: 0.6,
              topP: 0.75,
              presencePenalty: 0,
              frequencyPenalty: 0,
              maxTokens: 2048,
              stop: [],
              responseFormat: 'text',
            },
            enabled_skill_names: [],
          },
        },
        {
          id: 'for-loop-test',
          type: 'for-loop',
          meta: {
            position: { x: 300, y: 350 },
          },
          data: {
            range: '1..5',
            do: '',
            mode: 0,
          },
        },
      ],
      edges: [
        {
          sourceNodeID: 'http-trigger-initial',
          targetNodeID: 'rest-api-call-test',
          sourcePortID: 'output',
          targetPortID: 'input',
        },
        {
          sourceNodeID: 'rest-api-call-test',
          targetNodeID: 'llm-test',
          sourcePortID: 'success',
          targetPortID: 'input',
        },
      ],
    };
  }, [isDemoBlankCanvas, routeRuleId]);

  const ruleNotFound =
    Boolean(routeRuleId) && !rulesLoading && !editingRule;

  const agentSupportedBackendTypes = useMemo(
    () =>
      [
        ...new Set(
          rulegoNodeRegistries
            .filter((r) => !String(r.backendNodeType).startsWith('internal:'))
            .map((r) => r.backendNodeType)
        ),
      ],
    []
  );

  const agentSelectedConfig = useMemo(
    () => agentModelConfigs.find((cfg) => cfg.id === agentModelConfigId) ?? null,
    [agentModelConfigs, agentModelConfigId]
  );

  const agentAvailableSubRuleChains = useMemo(
    () =>
      rules
        .filter((r) => isSubRuleChain(r.definition ?? '') && getEnabledFromDefinition(r.definition ?? ''))
        .filter((r) => r.id !== routeRuleId)
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: String(r.description ?? '').trim(),
          node_summary: summarizeRuleNodesForAgent(r.definition ?? ''),
        })),
    [rules, routeRuleId]
  );

  useEffect(() => {
    if (!agentModalOpen) return;
    void (async () => {
      try {
        const list = await listModelConfigs();
        setAgentModelConfigs(list);
        if (!agentModelConfigId && list.length > 0) {
          setAgentModelConfigId(list[0].id);
          setAgentModelName(list[0].models?.[0] ?? '');
        } else if (agentModelConfigId) {
          const current = list.find((c) => c.id === agentModelConfigId);
          if (current && current.models.length > 0 && !current.models.includes(agentModelName)) {
            setAgentModelName(current.models[0]);
          }
        }
      } catch (err) {
        setAgentPlanError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [agentModalOpen, agentModelConfigId, agentModelName]);

  // 编辑器配置
  const onEditorContentChange = useCallback(
    (ctx: any, _event: any) => {
      setUnsaved(true);
      if (dslBuildDebounceRef.current) clearTimeout(dslBuildDebounceRef.current);
      dslBuildDebounceRef.current = setTimeout(() => {
        dslBuildDebounceRef.current = null;
        try {
          buildRuleGoDsl(ctx, ruleName, { debugMode, root, enabled });
        } catch {
          /* 编辑中间态不提示；保存/导出时再校验 */
        }
      }, 1000);
    },
    [ruleName, debugMode, root, enabled]
  );

  const editorProps = useRuleGoEditorProps({
    initialData,
    nodeRegistries: rulegoNodeRegistries,
    onInit: (ctx) => {
      editorContextRef.current = ctx;
      setEditorSession((s) => s + 1);
      setTimeout(() => {
        try {
          ctx.tools?.fitView(false);
        } catch {
          /* ignore */
        }
      }, 400);
    },
    onContentChange: onEditorContentChange,
  });

  const applyLoadedDsl = useCallback((dsl: RuleGoDsl) => {
    const ctx = editorContextRef.current as FreeLayoutPluginContext | null;
    if (!ctx) {
      setError('编辑器未就绪，请稍后重试');
      return;
    }
    try {
      loadRuleGoDsl(dsl, ctx);
    } catch (e: unknown) {
      setError(formatDslError(e));
      return;
    }
    const name = dsl.ruleChain?.name?.trim() || '新规则链';
    setRuleName(name);
    const chain = dsl.ruleChain;
    if (chain && typeof chain === 'object') {
      setDebugMode(Boolean(chain.debugMode));
      setRoot(chain.root !== false);
      setEnabled(typeof chain.disabled === 'boolean' ? !chain.disabled : true);
    }
    const pretty = JSON.stringify(dsl, null, 2);
    setCurrentDsl(pretty);
    setSavedDsl(pretty);
    setUnsaved(false);
    setError(null);
  }, []);

  /** 从规则列表加载 definition（与后端执行一致的 DSL） */
  useEffect(() => {
    if (!routeRuleId || editorSession === 0 || !editorContextRef.current) return;
    if (loadAppliedForIdRef.current === routeRuleId) return;
    const r = rules.find((x) => x.id === routeRuleId);
    if (!r) return;
    if (!r.definition?.trim()) {
      setError('该规则缺少 definition，无法加载');
      return;
    }
    loadAppliedForIdRef.current = routeRuleId;
    try {
      const dsl = JSON.parse(r.definition) as RuleGoDsl;
      if (!dsl?.metadata) {
        throw new Error('无效的 DSL：缺少 metadata');
      }
      applyLoadedDsl(dsl);
      setDescription(r.description ?? '');
    } catch (e: unknown) {
      loadAppliedForIdRef.current = null;
      setError(formatDslError(e));
    }
  }, [routeRuleId, editorSession, rules, applyLoadedDsl]);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result ?? '');
          const dsl = JSON.parse(text) as RuleGoDsl;
          if (!dsl?.metadata) {
            throw new Error('无效的 DSL：缺少 metadata');
          }
          applyLoadedDsl(dsl);
        } catch (err: unknown) {
          setError(`导入失败: ${formatDslError(err)}`);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    },
    [applyLoadedDsl]
  );

  const refreshExportText = useCallback(() => {
    const ctx = editorContextRef.current as FreeLayoutPluginContext | null;
    if (!ctx) {
      setExportText('');
      return;
    }
    try {
      setExportText(
        buildRuleGoDsl(ctx, ruleName, {
          debugMode,
          root,
          enabled,
        })
      );
    } catch {
      setExportText('');
    }
  }, [ruleName, debugMode, root, enabled]);

  const handleAgentGenerate = useCallback(
    async (opts?: { promptText?: string }) => {
      const prompt = (opts?.promptText ?? agentRequirement).trim();
      if (!prompt) {
        setAgentPlanError('请先输入需求描述');
        return;
      }
      const ctx = editorContextRef.current as FreeLayoutPluginContext | null;
      if (!ctx) {
        setAgentPlanError('编辑器未就绪');
        return;
      }
      if (!agentSelectedConfig || !agentModelName.trim()) {
        setAgentPlanError('请选择可用模型配置与模型后再生成预览');
        return;
      }
      setAgentLoading(true);
      setAgentPlanError(null);
      try {
        const currentDsl = buildRuleGoDsl(ctx, ruleName, { debugMode, root, enabled });
        const plan = await generateRuleGoPlan({
          prompt,
          current_dsl: currentDsl || '',
          node_types: agentSupportedBackendTypes,
          available_sub_rule_chains: agentAvailableSubRuleChains,
          conversation_history: agentConversationHistory,
          base_url: agentSelectedConfig.baseUrl,
          api_key: agentSelectedConfig.apiKey,
          model: agentModelName.trim(),
          fallback_models: agentSelectedConfig.models.filter((m) => m !== agentModelName.trim()),
        });
        setAgentPlanResult(plan);
        setAgentQuestionAnswers((prev) => {
          const qs = plan.questions ?? [];
          const next: Record<string, string> = {};
          for (const q of qs) {
            if (Object.prototype.hasOwnProperty.call(prev, q)) next[q] = prev[q]!;
          }
          return next;
        });
        setAgentConversationHistory((prev) => [
          ...prev,
          { role: 'user', content: prompt },
          { role: 'assistant', content: plan.thought?.trim() || '已分析需求并返回规划结果。' },
        ]);
        const preview = buildAgentPreviewItems(plan, new Set(agentSupportedBackendTypes));
        setAgentPreviewItems(preview);
        const defaults = preview.filter((item) => item.valid && item.confidence >= 0.6).map((item) => item.id);
        setAgentSelectedIds(new Set(defaults));
      } catch (err) {
        setAgentPlanError(err instanceof Error ? err.message : String(err));
      } finally {
        setAgentLoading(false);
      }
    },
    [
      agentRequirement,
      agentSelectedConfig,
      agentModelName,
      agentSupportedBackendTypes,
      agentAvailableSubRuleChains,
      agentConversationHistory,
      ruleName,
      debugMode,
      root,
      enabled,
    ]
  );

  const handleSubmitAgentAnswers = useCallback(async () => {
    if (!agentPlanResult?.questions?.length) return;
    const qaPairs = agentPlanResult.questions
      .map((q) => {
        const a = String(agentQuestionAnswers[q] ?? '').trim();
        if (!a) return '';
        return `问题: ${q}\n回答: ${a}`;
      })
      .filter(Boolean);
    if (qaPairs.length === 0) {
      setAgentPlanError('请至少回答一个 Agent 追问');
      return;
    }
    const mergedPrompt = [agentRequirement.trim(), ...qaPairs].filter(Boolean).join('\n\n');
    setAgentRequirement(mergedPrompt);
    await handleAgentGenerate({ promptText: mergedPrompt });
  }, [agentPlanResult, agentQuestionAnswers, agentRequirement, handleAgentGenerate]);

  const handleAgentApply = useCallback(() => {
    const ctx = editorContextRef.current as FreeLayoutPluginContext | null;
    if (!ctx) {
      setAgentPlanError('编辑器未就绪');
      return;
    }
    try {
      const currentDslText = buildRuleGoDsl(ctx, ruleName, { debugMode, root, enabled });
      const merged = applyAgentSelectionsToDsl(currentDslText, agentPreviewItems, agentSelectedIds) as RuleGoDsl;
      loadRuleGoDsl(merged, ctx);
      const chain = merged.ruleChain;
      if (chain && typeof chain === 'object') {
        setDebugMode(Boolean(chain.debugMode));
        setRoot(chain.root !== false);
        setEnabled(typeof chain.disabled === 'boolean' ? !chain.disabled : true);
      }
      const nm = merged.ruleChain?.name?.trim();
      if (nm) setRuleName(nm);
      setCurrentDsl(JSON.stringify(merged, null, 2));
      setUnsaved(true);
      setAgentModalOpen(false);
      setAgentPlanResult(null);
      setAgentPreviewItems([]);
      setAgentSelectedIds(new Set());
      setAgentQuestionAnswers({});
      setAgentPlanError(null);
      setAgentConversationHistory([]);
    } catch (e: unknown) {
      setAgentPlanError(formatDslError(e));
    }
  }, [ruleName, debugMode, root, enabled, agentPreviewItems, agentSelectedIds]);

  const toggleAgentPreviewId = useCallback((id: string, checked: boolean) => {
    setAgentSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSave = async () => {
    const ctx = editorContextRef.current;
    if (!ctx) {
      setError('编辑器未就绪');
      return;
    }
    const trimmedName = ruleName.trim();
    if (!trimmedName) {
      setError('规则名称不能为空');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const nextDsl = buildRuleGoDsl(ctx, trimmedName, {
        debugMode,
        root,
        enabled,
      }).trim();
      if (!nextDsl) {
        setError('DSL 不能为空');
        return;
      }

      const editorJsonPayload = JSON.stringify(ctx.document.toJSON(), null, 2);
      if (!editorJsonPayload.trim()) {
        setError('编辑器 JSON 不能为空');
        return;
      }

      if (editingRule) {
        await update(editingRule.id, {
          name: trimmedName,
          description: String(description).trim(),
          definition: nextDsl,
          editorJson: editorJsonPayload,
          requestMetadataParamsJson: editingRule.requestMetadataParamsJson ?? '[]',
          requestMessageBodyParamsJson: editingRule.requestMessageBodyParamsJson ?? '[]',
          responseMessageBodyParamsJson: editingRule.responseMessageBodyParamsJson ?? '[]',
        });
      } else {
        const created = await create({
          name: trimmedName,
          description: String(description).trim(),
          definition: nextDsl,
          editorJson: editorJsonPayload,
          requestMetadataParamsJson: '[]',
          requestMessageBodyParamsJson: '[]',
          responseMessageBodyParamsJson: '[]',
        });
        const newId = (created.id ?? '').trim();
        if (!newId) {
          throw new Error('未获得新规则 ID');
        }
        setCurrentDsl(nextDsl);
        setSavedDsl(nextDsl);
        setUnsaved(false);
        queueMicrotask(() => {
          navigate(`/rulego/editor-v2/${newId}`, { replace: true });
        });
        return;
      }

      setCurrentDsl(nextDsl);
      setSavedDsl(nextDsl);
      setUnsaved(false);
    } catch (err: unknown) {
      setError(formatDslError(err) || '保存失败');
      console.error('Save failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const agentQuestionTotal = agentPlanResult?.questions?.length ?? 0;
  const agentQuestionAnswered = (agentPlanResult?.questions ?? []).filter(
    (q) => String(agentQuestionAnswers[q] ?? '').trim().length > 0
  ).length;
  const agentAllQuestionsAnswered = agentQuestionTotal > 0 && agentQuestionAnswered === agentQuestionTotal;
  const agentApplyBlockedByClarification =
    agentPlanResult?.need_clarification === true && agentQuestionTotal > 0 && !agentAllQuestionsAnswered;
  const agentHasApplicableSelection = agentPreviewItems.some((i) => i.valid && agentSelectedIds.has(i.id));
  const agentApplyDisabled = agentApplyBlockedByClarification || !agentHasApplicableSelection;
  const agentApplyDisabledTitle = agentApplyBlockedByClarification
    ? '请先回答 Agent 追问后再应用'
    : !agentHasApplicableSelection
      ? '请至少勾选一项有效预览'
      : undefined;
  const agentGenerateDisabled = agentLoading || !agentSelectedConfig || !agentModelName.trim();

  return (
    <div
      className="rulego-free-page"
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}
    >
      <input
        ref={importFileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {rulesLoading ? (
        <div
          style={{
            padding: '8px 20px',
            background: 'var(--semi-color-fill-0)',
            fontSize: 12,
            color: 'var(--semi-color-text-2)',
            flexShrink: 0,
          }}
        >
          正在加载规则列表…
        </div>
      ) : null}

      {ruleNotFound ? (
        <div
          style={{
            padding: '12px 20px',
            background: '#fef3c7',
            color: '#92400e',
            borderBottom: '1px solid #fde68a',
            flexShrink: 0,
          }}
        >
          未找到 ID 为「{routeRuleId}」的规则，请从规则列表打开或确认已保存。
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            padding: '12px 20px',
            background: '#fee2e2',
            color: '#dc2626',
            borderBottom: '1px solid #fecaca',
            flexShrink: 0,
          }}
        >
          ⚠️ {error}
        </div>
      ) : null}

      <FreeLayoutEditorProvider key={routeRuleId ?? (isDemoBlankCanvas ? 'demo' : 'new')} {...editorProps}>
        <RuleGoNodeConfigModalProvider>
          <RuleGoEditorToolbar
            ruleName={ruleName}
            onRuleNameChange={setRuleName}
            unsaved={unsaved}
            loading={loading}
            onImportFile={() => importFileRef.current?.click()}
            onOpenImportModal={() => setImportModalOpen(true)}
            onOpenExportModal={() => {
              refreshExportText();
              setExportModalOpen(true);
            }}
            onOpenAgentModal={() => setAgentModalOpen(true)}
            onSave={handleSave}
          />
          <div
            className="rulego-free-editor-main"
            style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}
          >
            <RuleGoNodePanel nodeRegistries={rulegoNodeRegistries} />
            <div className="rulego-free-editor-canvas" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              <EditorRenderer className="rulego-free-editor" />
            </div>
          </div>
          <RuleGoNodeConfigModal />
          <RuleGoDslModals
          importOpen={importModalOpen}
          exportOpen={exportModalOpen}
          agentOpen={agentModalOpen}
          onImportOpenChange={setImportModalOpen}
          onExportOpenChange={setExportModalOpen}
          onAgentOpenChange={(open) => {
            setAgentModalOpen(open);
            if (!open) {
              setAgentRequirement('');
              setAgentPlanError(null);
              setAgentPlanResult(null);
              setAgentPreviewItems([]);
              setAgentSelectedIds(new Set());
              setAgentQuestionAnswers({});
              setAgentConversationHistory([]);
            }
          }}
          exportText={exportText}
          onApplyImport={applyLoadedDsl}
          onError={setError}
          agentPlan={{
            prompt: agentRequirement,
            onPromptChange: setAgentRequirement,
            loading: agentLoading,
            error: agentPlanError,
            modelConfigs: agentModelConfigs,
            modelConfigId: agentModelConfigId,
            onModelConfigIdChange: setAgentModelConfigId,
            modelName: agentModelName,
            onModelNameChange: setAgentModelName,
            planResult: agentPlanResult,
            previewItems: agentPreviewItems,
            selectedIds: agentSelectedIds,
            onTogglePreviewId: toggleAgentPreviewId,
            questionAnswers: agentQuestionAnswers,
            onQuestionAnswerChange: (q, a) => {
              setAgentQuestionAnswers((prev) => ({ ...prev, [q]: a }));
            },
            onGenerate: () => void handleAgentGenerate(),
            onApply: handleAgentApply,
            onSubmitAnswers: () => void handleSubmitAgentAnswers(),
            generateDisabled: agentGenerateDisabled,
            applyDisabled: agentApplyDisabled,
            applyDisabledTitle: agentApplyDisabledTitle,
          }}
        />
        </RuleGoNodeConfigModalProvider>
      </FreeLayoutEditorProvider>
    </div>
  );
}
