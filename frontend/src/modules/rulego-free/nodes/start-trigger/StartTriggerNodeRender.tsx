/**
 * Start Trigger 节点渲染组件
 */

import React from 'react';

export function StartTriggerNodeRender() {
  return (
    <div
      style={{
        width: '160px',
        height: '64px',
        background: 'linear-gradient(135deg, #ff6b6b 0%, #ef4444 100%)',
        color: '#ffffff',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: '20px', marginRight: '8px' }}>▶️</span>
      <span>开始</span>
    </div>
  );
}
