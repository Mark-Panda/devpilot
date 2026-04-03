/**
 * RuleGo Base Node 组件
 *
 * 所有 RuleGo 节点的默认渲染容器。
 * 端口由 WorkflowNodeRenderer 内部通过 useNodeRender().ports 统一渲染，
 * 此处不要再在外层调用 useNodeRender（会脱离 NodeRender 上下文，ports 恒为空）。
 */

import React, { useCallback, useMemo } from 'react';
import { PlaygroundConfigEntity } from '@flowgram.ai/core';
import { WorkflowNodePanelService } from '@flowgram.ai/free-node-panel-plugin';
import {
  useNodeRender,
  usePlaygroundReadonlyState,
  useService,
  WorkflowNodeRenderer,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor';

import { getNodeRegistry } from '../../nodes/registry';
import { useRuleGoNodeConfigModalOptional } from '../../context/RuleGoNodeConfigModalContext';
import { getWorkflowNodeFrontendType } from '../../utils/getWorkflowNodeFrontendType';

/** 容器节点（如 for-loop）必须渲染完整 form（含 SubCanvas），不能用紧凑卡片替代 */
function RuleGoNodeFormContent({ node }: { node: any }) {
  const { form } = useNodeRender(node);
  return <>{form?.render() ?? null}</>;
}

export function RuleGoBaseNode({ node }: { node: any }) {
  const readonly = usePlaygroundReadonlyState();
  const playgroundConfig = useService(PlaygroundConfigEntity);
  const nodePanel = useService(WorkflowNodePanelService);
  const cfgModal = useRuleGoNodeConfigModalOptional();

  const frontendType = useMemo(() => getWorkflowNodeFrontendType(node), [node]);
  const reg = useMemo(() => getNodeRegistry(frontendType), [frontendType]);
  const isContainerNode = reg?.meta?.isContainer === true;
  const showCompact = reg?.meta?.nodePanelVisible !== false && !isContainerNode;

  const onDoubleClickOpenConfig = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (readonly) return;
      if (reg?.meta?.nodePanelVisible === false) return;
      cfgModal?.openNodeConfig();
    },
    [readonly, reg?.meta?.nodePanelVisible, cfgModal]
  );

  const onPortClick = useCallback<NonNullable<WorkflowNodeProps['onPortClick']>>(
    (port, e) => {
      if (readonly) return;
      if (typeof e === 'function') return;
      e.stopPropagation();
      if (port.portType !== 'output') return;
      const panelPosition = playgroundConfig.getPosFromMouseEvent(e);
      void nodePanel.call({
        panelPosition,
        fromPort: port,
        enableBuildLine: true,
      });
    },
    [readonly, playgroundConfig, nodePanel]
  );

  return (
    <WorkflowNodeRenderer
      node={node}
      className="rulego-base-node"
      portPrimaryColor="#4d53e8"
      portSecondaryColor="#9197f1"
      portBackgroundColor="#ffffff"
      onPortClick={onPortClick}
    >
      {isContainerNode ? (
        <RuleGoNodeFormContent node={node} />
      ) : showCompact ? (
        <div
          role="button"
          tabIndex={0}
          onDoubleClick={onDoubleClickOpenConfig}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              if (!readonly && reg?.meta?.nodePanelVisible !== false) cfgModal?.openNodeConfig();
            }
          }}
          style={{
            minWidth: 120,
            minHeight: 56,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--node-bg, rgba(30, 32, 48, 0.96))',
            border: '1px solid var(--node-border, rgba(255,255,255,0.12))',
            cursor: readonly ? 'default' : 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--semi-color-text-0)' }}>
            {reg?.info.icon ? <span style={{ marginRight: 6 }}>{reg.info.icon}</span> : null}
            {reg?.info.description ?? (frontendType || '节点')}
          </div>
          {!readonly && reg?.meta?.nodePanelVisible !== false ? (
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginTop: 6 }}>
              双击或工具栏「节点配置」编辑属性
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--semi-color-text-2)' }}>{reg?.info.description ?? ''}</div>
      )}
    </WorkflowNodeRenderer>
  );
}
