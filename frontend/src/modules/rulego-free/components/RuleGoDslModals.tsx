/**
 * T6.4：导入 / 导出 / Agent 规划（占位）
 */

import React, { useCallback, useState } from 'react';
import { Button, Input, Modal, TextArea, Typography } from '@douyinfe/semi-ui';

import { formatDslError } from '../dsl/buildRuleGoDsl';
import type { RuleGoDsl } from '../types/dsl';

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
}: RuleGoDslModalsProps) {
  const [paste, setPaste] = useState('');
  const [agentRequirement, setAgentRequirement] = useState('');

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
        onCancel={() => {
          onAgentOpenChange(false);
          setAgentRequirement('');
        }}
        footer={
          <>
            <Button
              onClick={() => {
                onAgentOpenChange(false);
                setAgentRequirement('');
              }}
            >
              关闭
            </Button>
            <Button disabled title="待对接后端 /api/rulego/plan">
              预览
            </Button>
            <Button type="primary" theme="solid" disabled title="待对接后端">
              应用到画布
            </Button>
          </>
        }
        width={560}
      >
        <Typography.Paragraph type="tertiary" style={{ marginBottom: 12 }}>
          将接入自然语言生成或调整规则链（规划接口与旧编辑器对齐后，可预览节点并写入画布）。当前仅收集需求文案。
        </Typography.Paragraph>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--semi-color-text-1)' }}>需求描述</div>
          <Input
            value={agentRequirement}
            onChange={setAgentRequirement}
            placeholder="例如：在 HTTP 触发后调用 REST，再把结果送给 LLM…"
          />
        </div>
        <Typography.Paragraph type="tertiary" size="small">
          预览 / 应用将在后端 Agent 服务可用后启用。
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
