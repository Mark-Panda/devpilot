# Spec: UI 组件与样式系统

## 概述

定义编辑器的所有 UI 组件、样式系统、主题配置，确保视觉效果完全符合 Flowgram demo-free-layout 的现代设计。

## 样式系统架构

### 技术栈

- **Styled Components** - 组件级样式
- **CSS Variables** - 全局主题变量
- **CSS Modules** - 工具类样式（可选）
- **Semi Design** - 基础 UI 组件（按钮、输入框、下拉等）

### 颜色系统

```css
/* styles/variables.css */

:root {
  /* ===== 节点分类颜色（与原 Blockly 主题一致）===== */
  --rulego-trigger: #ef4444;
  --rulego-trigger-light: rgba(239, 68, 68, 0.1);
  
  --rulego-action: #3b82f6;
  --rulego-action-light: rgba(59, 130, 246, 0.1);
  
  --rulego-condition: #14b8a6;
  --rulego-condition-light: rgba(20, 184, 166, 0.1);
  
  --rulego-data: #f59e0b;
  --rulego-data-light: rgba(245, 158, 11, 0.1);
  
  --rulego-flow: #8b5cf6;
  --rulego-flow-light: rgba(139, 92, 246, 0.1);
  
  --rulego-db: #0d9488;
  --rulego-db-light: rgba(13, 148, 136, 0.1);
  
  --rulego-file: #b45309;
  --rulego-file-light: rgba(180, 83, 9, 0.1);
  
  --rulego-tracer: #0891b2;
  --rulego-tracer-light: rgba(8, 145, 178, 0.1);
  
  --rulego-rpa: #6366f1;
  --rulego-rpa-light: rgba(99, 102, 241, 0.1);
  
  /* ===== 节点基础样式（Flowgram 风格）===== */
  --node-bg: #ffffff;
  --node-border: rgba(6, 7, 9, 0.15);
  --node-border-hover: rgba(6, 7, 9, 0.25);
  --node-border-radius: 8px;
  --node-shadow: 
    0 2px 6px 0 rgba(0, 0, 0, 0.04),
    0 4px 12px 0 rgba(0, 0, 0, 0.02);
  
  /* 节点选中态 */
  --node-selected-border: #4e40e5;
  --node-selected-glow: 0 0 0 3px rgba(78, 64, 229, 0.1);
  
  /* 节点错误态 */
  --node-error-border: #ff0000;
  --node-error-glow: 0 0 0 3px rgba(255, 0, 0, 0.1);
  
  /* ===== 端口颜色 ===== */
  --port-primary: #4d53e8;
  --port-secondary: #9197f1;
  --port-error: #ff0000;
  --port-bg: #ffffff;
  --port-border: rgba(6, 7, 9, 0.2);
  
  /* ===== 连线颜色 ===== */
  --line-default: #4d53e8;
  --line-drawing: #5dd6e3;
  --line-hover: #37d0ff;
  --line-selected: #37d0ff;
  --line-error: #ff0000;
  
  /* ===== 画布颜色 ===== */
  --canvas-bg: #fafafa;
  --canvas-grid: rgba(148, 163, 184, 0.28);
  
  /* ===== 面板颜色 ===== */
  --panel-bg: #ffffff;
  --panel-border: rgba(6, 7, 9, 0.12);
  --panel-header-bg: #f8f9fa;
  
  /* ===== 容器节点特殊色 ===== */
  --container-loop-bg: #ffffff;
  --container-loop-border: #f59e0b;
  --container-loop-inner-bg: linear-gradient(to bottom, #fef3c7 0%, #fde68a 10%, transparent 20%), #fafafa;
  --container-loop-label-color: #a16207;
  
  --container-group-bg: #ffffff;
  --container-group-border: #8b5cf6;
  --container-group-inner-bg: linear-gradient(to bottom, #ede9fe 0%, #ddd6fe 10%, transparent 20%), #fafafa;
}
```

---

## 基础节点组件

### BaseNode 组件

**职责**：
- 所有节点的通用包装器
- 处理选中态、错误态样式
- 集成 NodeWrapper（拖拽、端口渲染）
- 显示节点状态栏（运行时）

```typescript
// components/base-node/index.tsx

import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import { ConfigProvider } from '@douyinfe/semi-ui';
import { NodeWrapper } from './NodeWrapper';
import { NodeStatusBar } from '../node-status-bar';
import { ErrorIcon } from './styles';

export const BaseNode = ({ node }: { node: FlowNodeEntity }) => {
  const nodeRender = useNodeRender();
  const ctx = useClientContext();
  const form = nodeRender.form;
  
  const getPopupContainer = useCallback(
    () => ctx.playground.node.querySelector('.gedit-flow-render-layer') as HTMLDivElement,
    [ctx]
  );
  
  return (
    <ConfigProvider getPopupContainer={getPopupContainer}>
      <NodeWrapper node={node}>
        {/* 错误指示器 */}
        {form?.state.invalid && <ErrorIcon />}
        
        {/* 节点表单内容 */}
        {form?.render()}
        
        {/* 运行时状态栏 */}
        <NodeStatusBar node={node} />
      </NodeWrapper>
    </ConfigProvider>
  );
};
```

### NodeWrapper 样式

```typescript
// components/base-node/styles.tsx

import styled from 'styled-components';

export const NodeWrapperStyle = styled.div`
  /* 基础外观（Flowgram 风格）*/
  align-items: flex-start;
  background-color: var(--node-bg);
  border: 1px solid var(--node-border);
  border-radius: var(--node-border-radius);
  box-shadow: var(--node-shadow);
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  width: 360px;
  height: auto;
  overflow: hidden;
  
  /* 悬停态 */
  &:hover:not(.selected) {
    border-color: var(--node-border-hover);
  }
  
  /* 选中态 */
  &.selected,
  &[data-node-selected="true"] {
    border: 1px solid var(--node-selected-border);
    box-shadow: 
      var(--node-selected-glow),
      var(--node-shadow);
  }
  
  /* 错误态 */
  &.error {
    border-color: var(--node-error-border);
    box-shadow: 
      var(--node-error-glow),
      var(--node-shadow);
  }
  
  /* 运行态动画 */
  &.running {
    border: 1px dashed var(--node-selected-border);
    animation: node-pulse 2s infinite;
  }
  
  @keyframes node-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
`;

export const ErrorIcon = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  color: var(--node-error-border);
  z-index: 10;
  
  &::before {
    content: '⚠️';
    font-size: 16px;
  }
`;
```

---

## Loop 容器节点样式（★ 重点）

### LoopNodeRender 组件

```typescript
// nodes/for-loop/LoopNodeRender.tsx

import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import { SubCanvasRender } from '@flowgram.ai/free-container-plugin';
import {
  LoopContainerStyle,
  LoopHeader,
  LoopHeaderIcon,
  LoopHeaderInfo,
  LoopTitle,
  LoopConfigSummary,
  LoopModeBadge,
  LoopBody,
  LoopBodyLabel,
  LoopErrorIndicator,
} from './styles';

export const LoopNodeRender = () => {
  const { node, selected } = useNodeRender();
  const form = useNodeRender().form;
  
  // 执行模式标签
  const modeLabels = ['忽略', '追加', '覆盖', '异步'];
  const mode = node.data.mode || 0;
  
  return (
    <LoopContainerStyle 
      className={`
        ${selected ? 'selected' : ''}
        ${form?.state.invalid ? 'error' : ''}
      `}
    >
      {/* ===== 头部区域 ===== */}
      <LoopHeader>
        <LoopHeaderIcon>🔁</LoopHeaderIcon>
        
        <LoopHeaderInfo>
          <LoopTitle>{node.data.title || 'Loop'}</LoopTitle>
          
          <LoopConfigSummary>
            范围: <code>{node.data.range || '1..3'}</code>
            
            {mode !== 0 && (
              <LoopModeBadge mode={mode}>
                {modeLabels[mode]}
              </LoopModeBadge>
            )}
          </LoopConfigSummary>
        </LoopHeaderInfo>
      </LoopHeader>
      
      {/* ===== 子画布容器 ===== */}
      <LoopBody>
        <LoopBodyLabel>Do 循环体</LoopBodyLabel>
        <SubCanvasRender />
      </LoopBody>
      
      {/* ===== 错误指示器 ===== */}
      {form?.state.invalid && (
        <LoopErrorIndicator title="配置有误，请检查">
          ⚠️
        </LoopErrorIndicator>
      )}
    </LoopContainerStyle>
  );
};
```

### Loop 样式定义（完全采用 Flowgram 风格）

```typescript
// nodes/for-loop/styles.tsx

import styled from 'styled-components';

// 容器主体
export const LoopContainerStyle = styled.div`
  /* 基础外观 */
  background-color: var(--container-loop-bg);
  border: 1px solid var(--node-border);
  border-radius: var(--node-border-radius);
  box-shadow: var(--node-shadow);
  
  /* 布局 */
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 424px;
  min-height: 244px;
  overflow: visible;
  
  /* 悬停态 */
  &:hover:not(.selected) {
    border-color: var(--node-border-hover);
  }
  
  /* 选中态（蓝色边框 + 光晕）*/
  &.selected {
    border: 1px solid var(--node-selected-border);
    box-shadow: 
      var(--node-selected-glow),
      var(--node-shadow);
  }
  
  /* 错误态（红色边框 + 光晕）*/
  &.error {
    border-color: var(--node-error-border);
    box-shadow: 
      var(--node-error-glow),
      var(--node-shadow);
  }
`;

// 头部区域
export const LoopHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(6, 7, 9, 0.08);
  background: linear-gradient(to bottom, #fafafa, #ffffff);
  border-radius: 8px 8px 0 0;
  flex-shrink: 0;
`;

export const LoopHeaderIcon = styled.div`
  font-size: 24px;
  line-height: 1;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--rulego-data-light);
  border-radius: 6px;
`;

export const LoopHeaderInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

export const LoopTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const LoopConfigSummary = styled.div`
  font-size: 12px;
  color: #71717a;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  
  code {
    background: var(--rulego-data-light);
    color: var(--rulego-data);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
    font-size: 11px;
    font-weight: 500;
  }
`;

export const LoopModeBadge = styled.span<{ mode: number }>`
  background: ${props => {
    switch (props.mode) {
      case 1: return '#dbeafe'; // 追加 - 蓝
      case 2: return '#fef3c7'; // 覆盖 - 黄
      case 3: return '#e0e7ff'; // 异步 - 紫
      default: return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.mode) {
      case 1: return '#1e40af';
      case 2: return '#92400e';
      case 3: return '#4c1d95';
      default: return '#374151';
    }
  }};
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

// 子画布区域
export const LoopBody = styled.div`
  flex: 1;
  position: relative;
  min-height: 180px;
  padding: 16px;
  
  /* 渐变背景（黄色系，表示数据处理类）*/
  background: var(--container-loop-inner-bg);
  border-radius: 0 0 8px 8px;
`;

export const LoopBodyLabel = styled.div`
  position: absolute;
  top: 8px;
  left: 16px;
  font-size: 10px;
  color: var(--container-loop-label-color);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(254, 243, 199, 0.8);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(245, 158, 11, 0.3);
  z-index: 1;
`;

export const LoopErrorIndicator = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 50%;
  color: #dc2626;
  font-size: 14px;
  cursor: help;
  z-index: 10;
  
  &:hover {
    background: #fecaca;
  }
`;
```

---

## 节点面板组件

### NodePanel 主组件

```typescript
// components/node-panel/index.tsx

import { useState, useMemo } from 'react';
import { CategorySection } from './CategorySection';
import { NodePanelStyle, SearchInput, EmptyState } from './styles';
import { rulegoNodeRegistries } from '../../nodes';

export function RuleGoNodePanel() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['trigger', 'action', 'data'])  // 默认展开常用分类
  );
  
  // 按分类分组
  const categories = useMemo(() => {
    const groups: Record<string, RuleGoNodeRegistry[]> = {
      trigger: [],
      action: [],
      condition: [],
      data: [],
      flow: [],
      db: [],
      file: [],
      tracer: [],
      rpa: [],
    };
    
    rulegoNodeRegistries.forEach(registry => {
      const cat = registry.category || 'action';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(registry);
    });
    
    return Object.entries(groups)
      .filter(([_, nodes]) => nodes.length > 0)
      .map(([cat, nodes]) => ({
        id: cat,
        name: CATEGORY_NAMES[cat] || cat,
        nodes,
      }));
  }, []);
  
  // 搜索过滤
  const filteredCategories = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return categories;
    
    return categories
      .map(cat => ({
        ...cat,
        nodes: cat.nodes.filter(node => 
          node.type.toLowerCase().includes(keyword) ||
          node.info.description.toLowerCase().includes(keyword) ||
          node.backendNodeType.toLowerCase().includes(keyword)
        ),
      }))
      .filter(cat => cat.nodes.length > 0);
  }, [categories, searchKeyword]);
  
  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };
  
  return (
    <NodePanelStyle>
      <SearchInput
        type="text"
        placeholder="搜索节点..."
        value={searchKeyword}
        onChange={(e) => setSearchKeyword(e.target.value)}
      />
      
      {filteredCategories.length === 0 ? (
        <EmptyState>
          {searchKeyword ? '未找到匹配的节点' : '暂无节点'}
        </EmptyState>
      ) : (
        filteredCategories.map(cat => (
          <CategorySection
            key={cat.id}
            category={cat}
            expanded={expandedCategories.has(cat.id)}
            onToggle={() => toggleCategory(cat.id)}
          />
        ))
      )}
    </NodePanelStyle>
  );
}

const CATEGORY_NAMES: Record<string, string> = {
  trigger: '触发器',
  action: '动作',
  condition: '条件判断',
  data: '数据处理',
  flow: '流程控制',
  db: '数据库',
  file: '文件',
  tracer: 'API 追踪',
  rpa: 'RPA',
};
```

### CategorySection 组件

```typescript
// components/node-panel/CategorySection.tsx

import { NodeDragItem } from './NodeDragItem';
import { CategoryStyle, CategoryHeader, CategoryBadge, NodeList } from './styles';

export function CategorySection({ category, expanded, onToggle }) {
  const categoryColor = `var(--rulego-${category.id})`;
  const categoryLightColor = `var(--rulego-${category.id}-light)`;
  
  return (
    <CategoryStyle>
      <CategoryHeader
        onClick={onToggle}
        style={{
          background: categoryLightColor,
          borderLeftColor: categoryColor,
        }}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>{category.name}</span>
        <CategoryBadge>{category.nodes.length}</CategoryBadge>
      </CategoryHeader>
      
      {expanded && (
        <NodeList>
          {category.nodes.map(node => (
            <NodeDragItem
              key={node.type}
              registry={node}
              categoryColor={categoryColor}
            />
          ))}
        </NodeList>
      )}
    </CategoryStyle>
  );
}
```

### NodeDragItem 组件

```typescript
// components/node-panel/NodeDragItem.tsx

export function NodeDragItem({ registry, categoryColor }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/flowgram-node-type', registry.type);
    e.dataTransfer.effectAllowed = 'copy';
  };
  
  return (
    <NodeItemStyle
      draggable
      onDragStart={handleDragStart}
      style={{ borderLeftColor: categoryColor }}
    >
      <NodeIcon src={registry.info.icon} alt="" />
      <NodeLabel>{getNodeLabel(registry)}</NodeLabel>
      <DragHint>⋮⋮</DragHint>
    </NodeItemStyle>
  );
}

const NodeItemStyle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-left: 3px solid transparent;
  cursor: grab;
  background: #ffffff;
  border-radius: 4px;
  margin-bottom: 4px;
  
  &:hover {
    background: #f8f9fa;
    border-left-color: inherit;
  }
  
  &:active {
    cursor: grabbing;
    transform: scale(0.98);
  }
`;
```

---

## 工具栏组件

```typescript
// components/toolbar/index.tsx

export function RuleGoToolbar({
  ruleName,
  onRuleNameChange,
  unsaved,
  onSave,
  onImport,
  onExport,
  onAgentPlan,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ToolbarProps) {
  return (
    <ToolbarStyle>
      {/* 左侧：标题区 */}
      <ToolbarLeft>
        <h1 className="editor-title">规则链编辑器</h1>
        
        <RuleNameInput
          type="text"
          value={ruleName}
          onChange={(e) => onRuleNameChange(e.target.value)}
          placeholder="规则链名称"
        />
        
        {unsaved && <UnsavedBadge>未保存</UnsavedBadge>}
      </ToolbarLeft>
      
      {/* 右侧：操作按钮 */}
      <ToolbarRight>
        <ToolbarButtonGroup>
          <ToolbarButton onClick={onUndo} disabled={!canUndo} title="撤销 (Cmd+Z)">
            ↶
          </ToolbarButton>
          <ToolbarButton onClick={onRedo} disabled={!canRedo} title="重做 (Cmd+Shift+Z)">
            ↷
          </ToolbarButton>
        </ToolbarButtonGroup>
        
        <ToolbarButtonGroup>
          <ToolbarButton onClick={onImport}>导入</ToolbarButton>
          <ToolbarButton onClick={onExport}>导出</ToolbarButton>
        </ToolbarButtonGroup>
        
        <ToolbarButton onClick={onAgentPlan} variant="secondary">
          AI 规划
        </ToolbarButton>
        
        <ToolbarButton onClick={onSave} variant="primary" disabled={!unsaved}>
          {unsaved ? '保存' : '已保存'}
        </ToolbarButton>
      </ToolbarRight>
    </ToolbarStyle>
  );
}

const ToolbarStyle = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--panel-border);
  flex-shrink: 0;
`;

const ToolbarButton = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--panel-border);
  background: ${props => {
    if (props.variant === 'primary') return '#4e40e5';
    if (props.variant === 'secondary') return '#ffffff';
    return '#f8f9fa';
  }};
  color: ${props => props.variant === 'primary' ? '#ffffff' : '#18181b'};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover:not(:disabled) {
    background: ${props => {
      if (props.variant === 'primary') return '#4338ca';
      return '#e5e7eb';
    }};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
```

---

## 配置侧边栏

### NodeConfigPanel

```typescript
// components/sidebar/NodeConfigPanel.tsx

export function NodeConfigPanel({ node, registry }: NodeConfigPanelProps) {
  if (!node || !registry) {
    return <EmptyState />;
  }
  
  return (
    <SidebarStyle>
      <SidebarHeader>
        <NodeTypeIcon src={registry.info.icon} alt="" />
        <div>
          <NodeTypeName>{getNodeLabel(registry)}</NodeTypeName>
          <NodeTypeDesc>{registry.info.description}</NodeTypeDesc>
        </div>
      </SidebarHeader>
      
      <SidebarBody>
        {/* 渲染节点的表单 */}
        {registry.formMeta.render({ form: node.form, node })}
      </SidebarBody>
    </SidebarStyle>
  );
}

const SidebarStyle = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel-bg);
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--panel-border);
  background: var(--panel-header-bg);
`;

const SidebarBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  
  /* 滚动条样式 */
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }
`;
```

---

## 表单组件库

### FormHeader

```typescript
// form-components/FormHeader.tsx

export function FormHeader({ title, icon }: { title: string; icon?: string }) {
  return (
    <FormHeaderStyle>
      {icon && <span className="form-icon">{icon}</span>}
      <h3>{title}</h3>
    </FormHeaderStyle>
  );
}

const FormHeaderStyle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  
  h3 {
    font-size: 16px;
    font-weight: 600;
    color: #18181b;
    margin: 0;
  }
  
  .form-icon {
    font-size: 20px;
  }
`;
```

### FormItem

```typescript
// form-components/FormItem.tsx

export function FormItem({
  label,
  required,
  children,
}: FormItemProps) {
  return (
    <FormItemStyle>
      <FormLabel>
        {label}
        {required && <RequiredMark>*</RequiredMark>}
      </FormLabel>
      <FormControl>{children}</FormControl>
    </FormItemStyle>
  );
}

const FormItemStyle = styled.div`
  margin-bottom: 20px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const FormLabel = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
`;

const RequiredMark = styled.span`
  color: #dc2626;
  margin-left: 2px;
`;

const FormControl = styled.div`
  /* 表单控件容器 */
  
  input, textarea, select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--panel-border);
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    background: #ffffff;
    
    &:focus {
      outline: none;
      border-color: #4e40e5;
      box-shadow: 0 0 0 3px rgba(78, 64, 229, 0.1);
    }
    
    &.error {
      border-color: #dc2626;
    }
    
    &:disabled {
      background: #f3f4f6;
      color: #9ca3af;
      cursor: not-allowed;
    }
  }
  
  textarea {
    resize: vertical;
    min-height: 80px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 12px;
  }
  
  .form-hint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: #6b7280;
  }
`;
```

---

## 动画系统

```css
/* styles/animations.css */

/* 节点出现动画 */
@keyframes node-appear {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.flow-node-enter {
  animation: node-appear 0.2s ease-out;
}

/* 节点脉冲（运行时）*/
@keyframes node-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.02);
  }
}

.node-running {
  animation: node-pulse 2s infinite;
}

/* 连线绘制动画 */
@keyframes line-draw {
  from {
    stroke-dashoffset: 1000;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.line-drawing {
  stroke-dasharray: 10;
  animation: line-draw 20s linear infinite;
}

/* 侧边栏滑入 */
@keyframes sidebar-slide-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.sidebar-enter {
  animation: sidebar-slide-in 0.3s ease-out;
}
```

---

## 响应式设计

### 断点定义

```typescript
export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
  wide: 1920,
};
```

### 布局适配

```css
/* 小屏幕：隐藏节点面板，全屏编辑 */
@media (max-width: 768px) {
  .rulego-node-panel {
    display: none;
  }
  
  .rulego-free-editor {
    width: 100%;
  }
  
  /* 工具栏简化 */
  .toolbar-button-group {
    display: none;
  }
}

/* 中等屏幕：节点面板可折叠 */
@media (min-width: 769px) and (max-width: 1024px) {
  .rulego-node-panel {
    width: 240px;
  }
  
  .node-item-label {
    font-size: 12px;
  }
}

/* 大屏幕：完整布局 */
@media (min-width: 1025px) {
  .rulego-node-panel {
    width: 280px;
  }
  
  .rulego-sidebar {
    width: 360px;
  }
}
```

---

## 主题切换支持（可选）

### 深色主题变量

```css
/* styles/theme-dark.css */

[data-theme="dark"] {
  /* 节点 */
  --node-bg: #222236;
  --node-border: #4a4d6a;
  --node-shadow: 
    0 2px 6px 0 rgba(0, 0, 0, 0.3),
    0 4px 12px 0 rgba(0, 0, 0, 0.2);
  
  /* 画布 */
  --canvas-bg: #12121c;
  --canvas-grid: rgba(148, 163, 184, 0.15);
  
  /* 面板 */
  --panel-bg: #1a1a2e;
  --panel-border: #4a4d6a;
  --panel-header-bg: #222236;
  
  /* 文字 */
  --text-primary: #e8e8f0;
  --text-secondary: #a8a8c0;
  --text-muted: #6b6b8a;
}
```

### 主题切换逻辑

```typescript
// hooks/useTheme.ts

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };
  
  return { theme, toggleTheme };
}
```

---

## 验收标准

### 视觉效果

- [ ] 所有节点使用白色卡片样式 + 8px 圆角 + 双层投影
- [ ] Loop 容器节点样式与 Flowgram demo 100% 一致
- [ ] 节点选中态有蓝色边框和光晕效果
- [ ] 节点错误态有红色边框和错误图标
- [ ] 连线使用 Flowgram 的颜色和样式
- [ ] 端口样式符合 Flowgram 规范

### 组件功能

- [ ] BaseNode 正确处理所有节点状态
- [ ] NodePanel 支持搜索和分类折叠
- [ ] Toolbar 所有按钮功能正常
- [ ] Sidebar 配置面板正确显示表单
- [ ] 表单组件支持所有输入类型

### 交互体验

- [ ] 节点拖拽流畅无延迟
- [ ] 对齐辅助线正确显示
- [ ] 小地图导航准确
- [ ] 右键菜单响应及时
- [ ] 所有动画平滑自然

### 响应式

- [ ] 在不同屏幕尺寸下布局正常
- [ ] 移动端可基本操作（可选）

### 主题

- [ ] 深色主题样式正确（可选）
- [ ] 主题切换无闪烁
