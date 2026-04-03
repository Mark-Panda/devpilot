/**
 * RestApiCall 节点渲染组件
 */

import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  width: 200px;
  min-height: 80px;
  background: linear-gradient(135deg, #4e40e5 0%, #3b32c7 100%);
  color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(78, 64, 229, 0.3);
  padding: 12px;
  cursor: pointer;
  user-select: none;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
`;

const Icon = styled.span`
  font-size: 18px;
  margin-right: 8px;
`;

const ConfigRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
`;

const Label = styled.span`
  opacity: 0.9;
  min-width: 40px;
`;

export function RestApiCallNodeRender() {
  return (
    <Container>
      <Header>
        <Icon>🌐</Icon>
        <span>HTTP 请求</span>
      </Header>
      <ConfigRow>
        <Label>方法</Label>
        <span style={{ opacity: 0.8 }}>POST</span>
      </ConfigRow>
      <ConfigRow>
        <Label>URL</Label>
        <span style={{ 
          opacity: 0.8, 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          /api/...
        </span>
      </ConfigRow>
    </Container>
  );
}
