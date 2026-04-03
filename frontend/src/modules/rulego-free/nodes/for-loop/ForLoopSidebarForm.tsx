/**
 * 右侧侧栏：ForLoop 配置表单（与画布节点语义一致：range / do / mode）
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Input, Select, Typography } from '@douyinfe/semi-ui';

import type { RuleGoConfigSidebarRenderProps } from '../../types';

const MODE_OPTIONS = [
  { label: '忽略', value: 0 },
  { label: '追加', value: 1 },
  { label: '覆盖', value: 2 },
  { label: '异步', value: 3 },
];

function readForLoopFields(data: Record<string, unknown>) {
  return {
    range: typeof data.range === 'string' ? data.range : '1..10',
    do: typeof data.do === 'string' ? data.do : '',
    mode: typeof data.mode === 'number' && !Number.isNaN(data.mode) ? data.mode : 0,
  };
}

export function ForLoopSidebarForm({ data, onApplyPatch }: RuleGoConfigSidebarRenderProps) {
  const snapshot = JSON.stringify(readForLoopFields(data));
  const [range, setRange] = useState(() => readForLoopFields(data).range);
  const [doTarget, setDoTarget] = useState(() => readForLoopFields(data).do);
  const [mode, setMode] = useState(() => readForLoopFields(data).mode);

  useEffect(() => {
    const next = readForLoopFields(data);
    setRange(next.range);
    setDoTarget(next.do);
    setMode(next.mode);
  }, [snapshot]);

  const commitRange = useCallback(
    (v: string) => {
      setRange(v);
      onApplyPatch({ range: v });
    },
    [onApplyPatch]
  );
  const commitDo = useCallback(
    (v: string) => {
      setDoTarget(v);
      onApplyPatch({ do: v });
    },
    [onApplyPatch]
  );
  const commitMode = useCallback(
    (v: number | string) => {
      const n = typeof v === 'number' ? v : Number(v);
      setMode(n);
      onApplyPatch({ mode: n });
    },
    [onApplyPatch]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 4 }}>循环范围 range</div>
        <Input
          value={range}
          placeholder="例如 1..10"
          onChange={(v) => commitRange(v)}
        />
        <Typography.Paragraph type="tertiary" size="small" style={{ marginTop: 6, marginBottom: 0 }}>
          与 Blockly 一致，如 <code>1..n</code> 表示下标范围。
        </Typography.Paragraph>
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 4 }}>Do 目标节点 id（do）</div>
        <Input
          value={doTarget}
          placeholder="子节点 node id，可与画布内 Do 连线一致"
          onChange={(v) => commitDo(v)}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 4 }}>模式 mode</div>
        <Select
          style={{ width: '100%' }}
          value={mode}
          optionList={MODE_OPTIONS}
          onChange={(v) => commitMode(v ?? 0)}
        />
      </div>
    </div>
  );
}
