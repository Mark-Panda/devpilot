/**
 * HTTP 触发器（Endpoint）配置 UI
 */

import React, { useCallback } from 'react';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import { Input, Select, TextArea, Switch } from '@douyinfe/semi-ui';
import styled from 'styled-components';
import type { HttpTriggerData } from './types';

const Wrap = styled.div`
  width: 320px;
  padding: 10px 12px 12px;
  background: linear-gradient(145deg, #0f766e 0%, #115e59 100%);
  color: #ecfdf5;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(17, 94, 89, 0.35);
  font-size: 12px;
`;

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
`;

const Row = styled.div`
  margin-bottom: 8px;
`;

const Label = styled.div`
  margin-bottom: 4px;
  opacity: 0.9;
  font-size: 11px;
`;

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => ({
  label: m,
  value: m,
}));

export function HttpTriggerNodeRender() {
  const nodeRender = useNodeRender();
  const data = nodeRender.data as HttpTriggerData;
  const updateData = nodeRender.updateData;

  const patch = useCallback(
    (partial: Partial<HttpTriggerData>) => {
      updateData({ ...data, ...partial });
    },
    [data, updateData]
  );

  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>
        <span aria-hidden>🌐</span>
        <span>HTTP 端点</span>
      </Title>

      <Row>
        <Label>名称</Label>
        <Input
          size="small"
          value={data?.name ?? ''}
          onChange={(v) => patch({ name: String(v) })}
        />
      </Row>

      <Row>
        <Label>监听 Server</Label>
        <Input
          size="small"
          value={data?.server ?? ''}
          onChange={(v) => patch({ server: String(v) })}
          placeholder=":9090"
        />
      </Row>

      <Row style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Label style={{ marginBottom: 0 }}>允许 CORS</Label>
        <Switch
          checked={!!data?.allowCors}
          onChange={(c) => patch({ allowCors: !!c })}
        />
      </Row>

      <Row>
        <Label>路由 ID</Label>
        <Input
          size="small"
          value={data?.routerId ?? ''}
          onChange={(v) => patch({ routerId: String(v) })}
          placeholder="可空，按 path 生成"
        />
      </Row>

      <Row style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Label>Method</Label>
          <Select
            size="small"
            style={{ width: '100%' }}
            value={data?.method ?? 'POST'}
            optionList={METHOD_OPTIONS}
            onChange={(v) => patch({ method: String(v ?? 'POST') })}
          />
        </div>
        <div style={{ flex: 2 }}>
          <Label>路径</Label>
          <Input
            size="small"
            value={data?.path ?? ''}
            onChange={(v) => patch({ path: String(v) })}
            placeholder="/api/v1/hook"
          />
        </div>
      </Row>

      <Row>
        <Label>转发到链（to.path）</Label>
        <Input
          size="small"
          value={data?.to ?? ''}
          onChange={(v) => patch({ to: String(v) })}
          placeholder="chain:default"
        />
      </Row>

      <Row style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Label style={{ marginBottom: 0 }}>同步等待</Label>
        <Switch checked={!!data?.wait} onChange={(c) => patch({ wait: !!c })} />
      </Row>

      <Row>
        <Label>To Processors（逗号分隔）</Label>
        <Input
          size="small"
          value={data?.toProcessors ?? ''}
          onChange={(v) => patch({ toProcessors: String(v) })}
        />
      </Row>

      <Row>
        <Label>额外 Routers（JSON 数组）</Label>
        <TextArea
          rows={4}
          value={data?.extraRoutersJson ?? ''}
          onChange={(v) => patch({ extraRoutersJson: String(v) })}
          placeholder="[]"
        />
      </Row>
    </Wrap>
  );
}
