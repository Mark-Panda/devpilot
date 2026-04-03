# Spec: 节点系统

## 概述

定义所有 33 个节点的转换规格，包括节点注册表、表单配置、DSL 序列化/反序列化。

## 节点注册表规格

### 通用 RuleGoNodeRegistry 接口

```typescript
export interface RuleGoNodeRegistry extends FlowNodeRegistry {
  // ===== Flowgram 标准字段 =====
  
  type: string;                      // 前端节点类型（如 'for-loop'）
  
  info: {
    icon: string;                    // 节点图标 SVG 路径
    description: string;             // 节点描述（工具提示用）
  };
  
  meta: {
    // 容器配置
    isContainer?: boolean;           // 是否是容器节点
    size?: {
      width: number;
      height: number;
    };
    padding?: (transform: FlowNodeTransformData) => {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    
    // 端口配置
    defaultPorts?: PortConfig[];
    
    // 样式
    wrapperStyle?: React.CSSProperties;
    
    // 选择逻辑
    selectable?: (node: FlowNodeEntity, mousePos?: PositionSchema) => boolean;
    
    // 其他元信息
    deleteDisable?: boolean;         // 不可删除
    copyDisable?: boolean;           // 不可复制
    nodePanelVisible?: boolean;      // 是否在节点面板显示
  };
  
  onAdd?: () => NodeCreateData;      // 添加节点时的初始化
  
  formMeta: FormMeta;                // 表单配置
  
  // ===== RuleGo 扩展字段 =====
  
  backendNodeType: string;           // 后端节点类型（如 'for'）
  category: RuleGoCategory;          // 分类标识
  
  // DSL 转换钩子
  serializeConfiguration?: (node: FlowNodeEntity) => Record<string, unknown>;
  deserializeConfiguration?: (config: Record<string, unknown>) => Record<string, unknown>;
  
  // 连接类型映射
  getConnectionType?: (port: PortEntity, node: FlowNodeEntity) => string;
  canConnectTo?: (fromNode: FlowNodeEntity, toNode: FlowNodeEntity, connType: string) => boolean;
  
  // Endpoint 特殊处理（触发器类）
  isEndpoint?: boolean;
  serializeEndpoint?: (node: FlowNodeEntity) => Record<string, unknown>;
  deserializeEndpoint?: (epData: Record<string, unknown>) => Record<string, unknown>;
}
```

---

## 节点转换清单

### 第一批：核心节点（7个）

#### 1. StartTrigger（手动触发）

**Blockly 定义**：
- blockType: `rulego_startTrigger`
- nodeType: `startTrigger`
- 无配置字段

**Flowgram 转换**：
```typescript
{
  type: 'start-trigger',
  backendNodeType: 'startTrigger',
  category: 'trigger',
  meta: {
    deleteDisable: true,      // 不可删除
    copyDisable: true,        // 不可复制
    nodePanelVisible: false,  // 不在面板显示（自动生成）
    defaultPorts: [
      { type: 'output', location: 'right' },
    ],
    size: { width: 360, height: 120 },
  },
  onAdd() {
    return {
      id: 'start',
      type: 'start-trigger',
      data: { title: '开始' },
    };
  },
}
```

#### 2. HttpTrigger（HTTP 触发器）

**Blockly 定义**：
- blockType: `rulego_endpoint_http`
- nodeType: `endpoint/http`（DSL `type` 字段；文档中曾写作 `endpoint:http`，与 `endpoint/http` 等价映射）
- 配置：path, method, routers

**Flowgram 转换**：
```typescript
{
  type: 'http-trigger',
  backendNodeType: 'endpoint/http',
  category: 'trigger',
  isEndpoint: true,  // 进 metadata.endpoints
  
  meta: {
    size: { width: 360, height: 180 },
    defaultPorts: [
      { type: 'output', location: 'right' },
    ],
  },
  
  formMeta: {
    render: ({ form }) => (
      <>
        <FormItem label="路径" required>
          <Field name="path">
            {({ field }) => (
              <input
                type="text"
                value={field.value || '/api/webhook'}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder="/api/webhook"
              />
            )}
          </Field>
        </FormItem>
        
        <FormItem label="方法">
          <Field name="method">
            {({ field }) => (
              <select value={field.value || 'POST'} onChange={...}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            )}
          </Field>
        </FormItem>
      </>
    ),
    validate: (data) => {
      const errors = {};
      if (!data.path?.trim()) {
        errors.path = '路径不能为空';
      }
      if (!data.path?.startsWith('/')) {
        errors.path = '路径必须以 / 开头';
      }
      return errors;
    },
  },
  
  serializeEndpoint: (node) => ({
    id: node.id,
    type: 'endpoint/http',
    name: node.data.name,
    configuration: { server: node.data.server },
    routers: node.data.routers,
  }),
}
```

#### 3. RestApiCall（HTTP 客户端）

**配置字段**：
- url, method, headers, body, timeout

**端口配置**：
- input (左)
- output (右) - Success
- failure (底) - Failure

#### 4. LLM（大模型）

**配置字段**：
- model, temperature, maxTokens, systemPrompt, userPrompt, skills

**端口配置**：
- input (左)
- output (右) - Success
- failure (底) - Failure

**特殊处理**：
- 支持模型链（多个模型兜底）
- 技能选择（从可用技能列表）

#### 5. ForLoop（循环）★

见 design.md 中的详细设计

**关键特性**：
- 容器节点（`isContainer: true`）
- 包含 BlockStart/BlockEnd 子节点
- Do 分支连接到容器内第一个节点
- 支持范围表达式、变量、数组

#### 6. JsFilter（脚本过滤器）

**配置字段**：
- script (JavaScript 表达式)

**端口配置**：
- input (左)
- output (右) - True
- failure (底) - False

#### 7. JsTransform（脚本转换器）

**配置字段**：
- script (JavaScript 代码)

**端口配置**：
- input (左)
- output (右) - Success
- failure (底) - Failure

---

### 第二批：流程控制节点（6个）

#### 8. Switch（多条件分支）

**Blockly 特性**：
- 使用 mutation 动态创建 case 分支
- 每个 case 有独立的 statementInput

**Flowgram 转换**：
```typescript
{
  type: 'switch',
  backendNodeType: 'switch',
  category: 'condition',
  
  meta: {
    // 动态端口配置
    getPortsConfig: (node) => {
      const cases = node.data.cases || [
        { expression: '', label: 'Case 0' },
        { expression: '', label: 'Case 1' },
      ];
      
      return [
        { type: 'input', location: 'left' },
        ...cases.map((c, i) => ({
          type: 'output',
          location: 'right',
          portID: `case_${i}`,
          label: c.label || `Case ${i}`,
        })),
        {
          type: 'output',
          location: 'bottom',
          portID: 'default',
          label: 'Default',
        },
      ];
    },
    
    size: { width: 360, height: 'auto' },
  },
  
  formMeta: {
    render: ({ form }) => (
      <>
        <FormItem label="分支条件">
          <Field name="cases">
            {({ field }) => (
              <CaseListEditor
                cases={field.value || []}
                onChange={field.onChange}
              />
            )}
          </Field>
        </FormItem>
      </>
    ),
  },
  
  serializeConfiguration: (node) => ({
    cases: (node.data.cases || []).map(c => ({
      expression: c.expression,
    })),
  }),
}
```

#### 9. Fork（并行网关）

**特性**：
- 同时触发多个分支
- 动态输出端口数量

**端口配置**：
```typescript
meta: {
  getPortsConfig: (node) => {
    const branchCount = node.data.branchCount || 2;
    return [
      { type: 'input', location: 'left' },
      ...Array.from({ length: branchCount }, (_, i) => ({
        type: 'output',
        location: 'right',
        portID: `branch_${i}`,
        label: `分支 ${i + 1}`,
      })),
    ];
  },
}
```

#### 10. Join（汇聚）

**特性**：
- 等待多个分支汇聚后继续
- 动态输入端口数量

**端口配置**：
```typescript
meta: {
  getPortsConfig: (node) => {
    const inputCount = node.data.expectedInputs || 2;
    return [
      ...Array.from({ length: inputCount }, (_, i) => ({
        type: 'input',
        location: 'left',
        portID: `input_${i}`,
      })),
      { type: 'output', location: 'right' },
    ];
  },
}
```

#### 11-13. Flow, Ref, Break

标准节点，无特殊处理。

---

### 第三批：扩展节点（20个）

#### 分类规格

**追踪类（6个）**：
- GitPrepare, CursorAcp, CursorAcpAgent, CursorAcpAgentStep
- SourcegraphQueryBuild, SourcegraphSearch

**消息通知类（2个）**：
- FeishuImMessage, VolcTlsSearchLogs

**数据库类（2个）**：
- DbClient, OpenSearchSearch

**文件类（4个）**：
- FileRead, FileWrite, FileDelete, FileList

**RPA 类（8个）**：
- RpaBrowserNavigate, RpaBrowserClick, RpaBrowserScreenshot, RpaBrowserQuery
- RpaOcr, RpaScreenCapture, RpaMacWindow, RpaDesktopClick

**其他（4个）**：
- Delay, ExecCommand, JsSwitch, GroupAction

---

## 节点模板

每个节点遵循统一的模板结构：

```
rulego-free/nodes/<node-name>/
├─ index.ts                # 主文件，导出 NodeRegistry
├─ form-meta.tsx           # 表单配置
├─ node-render.tsx         # 自定义渲染（可选）
├─ styles.tsx              # 样式定义（可选）
├─ utils.ts                # 工具函数（可选）
└─ icon.svg                # 节点图标
```

**index.ts 模板**：

```typescript
import { nanoid } from 'nanoid';
import type { RuleGoNodeRegistry } from '../../types';
import { formMeta } from './form-meta';
import icon from './icon.svg';

export const XxxNodeRegistry: RuleGoNodeRegistry = {
  type: 'xxx-node',
  backendNodeType: 'xxx',
  category: 'action',  // trigger/action/condition/data/flow
  
  info: {
    icon,
    description: '节点功能描述',
  },
  
  meta: {
    size: { width: 360, height: 150 },
    defaultPorts: [
      { type: 'input', location: 'left' },
      { type: 'output', location: 'right' },
      { type: 'output', location: 'bottom', portID: 'failure' },
    ],
  },
  
  onAdd() {
    return {
      id: `xxx_${nanoid(5)}`,
      type: 'xxx-node',
      data: {
        title: 'Xxx Node',
        // 默认配置
      },
    };
  },
  
  formMeta,
  
  serializeConfiguration(node) {
    return {
      // node.data → backend configuration
    };
  },
  
  deserializeConfiguration(config) {
    return {
      // backend configuration → node.data
    };
  },
  
  getConnectionType(port, node) {
    if (port.portID === 'failure') return 'Failure';
    return 'Success';
  },
};
```

**form-meta.tsx 模板**：

```typescript
import { FormMeta, FormRenderProps, Field } from '@flowgram.ai/free-layout-editor';
import { FormHeader, FormContent, FormItem, Feedback } from '../../form-components';
import { useNodeRenderContext } from '../../hooks';

export const XxxFormRender = ({ form }: FormRenderProps) => {
  const { readonly } = useNodeRenderContext();
  
  return (
    <>
      <FormHeader title="Xxx 配置" icon="🔧" />
      
      <FormContent>
        <FormItem label="字段 1" required>
          <Field name="field1">
            {({ field, fieldState }) => (
              <>
                <input
                  type="text"
                  value={field.value || ''}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={readonly}
                  className={fieldState.error ? 'error' : ''}
                />
                <Feedback error={fieldState.error} />
                <small className="form-hint">字段说明</small>
              </>
            )}
          </Field>
        </FormItem>
        
        {/* 更多字段 */}
      </FormContent>
    </>
  );
};

export const formMeta: FormMeta = {
  render: XxxFormRender,
  
  validate: (data) => {
    const errors: Record<string, string> = {};
    
    if (!data.field1?.trim()) {
      errors.field1 = '字段 1 不能为空';
    }
    
    return errors;
  },
  
  // 表单初始值
  defaultValues: {
    field1: '',
  },
};
```

---

## 特殊节点详细规格

### 容器节点：ForLoop

见 design.md 中的完整实现。

**关键要点**：
- `isContainer: true`
- `padding` 函数定义内边距
- `blocks` 数组包含 BlockStart/BlockEnd
- Do 分支的序列化/反序列化逻辑

---

### 多分支节点：Switch

**配置结构**：
```typescript
{
  data: {
    cases: Array<{
      expression: string;  // 条件表达式
      label?: string;      // 分支标签（可选）
    }>;
  }
}
```

**端口动态生成**：
```typescript
meta: {
  getPortsConfig: (node) => {
    const cases = node.data.cases || [];
    return [
      { type: 'input', location: 'left' },
      ...cases.map((c, i) => ({
        type: 'output',
        location: 'right',
        portID: `case_${i}`,
        label: c.label || `Case ${i}`,
      })),
      { type: 'output', location: 'bottom', portID: 'default' },
    ];
  },
}
```

**DSL 序列化**：
```typescript
serializeConfiguration(node) {
  return {
    cases: node.data.cases.map((c, i) => ({
      expression: c.expression,
      relation: `Case${i}`,
    })),
  };
}
```

---

### 并行节点：Fork

**配置结构**：
```typescript
{
  data: {
    branchCount: number;  // 分支数量（1-8）
  }
}
```

**端口动态生成**：
```typescript
meta: {
  getPortsConfig: (node) => {
    const n = Math.max(1, Math.min(8, node.data.branchCount || 2));
    return [
      { type: 'input', location: 'left' },
      ...Array.from({ length: n }, (_, i) => ({
        type: 'output',
        location: 'right',
        portID: `branch_${i}`,
      })),
    ];
  },
}
```

**DSL 序列化**：
所有 Success 类型的连线都作为 Fork 的并行分支

---

### 汇聚节点：Join

**配置结构**：
```typescript
{
  data: {
    expectedInputs: number;  // 期待的输入数量
    extraIncomings: string[]; // 额外的输入节点 ID
  }
}
```

**特殊处理**：
- 第一个输入通过普通连线连接
- 额外输入保存在 `extraIncomings` 字段
- DSL 中表现为多条 `toId` 相同的 connection

---

### 节点组：GroupAction

**配置结构**：
```typescript
{
  data: {
    nodeIds: string[];  // 并行执行的节点 ID 列表
  }
}
```

**端口动态生成**：
```typescript
meta: {
  getPortsConfig: (node) => {
    const nodeIds = node.data.nodeIds || [];
    return [
      { type: 'input', location: 'left' },
      ...nodeIds.map((id, i) => ({
        type: 'output',
        location: 'right',
        portID: `branch_${i}`,
        label: id,
      })),
      { type: 'output', location: 'bottom', portID: 'next' },
    ];
  },
}
```

**可能需要容器式设计**：
考虑将 GroupAction 也设为容器节点（`isContainer: true`），让用户在容器内拖入节点，自动收集为 nodeIds。

---

## 节点类型映射表

```typescript
// dsl/nodeTypeMapping.ts

export const NODE_TYPE_MAPPING: Record<string, string> = {
  // 前端类型 → 后端类型
  'start-trigger': 'startTrigger',
  'http-trigger': 'endpoint/http',
  'ws-trigger': 'endpoint:ws',
  'mqtt-trigger': 'endpoint:mqtt',
  'schedule-trigger': 'endpoint:schedule',
  'net-trigger': 'endpoint:net',
  
  'rest-api-call': 'restApiCall',
  'llm': 'ai/llm',
  'feishu-message': 'feishu/imMessage',
  'volc-tls-search': 'volcTls/searchLogs',
  'opensearch-search': 'opensearch/search',
  'delay': 'delay',
  'exec-command': 'exec',
  
  'js-transform': 'jsTransform',
  'js-filter': 'jsFilter',
  'js-switch': 'jsSwitch',
  
  'for-loop': 'for',
  'join': 'join',
  'group-action': 'groupAction',
  
  'switch': 'switch',
  
  'flow': 'flow',
  'ref': 'ref',
  'fork': 'fork',
  'break': 'break',
  
  'db-client': 'dbClient',
  
  'file-read': 'x/fileRead',
  'file-write': 'x/fileWrite',
  'file-delete': 'x/fileDelete',
  'file-list': 'x/fileList',
  
  'git-prepare': 'apiRouteTracer/gitPrepare',
  'cursor-acp': 'cursor/acp',
  'cursor-acp-agent': 'cursor/acp_agent',
  'cursor-acp-agent-step': 'cursor/acp_agent_step',
  'sourcegraph-query-build': 'sourcegraph/queryBuild',
  'sourcegraph-search': 'sourcegraph/search',
  
  'rpa-browser-navigate': 'x/rpaBrowserNavigate',
  'rpa-browser-click': 'x/rpaBrowserClick',
  'rpa-browser-screenshot': 'x/rpaBrowserScreenshot',
  'rpa-browser-query': 'x/rpaBrowserQuery',
  'rpa-ocr': 'x/rpaOcr',
  'rpa-screen-capture': 'x/rpaScreenCapture',
  'rpa-mac-window': 'x/rpaMacWindow',
  'rpa-desktop-click': 'x/rpaDesktopClick',
  
  // 特殊节点
  'block-start': 'internal:block-start',
  'block-end': 'internal:block-end',
};

export const BACKEND_TO_FRONTEND_MAPPING = Object.fromEntries(
  Object.entries(NODE_TYPE_MAPPING).map(([k, v]) => [v, k])
);
```

---

## 验收标准

### 功能完整性

- [ ] 所有 33 个节点类型都有对应的 FlowNodeRegistry
- [ ] 每个节点都能正确序列化/反序列化配置
- [ ] 容器节点（For/GroupAction）能正确处理子节点
- [ ] 多分支节点（Switch/Fork）能动态创建端口
- [ ] 所有节点的表单验证正常工作

### DSL 兼容性

- [ ] 每个节点生成的 DSL 与 Blockly 版本完全一致
- [ ] 能加载 Blockly 版本保存的所有规则链
- [ ] Round-trip 测试通过（加载 → 导出 → 对比）

### 视觉效果

- [ ] 所有节点使用 Flowgram 白色卡片样式
- [ ] Loop 容器节点样式与 Flowgram demo 一致
- [ ] 节点分类颜色与原 Blockly 主题对应
- [ ] 选中/悬停/错误态样式正确

### 性能

- [ ] 100 节点规则链加载 < 2s
- [ ] 节点拖动流畅无延迟
- [ ] 内存占用合理（< 50MB for 100 nodes）

### 测试覆盖

- [ ] 所有节点的单元测试
- [ ] DSL 转换的集成测试
- [ ] 至少 20 个生产规则的回归测试
