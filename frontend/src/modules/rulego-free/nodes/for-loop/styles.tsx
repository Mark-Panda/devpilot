/**
 * ForLoop 容器节点样式
 * 对齐 Flowgram free-layout-editor：主画布 #f2f3f5、节点白卡片、子画布 SubCanvas 点阵 + --coz-* 边框（见 variables.css）
 */

import styled from 'styled-components';

export const LoopContainerStyle = styled.div`
  background-color: var(--container-loop-bg);
  border: 1px solid var(--node-border);
  border-radius: var(--node-border-radius);
  box-shadow: var(--node-shadow);

  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 400px;
  min-height: 260px;
  overflow: visible;

  &:hover:not(.selected) {
    border-color: var(--node-border-hover);
  }

  &.selected {
    border: 1px solid var(--node-selected-border);
    box-shadow: var(--node-selected-glow), var(--node-shadow);
  }

  &.error {
    border-color: var(--node-error-border);
    box-shadow: var(--node-error-glow), var(--node-shadow);
  }
`;

export const LoopHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--container-loop-header-border);
  background: #ffffff;
  border-radius: 8px 8px 0 0;
  flex-shrink: 0;
`;

export const LoopHeaderIcon = styled.div`
  font-size: 20px;
  line-height: 1;
  width: 28px;
  height: 28px;
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
  color: rgba(15, 21, 40, 0.92);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 20px;
`;

export const LoopConfigSummary = styled.div`
  font-size: 12px;
  color: rgba(15, 21, 40, 0.55);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  line-height: 18px;

  code {
    background: rgba(6, 7, 9, 0.06);
    color: rgba(15, 21, 40, 0.82);
    padding: 1px 6px;
    border-radius: 4px;
    font-family: ui-monospace, 'SF Mono', Monaco, Consolas, monospace;
    font-size: 11px;
    font-weight: 500;
  }
`;

export const LoopModeBadge = styled.span<{ mode: number }>`
  background: ${(props) => {
    switch (props.mode) {
      case 1:
        return 'rgba(59, 130, 246, 0.12)';
      case 2:
        return 'rgba(245, 158, 11, 0.15)';
      case 3:
        return 'rgba(99, 102, 241, 0.12)';
      default:
        return 'rgba(6, 7, 9, 0.06)';
    }
  }};
  color: ${(props) => {
    switch (props.mode) {
      case 1:
        return '#1d4ed8';
      case 2:
        return '#b45309';
      case 3:
        return '#4f46e5';
      default:
        return 'rgba(15, 21, 40, 0.65)';
    }
  }};
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
`;

/** 子画布区域：不铺背景，让 SubCanvasRender 内点阵与 8px 灰框与官方一致 */
export const LoopBody = styled.div`
  flex: 1;
  position: relative;
  min-height: 168px;
  padding: 0;
  background: var(--container-loop-body-bg);
  border-radius: 0 0 8px 8px;
  display: flex;
  flex-direction: column;
`;

/** 轻量标签，不抢 SubCanvasTips 视觉（tips 由插件渲染在子画布顶部） */
export const LoopBodyLabel = styled.div`
  position: absolute;
  top: 6px;
  left: 10px;
  z-index: 2;
  font-size: 11px;
  font-weight: 500;
  color: var(--container-loop-label-color);
  letter-spacing: 0.02em;
  background: var(--container-loop-label-bg);
  padding: 2px 8px;
  border-radius: 4px;
  pointer-events: none;
`;

export const LoopErrorIndicator = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 50%;
  color: #dc2626;
  font-size: 12px;
  cursor: help;
  z-index: 10;

  &:hover {
    background: #fecaca;
  }
`;
