/**
 * Flowgram free-node-panel-plugin 的浮层 UI：从端口快捷添加下游节点时展示可选类型。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Collapse, Input } from '@douyinfe/semi-ui';
import type { NodePanelRenderProps } from '@flowgram.ai/free-node-panel-plugin';

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

export type RuleGoFreeNodePanelRenderProps = NodePanelRenderProps & {
  nodeRegistries: RuleGoNodeRegistry[];
};

export function RuleGoFreeNodePanelRender({
  position,
  onClose,
  onSelect,
  nodeRegistries,
}: RuleGoFreeNodePanelRenderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onDocDown = (e: MouseEvent) => {
        if (rootRef.current?.contains(e.target as Node)) return;
        onClose();
      };
      document.addEventListener('mousedown', onDocDown);
      cleanup = () => document.removeEventListener('mousedown', onDocDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = nodeRegistries.filter((r) => {
      if (r.meta?.nodePanelVisible === false) return false;
      if (r.type === 'block-start' || r.type === 'block-end') return false;
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

  const panels = CATEGORY_ORDER.flatMap((cat) => {
    const items = filtered.get(cat) ?? [];
    if (items.length === 0) return [];
    return [
      <Collapse.Panel header={CATEGORY_LABEL[cat]} itemKey={cat} key={cat}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((r) => (
            <Button
              key={r.type}
              size="small"
              block
              type="tertiary"
              onClick={(e) => {
                const init = r.onAdd?.() ?? { data: {} };
                onSelect({
                  nodeType: r.type,
                  selectEvent: e,
                  nodeJSON: init as never,
                });
              }}
              style={{ justifyContent: 'flex-start', textAlign: 'left' }}
            >
              <span style={{ marginRight: 8 }}>{r.info.icon}</span>
              <span>{r.info.description || r.type}</span>
            </Button>
          ))}
        </div>
      </Collapse.Panel>,
    ];
  });

  return (
    <div
      ref={rootRef}
      className="rulego-free-floating-node-panel"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 10001,
        width: 280,
        maxHeight: 360,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--panel-bg, var(--semi-color-bg-2))',
        border: '1px solid var(--panel-border, var(--semi-color-border))',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,.12)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 10, borderBottom: '1px solid var(--semi-color-border)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--semi-color-text-1)' }}>
          添加节点
        </div>
        <Input value={q} onChange={setQ} placeholder="搜索…" size="small" showClear />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {panels.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', padding: 8 }}>无匹配节点</div>
        ) : (
          <Collapse defaultActiveKey={CATEGORY_ORDER}>{panels}</Collapse>
        )}
      </div>
    </div>
  );
}
