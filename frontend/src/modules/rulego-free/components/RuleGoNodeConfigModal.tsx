/**
 * 选中节点后在弹窗中编辑配置（与 Blockly 侧「块属性」表单语义一致：优先结构化表单，否则 JSON）
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Modal, TextArea, Typography } from '@douyinfe/semi-ui';
import { useListenEvents, useService, WorkflowNodeEntity, WorkflowSelectService } from '@flowgram.ai/free-layout-core';

import { getNodeRegistry } from '../nodes/registry';
import { getWorkflowNodeFrontendType } from '../utils/getWorkflowNodeFrontendType';
import { mergeRuleGoNodeData } from '../utils/mergeRuleGoNodeData';
import { useRuleGoNodeConfigModal } from '../context/RuleGoNodeConfigModalContext';

export function RuleGoNodeConfigModal() {
  const select = useService(WorkflowSelectService);
  const { configModalVisible, closeNodeConfig } = useRuleGoNodeConfigModal();
  useListenEvents(select.onSelectionChanged);

  const node: WorkflowNodeEntity | undefined = select.selectedNodes?.[0];
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!node) {
      setText('');
      setErr(null);
      return;
    }
    try {
      const j = node.toJSON() as { data?: Record<string, unknown> };
      setText(JSON.stringify(j.data ?? {}, null, 2));
      setErr(null);
    } catch {
      setText('');
      setErr('无法序列化节点 data');
    }
  }, [node, configModalVisible]);

  const applyDataPatch = useCallback(
    (patch: Record<string, unknown>) => {
      if (!node) return;
      try {
        const j = node.toJSON() as { data?: Record<string, unknown> };
        const cur = j.data ?? {};
        const merged = mergeRuleGoNodeData(cur as Record<string, unknown>, patch);
        node.updateExtInfo(merged, true);
        setErr(null);
        setText(JSON.stringify(merged, null, 2));
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [node]
  );

  const nodeData = (() => {
    if (!node) return {};
    try {
      const j = node.toJSON() as { data?: Record<string, unknown> };
      return j.data ?? {};
    } catch {
      return {};
    }
  })();

  const frontendType = node ? getWorkflowNodeFrontendType(node) : '';
  const reg = frontendType ? getNodeRegistry(frontendType) : undefined;
  const SidebarForm = reg?.renderConfigSidebar;
  const hideForm = reg?.meta?.nodePanelVisible === false;

  const applyJson = useCallback(() => {
    if (!node) return;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setErr('data 须为 JSON 对象');
        return;
      }
      node.updateExtInfo(parsed, true);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [node, text]);

  const title = reg?.info.description ?? (frontendType || '节点配置');

  return (
    <Modal
      title={
        <span>
          编辑节点配置 · {title}
          {reg?.backendNodeType ? (
            <Typography.Text type="tertiary" size="small" style={{ marginLeft: 8, fontWeight: 400 }}>
              ({reg.backendNodeType})
            </Typography.Text>
          ) : null}
        </span>
      }
      visible={configModalVisible}
      onCancel={closeNodeConfig}
      width={Math.min(920, typeof window !== 'undefined' ? window.innerWidth - 48 : 920)}
      footer={<Button onClick={closeNodeConfig}>关闭</Button>}
    >
      {!node ? (
        <Typography.Paragraph type="tertiary">请先在画布上选中一个节点，再打开本弹窗。</Typography.Paragraph>
      ) : hideForm ? (
        <Typography.Paragraph type="tertiary">该节点为内部结构节点，无需配置。</Typography.Paragraph>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'min(70vh, 640px)', overflow: 'auto' }}>
          <Typography.Paragraph type="tertiary" size="small" style={{ marginBottom: 0 }}>
            与 Blockly 编辑器「选中积木 → 右侧属性区」的字段一致：有结构化表单时优先使用表单；否则编辑下方 JSON。
          </Typography.Paragraph>
          {err ? <Banner type="danger" description={err} /> : null}
          {SidebarForm && !hideForm ? (
            <SidebarForm data={nodeData} onApplyPatch={applyDataPatch} />
          ) : null}
          <div>
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 6 }}>data（JSON，可直接编辑）</div>
            <TextArea
              value={text}
              onChange={setText}
              rows={14}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
            />
            <Button type="primary" theme="solid" style={{ marginTop: 8 }} onClick={applyJson}>
              应用 JSON
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
