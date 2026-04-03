/**
 * T5.2 RPA 节点（对齐 Blockly rpaNodes.ts）
 */

import React, { useCallback } from 'react';
import { Input, InputNumber, Select } from '@douyinfe/semi-ui';
import { useNodeRender } from '@flowgram.ai/free-layout-editor';
import styled from 'styled-components';

import type { RuleGoNodeRegistry } from '../../types';
import { RpaNodeType } from '../constants';
import { SF_PORTS } from '../t43/sfPorts';

const Wrap = styled.div`
  width: 400px;
  padding: 10px 12px 12px;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  font-size: 12px;
`;
const Title = styled.div`
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
`;
const Row = styled.div`
  margin-bottom: 8px;
`;
const Lb = styled.div`
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
`;

const RPA_DEBUGGER = 'http://127.0.0.1:9222';

const SF_META = {
  size: { width: 400, height: 260 },
  defaultPorts: [...SF_PORTS],
  deleteDisable: false,
  copyDisable: false,
  nodePanelVisible: true,
} as const;

function getSFConnectionType(port: { portID?: string; id?: string }) {
  const pid = port?.portID ?? port?.id;
  if (pid === 'success') return 'Success';
  if (pid === 'failure') return 'Failure';
  return 'Default';
}

/* ---------- Navigate ---------- */
function RpaNavigateForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { debuggerUrl?: string; url?: string; timeoutMs?: number };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>浏览器打开 URL</Title>
      <Row>
        <Lb>debuggerUrl</Lb>
        <Input size="small" value={String(d.debuggerUrl ?? RPA_DEBUGGER)} onChange={(v) => patch({ debuggerUrl: String(v) })} />
      </Row>
      <Row>
        <Lb>url</Lb>
        <Input size="small" value={String(d.url ?? 'https://example.com')} onChange={(v) => patch({ url: String(v) })} />
      </Row>
      <Row>
        <Lb>timeoutMs</Lb>
        <InputNumber size="small" value={Number(d.timeoutMs ?? 30000)} onChange={(v) => patch({ timeoutMs: Number(v) || 30000 })} />
      </Row>
    </Wrap>
  );
}

export const RpaBrowserNavigateRegistry: RuleGoNodeRegistry = {
  type: RpaNodeType.RpaBrowserNavigate,
  backendNodeType: 'x/rpaBrowserNavigate',
  category: 'rpa',
  info: { icon: '🌐', description: 'RPA 浏览器打开 URL' },
  meta: SF_META,
  onAdd: () => ({ data: { debuggerUrl: RPA_DEBUGGER, url: 'https://example.com', timeoutMs: 30000 } }),
  formMeta: { render: () => <RpaNavigateForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      debuggerUrl: String(d.debuggerUrl ?? RPA_DEBUGGER) || RPA_DEBUGGER,
      url: String(d.url ?? ''),
      timeoutMs: Number(d.timeoutMs ?? 30000) || 30000,
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      debuggerUrl: String(o.debuggerUrl ?? RPA_DEBUGGER),
      url: String(o.url ?? 'https://example.com'),
      timeoutMs: Number(o.timeoutMs ?? 30000) || 30000,
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- Click ---------- */
function RpaClickForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { debuggerUrl?: string; selector?: string; button?: string; timeoutMs?: number };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>浏览器点击</Title>
      <Row>
        <Lb>debuggerUrl</Lb>
        <Input size="small" value={String(d.debuggerUrl ?? RPA_DEBUGGER)} onChange={(v) => patch({ debuggerUrl: String(v) })} />
      </Row>
      <Row>
        <Lb>selector</Lb>
        <Input size="small" value={String(d.selector ?? 'button.submit')} onChange={(v) => patch({ selector: String(v) })} />
      </Row>
      <Row>
        <Lb>button</Lb>
        <Select
          size="small"
          value={String(d.button ?? 'left')}
          optionList={[
            { label: '左键', value: 'left' },
            { label: '右键', value: 'right' },
          ]}
          onChange={(v) => patch({ button: String(v) })}
        />
      </Row>
      <Row>
        <Lb>timeoutMs</Lb>
        <InputNumber size="small" value={Number(d.timeoutMs ?? 30000)} onChange={(v) => patch({ timeoutMs: Number(v) || 30000 })} />
      </Row>
    </Wrap>
  );
}

export const RpaBrowserClickRegistry: RuleGoNodeRegistry = {
  type: RpaNodeType.RpaBrowserClick,
  backendNodeType: 'x/rpaBrowserClick',
  category: 'rpa',
  info: { icon: '🖱', description: 'RPA 浏览器点击' },
  meta: SF_META,
  onAdd: () => ({
    data: { debuggerUrl: RPA_DEBUGGER, selector: 'button.submit', button: 'left', timeoutMs: 30000 },
  }),
  formMeta: { render: () => <RpaClickForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      debuggerUrl: String(d.debuggerUrl ?? RPA_DEBUGGER) || RPA_DEBUGGER,
      selector: String(d.selector ?? ''),
      button: String(d.button ?? 'left'),
      timeoutMs: Number(d.timeoutMs ?? 30000) || 30000,
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      debuggerUrl: String(o.debuggerUrl ?? RPA_DEBUGGER),
      selector: String(o.selector ?? 'button.submit'),
      button: String(o.button ?? 'left'),
      timeoutMs: Number(o.timeoutMs ?? 30000) || 30000,
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- Screenshot ---------- */
function RpaShotForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { debuggerUrl?: string; selector?: string; timeoutMs?: number };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>浏览器截图</Title>
      <Row>
        <Lb>debuggerUrl</Lb>
        <Input size="small" value={String(d.debuggerUrl ?? RPA_DEBUGGER)} onChange={(v) => patch({ debuggerUrl: String(v) })} />
      </Row>
      <Row>
        <Lb>selector（可选）</Lb>
        <Input size="small" value={String(d.selector ?? '')} onChange={(v) => patch({ selector: String(v) })} />
      </Row>
      <Row>
        <Lb>timeoutMs</Lb>
        <InputNumber size="small" value={Number(d.timeoutMs ?? 30000)} onChange={(v) => patch({ timeoutMs: Number(v) || 30000 })} />
      </Row>
    </Wrap>
  );
}

export const RpaBrowserScreenshotRegistry: RuleGoNodeRegistry = {
  type: RpaNodeType.RpaBrowserScreenshot,
  backendNodeType: 'x/rpaBrowserScreenshot',
  category: 'rpa',
  info: { icon: '📷', description: 'RPA 浏览器截图' },
  meta: SF_META,
  onAdd: () => ({ data: { debuggerUrl: RPA_DEBUGGER, selector: '', timeoutMs: 30000 } }),
  formMeta: { render: () => <RpaShotForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      debuggerUrl: String(d.debuggerUrl ?? RPA_DEBUGGER) || RPA_DEBUGGER,
      selector: String(d.selector ?? ''),
      timeoutMs: Number(d.timeoutMs ?? 30000) || 30000,
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      debuggerUrl: String(o.debuggerUrl ?? RPA_DEBUGGER),
      selector: String(o.selector ?? ''),
      timeoutMs: Number(o.timeoutMs ?? 30000) || 30000,
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- Query ---------- */
function RpaQueryForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as {
    debuggerUrl?: string;
    selector?: string;
    queryMode?: string;
    attributeName?: string;
    timeoutMs?: number;
  };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>浏览器选择器查询</Title>
      <Row>
        <Lb>debuggerUrl</Lb>
        <Input size="small" value={String(d.debuggerUrl ?? RPA_DEBUGGER)} onChange={(v) => patch({ debuggerUrl: String(v) })} />
      </Row>
      <Row>
        <Lb>selector</Lb>
        <Input size="small" value={String(d.selector ?? 'h1')} onChange={(v) => patch({ selector: String(v) })} />
      </Row>
      <Row>
        <Lb>queryMode</Lb>
        <Select
          size="small"
          value={String(d.queryMode ?? 'text')}
          optionList={[
            { label: 'text', value: 'text' },
            { label: 'html', value: 'html' },
            { label: 'value', value: 'value' },
            { label: 'attr', value: 'attr' },
          ]}
          onChange={(v) => patch({ queryMode: String(v) })}
        />
      </Row>
      <Row>
        <Lb>attributeName（attr 时）</Lb>
        <Input size="small" value={String(d.attributeName ?? 'href')} onChange={(v) => patch({ attributeName: String(v) })} />
      </Row>
      <Row>
        <Lb>timeoutMs</Lb>
        <InputNumber size="small" value={Number(d.timeoutMs ?? 30000)} onChange={(v) => patch({ timeoutMs: Number(v) || 30000 })} />
      </Row>
    </Wrap>
  );
}

export const RpaBrowserQueryRegistry: RuleGoNodeRegistry = {
  type: RpaNodeType.RpaBrowserQuery,
  backendNodeType: 'x/rpaBrowserQuery',
  category: 'rpa',
  info: { icon: '🔍', description: 'RPA 浏览器 DOM 查询' },
  meta: { ...SF_META, size: { width: 400, height: 320 } },
  onAdd: () => ({
    data: {
      debuggerUrl: RPA_DEBUGGER,
      selector: 'h1',
      queryMode: 'text',
      attributeName: 'href',
      timeoutMs: 30000,
    },
  }),
  formMeta: { render: () => <RpaQueryForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      debuggerUrl: String(d.debuggerUrl ?? RPA_DEBUGGER) || RPA_DEBUGGER,
      selector: String(d.selector ?? ''),
      queryMode: String(d.queryMode ?? 'text'),
      attributeName: String(d.attributeName ?? ''),
      timeoutMs: Number(d.timeoutMs ?? 30000) || 30000,
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      debuggerUrl: String(o.debuggerUrl ?? RPA_DEBUGGER),
      selector: String(o.selector ?? 'h1'),
      queryMode: String(o.queryMode ?? 'text'),
      attributeName: String(o.attributeName ?? 'href'),
      timeoutMs: Number(o.timeoutMs ?? 30000) || 30000,
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- OCR ---------- */
function RpaOcrForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { imagePath?: string; lang?: string; tesseractPath?: string };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>OCR 识别</Title>
      <Row>
        <Lb>imagePath</Lb>
        <Input size="small" value={String(d.imagePath ?? '')} onChange={(v) => patch({ imagePath: String(v) })} />
      </Row>
      <Row>
        <Lb>lang</Lb>
        <Input size="small" value={String(d.lang ?? 'eng')} onChange={(v) => patch({ lang: String(v) })} />
      </Row>
      <Row>
        <Lb>tesseractPath</Lb>
        <Input size="small" value={String(d.tesseractPath ?? 'tesseract')} onChange={(v) => patch({ tesseractPath: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const RpaOcrRegistry: RuleGoNodeRegistry = {
  type: RpaNodeType.RpaOcr,
  backendNodeType: 'x/rpaOcr',
  category: 'rpa',
  info: { icon: '📝', description: 'RPA OCR' },
  meta: { ...SF_META, size: { width: 400, height: 220 } },
  onAdd: () => ({ data: { imagePath: '', lang: 'eng', tesseractPath: 'tesseract' } }),
  formMeta: { render: () => <RpaOcrForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      imagePath: String(d.imagePath ?? ''),
      lang: String(d.lang ?? 'eng'),
      tesseractPath: String(d.tesseractPath ?? 'tesseract'),
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      imagePath: String(o.imagePath ?? ''),
      lang: String(o.lang ?? 'eng'),
      tesseractPath: String(o.tesseractPath ?? 'tesseract'),
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- Screen capture ---------- */
function RpaCapForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as {
    mode?: string;
    top?: number;
    left?: number;
    width?: number;
    height?: number;
    outputPath?: string;
  };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>屏幕截图</Title>
      <Row>
        <Lb>mode</Lb>
        <Select
          size="small"
          value={String(d.mode ?? 'full')}
          optionList={[
            { label: '全屏', value: 'full' },
            { label: '区域', value: 'region' },
          ]}
          onChange={(v) => patch({ mode: String(v) })}
        />
      </Row>
      <Row>
        <Lb>top / left / width / height</Lb>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <InputNumber size="small" value={Number(d.top ?? 0)} onChange={(v) => patch({ top: Number(v) || 0 })} />
          <InputNumber size="small" value={Number(d.left ?? 0)} onChange={(v) => patch({ left: Number(v) || 0 })} />
          <InputNumber size="small" value={Number(d.width ?? 800)} onChange={(v) => patch({ width: Number(v) || 0 })} />
          <InputNumber size="small" value={Number(d.height ?? 600)} onChange={(v) => patch({ height: Number(v) || 0 })} />
        </div>
      </Row>
      <Row>
        <Lb>outputPath</Lb>
        <Input size="small" value={String(d.outputPath ?? '')} onChange={(v) => patch({ outputPath: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const RpaScreenCaptureRegistry: RuleGoNodeRegistry = {
  type: RpaNodeType.RpaScreenCapture,
  backendNodeType: 'x/rpaScreenCapture',
  category: 'rpa',
  info: { icon: '🖼', description: 'RPA 屏幕截图' },
  meta: { ...SF_META, size: { width: 400, height: 300 } },
  onAdd: () => ({
    data: { mode: 'full', top: 0, left: 0, width: 800, height: 600, outputPath: '' },
  }),
  formMeta: { render: () => <RpaCapForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      mode: String(d.mode ?? 'full'),
      top: Number(d.top ?? 0) || 0,
      left: Number(d.left ?? 0) || 0,
      width: Number(d.width ?? 0) || 0,
      height: Number(d.height ?? 0) || 0,
      outputPath: String(d.outputPath ?? ''),
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      mode: String(o.mode ?? 'full'),
      top: Number(o.top ?? 0) || 0,
      left: Number(o.left ?? 0) || 0,
      width: Number(o.width ?? 800) || 0,
      height: Number(o.height ?? 600) || 0,
      outputPath: String(o.outputPath ?? ''),
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- macOS window ---------- */
function RpaMacWinForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { action?: string; appName?: string; windowTitle?: string };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>macOS 窗口</Title>
      <Row>
        <Lb>action</Lb>
        <Select
          size="small"
          value={String(d.action ?? 'frontmost')}
          optionList={[
            { label: '前置窗口信息', value: 'frontmost' },
            { label: '激活应用', value: 'activate' },
            { label: '列出窗口', value: 'list' },
          ]}
          onChange={(v) => patch({ action: String(v) })}
        />
      </Row>
      <Row>
        <Lb>appName</Lb>
        <Input size="small" value={String(d.appName ?? '')} onChange={(v) => patch({ appName: String(v) })} />
      </Row>
      <Row>
        <Lb>windowTitle</Lb>
        <Input size="small" value={String(d.windowTitle ?? '')} onChange={(v) => patch({ windowTitle: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const RpaMacWindowRegistry: RuleGoNodeRegistry = {
  type: RpaNodeType.RpaMacWindow,
  backendNodeType: 'x/rpaMacWindow',
  category: 'rpa',
  info: { icon: '🪟', description: 'RPA macOS 窗口' },
  meta: { ...SF_META, size: { width: 400, height: 240 } },
  onAdd: () => ({ data: { action: 'frontmost', appName: '', windowTitle: '' } }),
  formMeta: { render: () => <RpaMacWinForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      action: String(d.action ?? 'frontmost'),
      appName: String(d.appName ?? ''),
      windowTitle: String(d.windowTitle ?? ''),
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      action: String(o.action ?? 'frontmost'),
      appName: String(o.appName ?? ''),
      windowTitle: String(o.windowTitle ?? ''),
    };
  },
  getConnectionType: getSFConnectionType,
};

/* ---------- Desktop click ---------- */
function RpaDeskClickForm() {
  const { data, updateData } = useNodeRender();
  const d = (data ?? {}) as { x?: string; y?: string };
  const patch = useCallback((p: Record<string, unknown>) => updateData({ ...d, ...p }), [d, updateData]);
  return (
    <Wrap onPointerDown={(e) => e.stopPropagation()}>
      <Title>桌面坐标点击</Title>
      <Row>
        <Lb>x</Lb>
        <Input size="small" value={String(d.x ?? '100')} onChange={(v) => patch({ x: String(v) })} />
      </Row>
      <Row>
        <Lb>y</Lb>
        <Input size="small" value={String(d.y ?? '100')} onChange={(v) => patch({ y: String(v) })} />
      </Row>
    </Wrap>
  );
}

export const RpaDesktopClickRegistry: RuleGoNodeRegistry = {
  type: RpaNodeType.RpaDesktopClick,
  backendNodeType: 'x/rpaDesktopClick',
  category: 'rpa',
  info: { icon: '👆', description: 'RPA 桌面点击' },
  meta: { ...SF_META, size: { width: 360, height: 180 } },
  onAdd: () => ({ data: { x: '100', y: '100' } }),
  formMeta: { render: () => <RpaDeskClickForm /> },
  serializeConfiguration: (data) => {
    const d = data as Record<string, unknown>;
    return {
      x: String(d.x ?? '0'),
      y: String(d.y ?? '0'),
    };
  },
  deserializeConfiguration: (c) => {
    const o = c as Record<string, unknown>;
    return {
      x: String(o.x ?? '100'),
      y: String(o.y ?? '100'),
    };
  },
  getConnectionType: getSFConnectionType,
};

export const t5RpaRegistries: RuleGoNodeRegistry[] = [
  RpaBrowserNavigateRegistry,
  RpaBrowserClickRegistry,
  RpaBrowserScreenshotRegistry,
  RpaBrowserQueryRegistry,
  RpaOcrRegistry,
  RpaScreenCaptureRegistry,
  RpaMacWindowRegistry,
  RpaDesktopClickRegistry,
];
