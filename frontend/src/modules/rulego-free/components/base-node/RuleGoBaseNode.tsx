/**
 * RuleGo Base Node 组件
 *
 * 所有 RuleGo 节点的默认渲染容器。
 * 端口由 WorkflowNodeRenderer 内部通过 useNodeRender().ports 统一渲染，
 * 此处不要再在外层调用 useNodeRender（会脱离 NodeRender 上下文，ports 恒为空）。
 */

import React, { useCallback } from 'react';
import { PlaygroundConfigEntity } from '@flowgram.ai/core';
import { WorkflowNodePanelService } from '@flowgram.ai/free-node-panel-plugin';
import {
  useNodeRender,
  usePlaygroundReadonlyState,
  useService,
  WorkflowNodeRenderer,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor';

/**
 * useNodeRender 可传入当前节点实体；若不传则依赖 PlaygroundEntityContext，
 * 在 materials 默认节点渲染路径上可能不稳定。显式传入 props.node 更可靠。
 */
function RuleGoNodeFormContent({ node }: { node: any }) {
  const { form } = useNodeRender(node);
  return <>{form?.render() ?? null}</>;
}

export function RuleGoBaseNode({ node }: { node: any }) {
  const readonly = usePlaygroundReadonlyState();
  const playgroundConfig = useService(PlaygroundConfigEntity);
  const nodePanel = useService(WorkflowNodePanelService);

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
      <RuleGoNodeFormContent node={node} />
    </WorkflowNodeRenderer>
  );
}
