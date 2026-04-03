/**
 * T6.3 右侧配置侧栏：选中节点时编辑 data（经 FlowNodeEntity.updateExtInfo 写回）
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Banner, Button, TextArea } from '@douyinfe/semi-ui';
import { useListenEvents, useService, WorkflowNodeEntity, WorkflowSelectService } from '@flowgram.ai/free-layout-core';

import { getNodeRegistry } from '../nodes/registry';

export function RuleGoConfigSidebar() {
  const select = useService(WorkflowSelectService);
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
  }, [node]);

  const apply = useCallback(() => {
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

  const reg = node ? getNodeRegistry(String(node.type)) : undefined;

  const applyDataPatch = useCallback(
    (patch: Record<string, unknown>) => {
      if (!node) return;
      try {
        const j = node.toJSON() as { data?: Record<string, unknown> };
        const cur = j.data ?? {};
        node.updateExtInfo({ ...cur, ...patch }, true);
        setErr(null);
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

  const SidebarForm = reg?.renderConfigSidebar;

  if (!node) {
    return (
      <aside
        className="rulego-free-config-sidebar"
        style={{
          width: 300,
          flexShrink: 0,
          borderLeft: '1px solid var(--panel-border)',
          background: 'var(--panel-bg)',
          padding: 16,
          fontSize: 13,
          color: 'var(--semi-color-text-2)',
        }}
      >
        在画布上选择一个节点以编辑其数据（表单或 JSON）。节点卡片内仍可显示完整表单。
      </aside>
    );
  }

  return (
    <aside
      className="rulego-free-config-sidebar"
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: '1px solid var(--panel-border)',
        background: 'var(--panel-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--panel-border)' }}>
        <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>选中节点</div>
        <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>{reg?.info.description ?? String(node.type)}</div>
        <div style={{ fontSize: 11, color: 'var(--semi-color-text-2)', marginTop: 4, wordBreak: 'break-all' }}>
          {String(node.type)} · {reg?.backendNodeType ?? ''}
        </div>
      </div>
      <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'auto' }}>
        {err ? <Banner type="danger" description={err} /> : null}
        {SidebarForm ? (
          <SidebarForm data={nodeData} onApplyPatch={applyDataPatch} />
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>data（JSON）</div>
            <TextArea
              value={text}
              onChange={setText}
              style={{ flex: 1, minHeight: 200, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
            />
            <Button type="primary" theme="solid" onClick={apply}>
              应用 data
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
