/**
 * Flowgram 编辑器配置 Hook
 */

import React, { useMemo } from 'react';
import { createContainerNodePlugin } from '@flowgram.ai/free-container-plugin';
import { createFreeLinesPlugin } from '@flowgram.ai/free-lines-plugin';
import { createFreeSnapPlugin } from '@flowgram.ai/free-snap-plugin';
import { createMinimapPlugin } from '@flowgram.ai/minimap-plugin';
import { createFreeNodePanelPlugin } from '@flowgram.ai/free-node-panel-plugin';

import type { RuleGoNodeRegistry } from '../types';
import { RuleGoBaseNode } from '../components/base-node';
import { RuleGoFreeNodePanelRender } from '../components/RuleGoFreeNodePanelRender';
import { getWorkflowNodeFrontendType } from '../utils/getWorkflowNodeFrontendType';

export interface UseRuleGoEditorPropsOptions {
  initialData: any;
  nodeRegistries: RuleGoNodeRegistry[];
  onInit?: (ctx: any) => void;
  onContentChange?: (ctx: any, event: any) => void;
}

/**
 * 生成 Flowgram 编辑器配置
 */
export function useRuleGoEditorProps(
  options: UseRuleGoEditorPropsOptions
): any {
  const { initialData, nodeRegistries, onInit, onContentChange } = options;

  const config = useMemo(
    () => ({
      // 基础配置
      background: true,
      readonly: false,
      initialData,
      nodeRegistries,

      // 画布配置
      playground: {
        preventGlobalGesture: true,
      },

      // 引擎配置
      nodeEngine: { enable: true },
      variableEngine: { enable: true },
      history: {
        enable: true,
        enableChangeNode: true,
      },

      // 网格配置
      grid: {
        spacing: 24,
        snap: true,
        color: 'var(--canvas-grid)',
      },

      // 缩放配置
      zoom: {
        min: 0.4,
        max: 2.0,
        step: 0.1,
        default: 0.9,
      },

      // 连接规则
      canAddLine: (ctx: any, fromPort: any, toPort: any) => {
        // 规则 1: 不能连接到自己
        const fromNodeId = fromPort.node?.id || fromPort.nodeID;
        const toNodeId = toPort.node?.id || toPort.nodeID;
        
        if (fromNodeId === toNodeId) {
          return false;
        }

        // 规则 2: 输入端口只能有一条入线
        if (toPort.type === 'input') {
          const lineManager = ctx.lineManager || ctx.getService?.('LineManager');
          if (lineManager) {
            const existingLines = lineManager.getLinesToPort?.(toPort.id) || [];
            if (existingLines.length > 0) {
              return false;
            }
          }
        }

        // TODO: 规则 3: 检查环路
        // if (wouldCreateCycle(ctx, fromNodeId, toNodeId)) {
        //   return false;
        // }

        return true;
      },

      canDeleteLine: () => true,

      canDeleteNode: (_ctx: any, node: any) => {
        // BlockStart/BlockEnd 不可删除（运行时 node.type 可能为 FlowNodeEntity，需用 toJSON().type）
        const t = getWorkflowNodeFrontendType(node);
        if (t === 'block-start' || t === 'block-end') {
          return false;
        }
        return true;
      },

      // startDragCard 仅有 dragNodeType，无 dragNode；落到空白画布时 dropNode 为空 —— 需与 WorkflowDragService 默认行为对齐
      canDropToNode: (_ctx: any, params: any) => {
        const { dragNodeType, dropNode } = params;
        if (!dragNodeType) {
          return false;
        }
        if (!dropNode) {
          return true;
        }
        const dropType = getWorkflowNodeFrontendType(dropNode);
        const targetRegistry = nodeRegistries.find((r) => r.type === dropType);
        if (!targetRegistry?.meta.isContainer) {
          return false;
        }
        if (dragNodeType === 'block-start' || dragNodeType === 'block-end') {
          return false;
        }
        const dragRegistry = nodeRegistries.find((r) => r.type === dragNodeType);
        if (dragRegistry?.meta.isContainer) {
          return false;
        }
        return true;
      },

      // 节点渲染配置（关键！）
      materials: {
        components: {},
        renderDefaultNode: RuleGoBaseNode,
      },

      // 插件系统
      plugins: () => [
        createContainerNodePlugin({}),

        createFreeLinesPlugin({}),

        createFreeSnapPlugin({
          edgeThreshold: 8,
          gridSize: 24,
          enableGridSnapping: true,
          enableEdgeSnapping: true,
          enableMultiSnapping: true,
          enableOnlyViewportSnapping: false,
          alignColor: '#4e40e5',
          edgeColor: 'rgba(78, 64, 229, 0.35)',
          edgeLineWidth: 1,
          alignLineWidth: 1,
          alignCrossWidth: 6,
        }),

        createMinimapPlugin({
          panelStyles: {
            position: 'absolute',
            right: 16,
            bottom: 16,
            width: 200,
            height: 150,
            zIndex: 10,
          },
        }),

        createFreeNodePanelPlugin({
          renderer: (props) =>
            React.createElement(RuleGoFreeNodePanelRender, {
              ...props,
              nodeRegistries,
            }),
        }),
      ],

      // 生命周期钩子
      onInit: (ctx: any) => {
        onInit?.(ctx);
      },

      onContentChange: (ctx: any, event: any) => {
        onContentChange?.(ctx, event);
      },

      onAllLayersRendered: (ctx: any) => {
        try {
          ctx.tools?.fitView(false);
        } catch (err) {
          console.warn('[RuleGo] fitView failed:', err);
        }
      },
    }),
    [initialData, nodeRegistries, onInit, onContentChange]
  );
  
  return config;
}
