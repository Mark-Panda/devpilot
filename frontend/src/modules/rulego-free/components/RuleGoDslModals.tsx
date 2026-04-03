/**
 * T6.4 / T8.2：导入 / 导出 / Agent 规划（对接 GenerateRuleGoPlan）
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, TextArea, Typography, Spin } from '@douyinfe/semi-ui';

import { formatDslError } from '../dsl/buildRuleGoDsl';
import type { RuleGoDsl } from '../types/dsl';
import type { ModelConfig } from '../../model-management/types';
import type { GenerateRuleGoPlanResult } from '../../rulego/useRuleGoApi';
import type { AgentPreviewItem } from '../../rulego/agentPlanner';

export interface RuleGoAgentPlanModalProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  loading: boolean;
  error: string | null;
  modelConfigs: ModelConfig[];
  modelConfigId: string;
  onModelConfigIdChange: (id: string) => void;
  modelName: string;
  onModelNameChange: (name: string) => void;
  planResult: GenerateRuleGoPlanResult | null;
  previewItems: AgentPreviewItem[];
  selectedIds: Set<string>;
  onTogglePreviewId: (id: string, checked: boolean) => void;
  questionAnswers: Record<string, string>;
  onQuestionAnswerChange: (q: string, a: string) => void;
  onGenerate: () => void;
  onApply: () => void;
  onSubmitAnswers: () => void;
  generateDisabled: boolean;
  applyDisabled: boolean;
  applyDisabledTitle?: string;
}

export interface RuleGoDslModalsProps {
  importOpen: boolean;
  exportOpen: boolean;
  agentOpen: boolean;
  onImportOpenChange: (v: boolean) => void;
  onExportOpenChange: (v: boolean) => void;
  onAgentOpenChange: (v: boolean) => void;
  exportText: string;
  onApplyImport: (dsl: RuleGoDsl) => void;
  onError: (msg: string | null) => void;
  agentPlan?: RuleGoAgentPlanModalProps;
}

export function RuleGoDslModals({
  importOpen,
  exportOpen,
  agentOpen,
  onImportOpenChange,
  onExportOpenChange,
  onAgentOpenChange,
  exportText,
  onApplyImport,
  onError,
  agentPlan,
}: RuleGoDslModalsProps) {
  const [paste, setPaste] = useState('');

  const applyPaste = useCallback(() => {
    try {
      const dsl = JSON.parse(paste) as RuleGoDsl;
      if (!dsl?.metadata) {
        onError('无效的 DSL：缺少 metadata');
        return;
      }
      onApplyImport(dsl);
      onImportOpenChange(false);
      setPaste('');
      onError(null);
    } catch (e: unknown) {
      onError(formatDslError(e));
    }
  }, [paste, onApplyImport, onError, onImportOpenChange]);

  const copyExport = useCallback(() => {
    void navigator.clipboard.writeText(exportText);
    onError(null);
  }, [exportText, onError]);

  const agentQuestions = agentPlan?.planResult?.questions ?? [];
  const agentNeedClarification = agentPlan?.planResult?.need_clarification === true && agentQuestions.length > 0;
  const agentAnswered = useMemo(
    () => agentQuestions.filter((q) => String(agentPlan?.questionAnswers[q] ?? '').trim().length > 0).length,
    [agentQuestions, agentPlan?.questionAnswers]
  );
  const agentAllAnswered = agentQuestions.length > 0 && agentAnswered === agentQuestions.length;
  const agentPrimaryGenerateDisabled =
    agentPlan?.generateDisabled ||
    (agentNeedClarification ? agentAnswered === 0 : !agentPlan?.prompt.trim());

  const closeAgent = () => {
    onAgentOpenChange(false);
    agentPlan?.onPromptChange('');
  };

  return (
    <>
      <Modal
        title="粘贴导入 DSL"
        visible={importOpen}
        onCancel={() => onImportOpenChange(false)}
        footer={
          <>
            <Button onClick={() => onImportOpenChange(false)}>取消</Button>
            <Button type="primary" theme="solid" onClick={applyPaste}>
              应用
            </Button>
          </>
        }
      >
        <TextArea
          value={paste}
          onChange={setPaste}
          rows={16}
          placeholder="粘贴完整 RuleGo DSL JSON"
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
      </Modal>

      <Modal title="导出 DSL" visible={exportOpen} onCancel={() => onExportOpenChange(false)} width={720}>
        <div style={{ marginBottom: 8 }}>
          <Button type="primary" theme="solid" onClick={copyExport}>
            复制到剪贴板
          </Button>
        </div>
        <TextArea
          value={exportText}
          readOnly
          rows={22}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
        />
      </Modal>

      <Modal
        title="Agent 规划"
        visible={agentOpen}
        onCancel={closeAgent}
        footer={
          <>
            <Button onClick={closeAgent}>关闭</Button>
            {agentNeedClarification && agentQuestions.length > 0 ? (
              <Button
                type="primary"
                theme="solid"
                disabled={!agentAllAnswered || agentPlan?.loading}
                onClick={() => agentPlan?.onSubmitAnswers()}
              >
                提交回答并重新生成
              </Button>
            ) : null}
            <Button
              type="tertiary"
              loading={agentPlan?.loading}
              disabled={agentPrimaryGenerateDisabled}
              onClick={() => agentPlan?.onGenerate()}
            >
              生成预览
            </Button>
            <Button
              type="primary"
              theme="solid"
              disabled={agentPlan?.applyDisabled}
              title={agentPlan?.applyDisabledTitle}
              onClick={() => agentPlan?.onApply()}
            >
              应用到画布
            </Button>
          </>
        }
        width={720}
      >
        {agentPlan ? (
          <Spin spinning={agentPlan.loading}>
            <Typography.Paragraph type="tertiary" style={{ marginBottom: 12 }}>
              使用自然语言描述规则链，模型将返回可勾选的节点与连线；勾选后合并进当前 DSL 并加载到画布（与旧 Blockly 编辑器同一后端接口）。
            </Typography.Paragraph>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--semi-color-text-1)' }}>模型配置</div>
              <select
                value={agentPlan.modelConfigId}
                onChange={(e) => agentPlan.onModelConfigIdChange(e.target.value)}
                style={{ width: '100%', maxWidth: 420, padding: '6px 8px', borderRadius: 6 }}
              >
                {agentPlan.modelConfigs.length === 0 ? (
                  <option value="">暂无可用模型配置（请先在「模型管理」中添加）</option>
                ) : (
                  agentPlan.modelConfigs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.siteDescription || c.baseUrl || c.id}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--semi-color-text-1)' }}>模型</div>
              <select
                value={agentPlan.modelName}
                onChange={(e) => agentPlan.onModelNameChange(e.target.value)}
                style={{ width: '100%', maxWidth: 420, padding: '6px 8px', borderRadius: 6 }}
              >
                {(agentPlan.modelConfigs.find((c) => c.id === agentPlan.modelConfigId)?.models ?? []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                {(agentPlan.modelConfigs.find((c) => c.id === agentPlan.modelConfigId)?.models ?? []).length === 0 ? (
                  <option value="">暂无可用模型</option>
                ) : null}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--semi-color-text-1)' }}>需求描述</div>
              <Input
                value={agentPlan.prompt}
                onChange={agentPlan.onPromptChange}
                placeholder="例如：在 HTTP 触发后调用 REST，再把结果送给 LLM…"
              />
            </div>

            {agentPlan.error ? (
              <div
                style={{
                  marginBottom: 10,
                  padding: '8px 10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#b91c1c',
                }}
              >
                {agentPlan.error}
              </div>
            ) : null}

            {agentNeedClarification ? (
              <div style={{ marginBottom: 12 }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Agent 追问（请逐条回答后点击「提交回答并重新生成」）
                </Typography.Text>
                {agentQuestions.map((q) => (
                  <div key={q} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>{q}</div>
                    <Input
                      value={agentPlan.questionAnswers[q] ?? ''}
                      onChange={(v: string) => agentPlan.onQuestionAnswerChange(q, v)}
                      placeholder="回答"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {agentPlan.planResult?.thought?.trim() ? (
              <div
                style={{
                  marginBottom: 10,
                  padding: 10,
                  background: 'var(--semi-color-fill-0)',
                  borderRadius: 8,
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <strong>分析</strong>：{agentPlan.planResult.thought.trim()}
              </div>
            ) : null}

            {agentPlan.previewItems.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  预览（勾选后将合并进当前规则）
                </Typography.Text>
                <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--semi-color-border)', borderRadius: 8, padding: 8 }}>
                  {agentPlan.previewItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '6px 4px',
                        borderBottom: '1px solid var(--semi-color-border)',
                        opacity: item.valid ? 1 : 0.65,
                      }}
                    >
                      <Checkbox
                        checked={agentPlan.selectedIds.has(item.id)}
                        disabled={!item.valid}
                        onChange={(e) => agentPlan.onTogglePreviewId(item.id, e.target.checked ?? false)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>{item.detail}</div>
                        {item.validationError ? (
                          <div style={{ fontSize: 12, color: '#b91c1c' }}>{item.validationError}</div>
                        ) : null}
                        {item.reason ? (
                          <div style={{ fontSize: 11, color: 'var(--semi-color-text-3)', marginTop: 4 }}>{item.reason}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(agentPlan.planResult?.warnings ?? []).length > 0 ? (
              <div style={{ marginTop: 8, fontSize: 12, color: '#b45309' }}>
                {(agentPlan.planResult?.warnings ?? []).map((w, i) => (
                  <div key={i}>⚠ {w}</div>
                ))}
              </div>
            ) : null}
          </Spin>
        ) : (
          <Typography.Paragraph type="tertiary">未配置 Agent 规划能力。</Typography.Paragraph>
        )}
      </Modal>
    </>
  );
}
