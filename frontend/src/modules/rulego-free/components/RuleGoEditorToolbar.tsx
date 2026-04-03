/**
 * T6.1 顶部工具栏：规则名、撤销/重做、导入导出、Agent、保存
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input } from '@douyinfe/semi-ui';
import { useListenEvents, useService, WorkflowSelectService } from '@flowgram.ai/free-layout-core';
import { useClientContext } from '@flowgram.ai/free-layout-editor';
import type { FreeLayoutPluginContext } from '@flowgram.ai/free-layout-editor';

import { useRuleGoNodeConfigModal } from '../context/RuleGoNodeConfigModalContext';

export interface RuleGoEditorToolbarProps {
  ruleName: string;
  onRuleNameChange: (v: string) => void;
  unsaved: boolean;
  loading: boolean;
  onImportFile: () => void;
  onOpenImportModal: () => void;
  onOpenExportModal: () => void;
  onOpenAgentModal: () => void;
  onSave: () => void;
}

export function RuleGoEditorToolbar({
  ruleName,
  onRuleNameChange,
  unsaved,
  loading,
  onImportFile,
  onOpenImportModal,
  onOpenExportModal,
  onOpenAgentModal,
  onSave,
}: RuleGoEditorToolbarProps) {
  const ctx = useClientContext() as FreeLayoutPluginContext;
  const select = useService(WorkflowSelectService);
  const { openNodeConfig } = useRuleGoNodeConfigModal();
  useListenEvents(select.onSelectionChanged);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const oneNodeSelected = (select.selectedNodes?.length ?? 0) === 1;

  const refreshHistory = useCallback(() => {
    const h = ctx?.history;
    if (!h) return;
    setCanUndo(h.canUndo?.() ?? false);
    setCanRedo(h.canRedo?.() ?? false);
  }, [ctx]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory, unsaved]);

  const handleUndo = useCallback(async () => {
    await ctx?.history?.undo?.();
    refreshHistory();
  }, [ctx, refreshHistory]);

  const handleRedo = useCallback(async () => {
    await ctx?.history?.redo?.();
    refreshHistory();
  }, [ctx, refreshHistory]);

  return (
    <div
      className="rulego-free-toolbar"
      style={{
        padding: '10px 16px',
        background: 'var(--panel-bg)',
        borderBottom: '1px solid var(--panel-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--semi-color-text-0)' }}>
          RuleGo（Flowgram）
        </span>
        <Input
          value={ruleName}
          onChange={(v) => onRuleNameChange(String(v))}
          placeholder="规则链名称"
          style={{ width: 220 }}
        />
        {unsaved ? (
          <span
            style={{
              background: '#fef3c7',
              color: '#92400e',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            未保存
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Button size="small" disabled={!canUndo} onClick={() => void handleUndo()}>
          撤销
        </Button>
        <Button size="small" disabled={!canRedo} onClick={() => void handleRedo()}>
          重做
        </Button>
        <Button size="small" onClick={onImportFile}>
          导入文件
        </Button>
        <Button size="small" onClick={onOpenImportModal}>
          粘贴导入
        </Button>
        <Button size="small" onClick={onOpenExportModal}>
          导出 DSL
        </Button>
        <Button size="small" type="tertiary" disabled={!oneNodeSelected} onClick={openNodeConfig}>
          节点配置
        </Button>
        <Button size="small" theme="solid" type="tertiary" onClick={onOpenAgentModal}>
          Agent 规划
        </Button>
        <Button
          type="primary"
          theme="solid"
          loading={loading}
          disabled={!unsaved || loading}
          onClick={onSave}
        >
          保存
        </Button>
      </div>
    </div>
  );
}
