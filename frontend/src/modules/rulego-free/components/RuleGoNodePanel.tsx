/**
 * T6.2 左侧节点面板：分类折叠、搜索、点击添加节点
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Button, Collapse, Input } from '@douyinfe/semi-ui';
import { useClientContext } from '@flowgram.ai/free-layout-editor';
import {
  usePlaygroundContainer,
  WorkflowDragService,
} from '@flowgram.ai/free-layout-core';

import type { RuleGoNodeRegistry } from '../types';
import type { RuleGoCategory } from '../nodes/constants';

const CATEGORY_ORDER: RuleGoCategory[] = [
  'trigger',
  'action',
  'condition',
  'data',
  'flow',
  'db',
  'file',
  'tracer',
  'rpa',
];

const CATEGORY_LABEL: Record<RuleGoCategory, string> = {
  trigger: '触发器',
  action: '动作',
  condition: '条件',
  data: '数据处理',
  flow: '流程控制',
  db: '数据库',
  file: '文件',
  tracer: '追踪',
  rpa: 'RPA',
};

export interface RuleGoNodePanelProps {
  nodeRegistries: RuleGoNodeRegistry[];
}

function useWorkflowDragServiceSafe(): WorkflowDragService | undefined {
  const container = usePlaygroundContainer() as
    | { get?: (id: unknown) => unknown }
    | undefined;
  return useMemo(() => {
    if (!container || typeof container.get !== 'function') return undefined;
    try {
      return container.get(WorkflowDragService) as WorkflowDragService;
    } catch {
      return undefined;
    }
  }, [container]);
}

export function RuleGoNodePanel({ nodeRegistries }: RuleGoNodePanelProps) {
  /** 与画布共用 PluginContext，避免从 @flowgram.ai/core 单独引 useService 导致 Context 不一致 */
  const { document: doc } = useClientContext();
  const dragService = useWorkflowDragServiceSafe();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = nodeRegistries.filter((r) => {
      if (r.meta?.nodePanelVisible === false) return false;
      if (!s) return true;
      const hay = `${r.type} ${r.backendNodeType} ${r.info?.description ?? ''}`.toLowerCase();
      return hay.includes(s);
    });
    const byCat = new Map<RuleGoCategory, RuleGoNodeRegistry[]>();
    for (const c of CATEGORY_ORDER) byCat.set(c, []);
    for (const r of list) {
      const arr = byCat.get(r.category as RuleGoCategory);
      if (arr) arr.push(r);
    }
    return byCat;
  }, [nodeRegistries, q]);

  const addNode = useCallback(
    (reg: RuleGoNodeRegistry) => {
      if (!doc?.createWorkflowNodeByType) return;
      const init = reg.onAdd?.() ?? { data: {} };
      const data = (init as { data?: Record<string, unknown> }).data ?? {};
      const x = 160 + Math.floor(Math.random() * 80);
      const y = 140 + Math.floor(Math.random() * 80);
      void doc.createWorkflowNodeByType(reg.type, { x, y }, { data });
    },
    [doc]
  );

  /** 与 Flowgram 内置节点面板一致：从面板拖「卡片」到画布放置（WorkflowDragService.startDragCard） */
  const startDragNodeFromPanel = useCallback(
    (reg: RuleGoNodeRegistry, e: React.MouseEvent) => {
      if (e.button !== 0 || !dragService) return;
      const init = reg.onAdd?.() ?? { data: {} };
      const data = (init as { data?: Record<string, unknown> }).data ?? {};
      void dragService.startDragCard(reg.type, e, { data });
    },
    [dragService]
  );

  const panels = CATEGORY_ORDER.flatMap((cat) => {
    const items = filtered.get(cat) ?? [];
    if (items.length === 0) return [];
    return [
      <Collapse.Panel header={CATEGORY_LABEL[cat]} itemKey={cat} key={cat}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((r) => (
            <div
              key={r.type}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 6,
                marginBottom: 4,
              }}
            >
              {dragService ? (
                <button
                  type="button"
                  title="按住拖到画布"
                  className="rulego-node-panel-drag-handle"
                  style={{
                    flexShrink: 0,
                    width: 28,
                    cursor: 'grab',
                    border: '1px solid var(--semi-color-border)',
                    borderRadius: 6,
                    background: 'var(--semi-color-fill-0)',
                    color: 'var(--semi-color-text-2)',
                    fontSize: 14,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseDown={(e) => startDragNodeFromPanel(r, e)}
                >
                  ≡
                </button>
              ) : null}
              <Button
                size="small"
                block
                type="tertiary"
                onClick={() => addNode(r)}
                style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left' }}
              >
                <span style={{ marginRight: 8 }}>{r.info.icon}</span>
                <span>{r.info.description || r.type}</span>
              </Button>
            </div>
          ))}
        </div>
      </Collapse.Panel>,
    ];
  });

  return (
    <aside
      className="rulego-free-node-panel"
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--panel-border)',
        background: 'var(--panel-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 10, borderBottom: '1px solid var(--panel-border)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--semi-color-text-1)' }}>
          节点库
        </div>
        <Input value={q} onChange={setQ} placeholder="搜索类型或描述…" size="small" showClear />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {panels.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', padding: 8 }}>无匹配节点</div>
        ) : (
          <Collapse defaultActiveKey={CATEGORY_ORDER}>{panels}</Collapse>
        )}
      </div>
    </aside>
  );
}
