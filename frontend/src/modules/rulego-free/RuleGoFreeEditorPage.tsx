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
import { useRuleGoEditorProps } from './hooks/useRuleGoEditorProps';
import { rulegoNodeRegistries } from './nodes';
import { buildRuleGoDsl, formatDslError } from './dsl/buildRuleGoDsl';
import { loadRuleGoDsl } from './dsl/loadRuleGoDsl';
import type { RuleGoDsl } from './types/dsl';
import { RuleGoConfigSidebar } from './components/RuleGoConfigSidebar';
import { RuleGoDslModals } from './components/RuleGoDslModals';
import { RuleGoEditorToolbar } from './components/RuleGoEditorToolbar';
import { RuleGoNodePanel } from './components/RuleGoNodePanel';

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
          <RuleGoConfigSidebar />
        </div>
        <RuleGoDslModals
          importOpen={importModalOpen}
          exportOpen={exportModalOpen}
          agentOpen={agentModalOpen}
          onImportOpenChange={setImportModalOpen}
          onExportOpenChange={setExportModalOpen}
          onAgentOpenChange={setAgentModalOpen}
          exportText={exportText}
          onApplyImport={applyLoadedDsl}
          onError={setError}
        />
      </FreeLayoutEditorProvider>
    </div>
  );
}
