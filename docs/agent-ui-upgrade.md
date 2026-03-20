# AI Agent 对话界面 - UI/UX 升级文档

## 📋 概览

全新设计的 AI Agent 对话界面,参考 Claude 的现代设计风格,提供流畅的用户体验。

## ✨ 主要特性

### 1. 欢迎界面 (Welcome Screen)

- **渐变背景**: 从 slate-50 到 purple-50 的优雅渐变
- **Hero Section**: 
  - 大型 emoji 图标 (🤖)
  - 渐变文字标题
  - 清晰的功能说明
- **模型选择器**:
  - 从"模型管理"中加载已配置的模型
  - 可视化选择卡片
  - 选中状态带勾选标记
- **功能展示**: 3 个特性卡片展示核心能力

### 2. 对话界面 (Chat Interface)

#### Header
- **Agent 信息**: 显示名称和当前使用的模型
- **状态徽章**: 实时显示在线状态(带动画脉冲)
- **切换按钮**: 快速返回模型选择

#### 消息区域
- **空状态**: 
  - 精美的欢迎消息
  - 4 个建议问题卡片
  - Hover 动画效果
- **消息气泡**:
  - 用户消息: 蓝色渐变,右对齐
  - AI 回复: 白色背景,左对齐
  - 圆角头像(用户 👤 / AI 🤖)
  - 时间戳显示
- **加载状态**: 3 个跳动的圆点动画

#### 输入框
- **自动调整高度**: textarea 根据内容自动扩展(最高 200px)
- **字符计数**: 实时显示字符数
- **发送按钮**: 
  - 渐变背景 + 阴影
  - Hover 放大效果
  - 加载时显示 spinner
- **快捷键提示**: 显示 Shift+Enter 换行提示

### 3. 模型集成

- **API 封装** (`modelApi.ts`):
  - 从 Wails 绑定加载模型配置
  - 展平多个配置源到统一的模型选项列表
  - 提供 `ModelOption` 类型包含完整配置信息

- **自动创建主 Agent**:
  - 如果没有 agent,自动创建一个"主助手"
  - 使用用户选择的模型
  - 预设系统提示词

## 🎨 设计规范

### 颜色系统

```
主色:
- Blue: from-blue-600 to-blue-700 (用户消息)
- Purple: from-purple-500 to-pink-500 (AI 头像)

背景:
- Gradient: from-slate-50 via-blue-50 to-purple-50

中性色:
- Slate 系列用于文本和边框
```

### 间距

- 容器 padding: 8 (32px)
- 卡片 padding: 6 (24px)
- 按钮 padding: 4 (16px)
- 消息间距: 6 (24px)

### 圆角

- 主要容器: rounded-2xl (16px)
- 按钮/输入框: rounded-2xl
- 头像: rounded-xl (12px)
- 徽章: rounded-full

### 阴影

- 卡片: shadow-xl
- 按钮: shadow-lg, hover: shadow-xl
- 消息: shadow-sm

## 🔄 用户流程

1. **首次访问**:
   - 显示欢迎界面
   - 加载已配置的模型列表
   - 用户选择模型
   - 点击"开始对话"

2. **自动创建**:
   - 系统自动创建默认主 Agent
   - 使用选中的模型配置
   - 切换到对话界面

3. **对话交互**:
   - 用户输入消息
   - AI 实时回复
   - 支持连续对话
   - 可切换模型重新开始

## 📂 文件结构

```
frontend/src/modules/agent/
├── pages/
│   └── AgentChatPage.tsx        # 主页面组件
├── components/
│   ├── ChatMessages.tsx         # 消息列表组件
│   └── ChatInput.tsx            # 输入框组件
├── api.ts                       # Agent API 封装
├── modelApi.ts                  # 模型管理 API 封装
├── store.ts                     # Zustand 状态管理
└── types.ts                     # TypeScript 类型定义
```

## 🚀 使用方法

### 用户操作

1. **配置模型** (首次):
   - 前往"模型管理"页面
   - 添加至少一个模型配置(Base URL、API Key、Models)

2. **开始对话**:
   - 访问"AI Agent 对话"页面
   - 选择一个模型
   - 点击"开始对话"
   - 输入消息并发送

3. **切换模型**:
   - 点击右上角"切换模型"按钮
   - 选择其他模型
   - 重新开始对话

### 开发者接入

```typescript
import { modelManagementApi } from './modelApi'

// 获取所有模型选项
const options = await modelManagementApi.getAllModelOptions()
// 返回: ModelOption[]

// 每个选项包含:
interface ModelOption {
  configId: string       // 配置 ID
  baseUrl: string        // API Base URL
  model: string          // 模型名称
  displayName: string    // 显示名称 (站点 - 模型)
}
```

## 🎯 未来优化方向

- [ ] 消息流式输出(打字机效果)
- [ ] 代码高亮和语法着色
- [ ] Markdown 渲染支持
- [ ] 对话历史持久化
- [ ] 多 Agent 切换标签页
- [ ] 语音输入支持
- [ ] 附件上传(图片、文件)
- [ ] 导出对话记录

## 📸 界面截图

### 欢迎界面
- 渐变背景 + Hero Section
- 模型选择卡片
- 功能特性展示

### 对话界面
- 精简的 Header
- 消息气泡布局
- 优雅的输入框

### 空状态
- 建议问题卡片
- 引导性文案

---

**设计参考**: Claude AI (Anthropic)
**实现时间**: 2026-03-19
**版本**: v1.0
