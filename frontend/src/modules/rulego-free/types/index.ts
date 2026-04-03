/**
 * RuleGo 类型定义
 */

import type { FlowNodeRegistry } from '@flowgram.ai/editor';
import type { FC } from 'react';
import type { RuleGoCategory } from '../nodes/constants';

/** 节点配置表单（原右侧栏；现用于「节点配置」弹窗，与 Blockly 块属性字段对齐） */
export type RuleGoConfigSidebarRenderProps = {
  data: Record<string, unknown>;
  /** 与当前 data 合并后写回节点 */
  onApplyPatch: (patch: Record<string, unknown>) => void;
};

/**
 * Form Meta 临时类型定义
 */
export interface FormMeta {
  render: (props: any) => React.ReactElement;
  validate?: (data: any) => Record<string, string>;
  defaultValues?: Record<string, any>;
  [key: string]: any;
}

/**
 * RuleGo 节点注册表接口
 * 扩展 Flowgram 的 FlowNodeRegistry，增加 RuleGo 特定字段
 */
export interface RuleGoNodeRegistry {
  // Flowgram 标准字段
  type: string;
  info: {
    icon: string;
    description: string;
  };
  meta: {
    isContainer?: boolean;
    size?: { width: number; height: number };
    padding?: (transform: any) => {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    defaultPorts?: any[];
    wrapperStyle?: React.CSSProperties;
    selectable?: (node: any, mousePos?: any) => boolean;
    deleteDisable?: boolean;
    copyDisable?: boolean;
    nodePanelVisible?: boolean;
    getPortsConfig?: (node: any) => any[];
  };
  onAdd?: () => any;
  formMeta?: FormMeta;
  /** 若提供，节点配置弹窗用结构化表单编辑该类型 data；未提供时弹窗为 JSON（与旧侧栏行为一致） */
  renderConfigSidebar?: FC<RuleGoConfigSidebarRenderProps>;

  // RuleGo 扩展字段
  backendNodeType: string;
  category: RuleGoCategory;

  // DSL 转换钩子
  serializeConfiguration?: (node: any) => Record<string, unknown>;
  deserializeConfiguration?: (config: Record<string, unknown>) => Record<string, unknown>;

  // 连接类型映射
  getConnectionType?: (port: any, node: any) => string;
  canConnectTo?: (fromNode: any, toNode: any, connType: string) => boolean;

  // Endpoint 特殊处理
  isEndpoint?: boolean;
  serializeEndpoint?: (node: any) => Record<string, unknown>;
  deserializeEndpoint?: (epData: Record<string, unknown>) => Record<string, unknown>;
}

export * from './dsl';
export * from './registry';
