# Electron + Vite + Vue3 集成 DeepAgents 智能体对话详细设计说明书

> 版本：v2.0 | 更新日期：2026-07-28

---

## 目录

1. [依赖安装与环境配置](#1-依赖安装与环境配置)
2. [架构总览](#2-架构总览)
3. [各文件角色与代码详解](#3-各文件角色与代码详解)
4. [流式输出实现细节](#4-流式输出实现细节)
5. [Markdown 渲染实现](#5-markdown-渲染实现)
6. [踩坑记录与解决方案](#6-踩坑记录与解决方案)

---

## 1. 依赖安装与环境配置

### 1.1 核心依赖

| 依赖包 | 版本 | 用途 |
|--------|------|------|
| `deepagents` | ^1.11.1 | deepagents 智能体框架，封装 LangChain 的 Agent 创建与调用 |
| `langchain` | ^1.5.4 | LangChain 核心库，deepagents 的底层依赖 |
| `@langchain/core` | ^1.2.3 | LangChain 核心类型与工具 |
| `@langchain/openai` | 1.5.5 | OpenAI SDK 封装（langchain 的传递依赖，用于调用 DeepSeek API） |
| `@langchain/deepseek` | 传递依赖 | DeepSeek 模型适配器 |
| `marked` | 新增 | Markdown → HTML 解析器，用于渲染 AI 返回的 Markdown 内容 |
| `pinia` | ^4.0.2 | Vue3 状态管理，管理对话列表和消息 |

### 1.2 安装命令

```bash
npm install deepagents langchain @langchain/core
npm install marked
```

### 1.3 环境变量配置

在项目根目录 `.env` 文件中配置 DeepSeek API：

```env
# DeepSeek API 配置
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=sk-your-api-key-here
```

### 1.4 环境变量加载

**关键点：Electron 主进程不会自动加载 `.env` 文件。**

在 `src/main/index.ts` 的**第一行**添加：

```ts
import 'dotenv/config'
```

这使得 `process.env.DEEPSEEK_API_KEY` 和 `process.env.DEEPSEEK_BASE_URL` 在 deepagents 初始化时可用。

---

## 2. 架构总览

### 2.1 核心设计原则

`deepagents` 和 `langchain` 依赖 Node.js 原生模块，无法在 Electron 渲染进程（浏览器环境）中运行。因此智能体的创建与调用必须放在 **主进程（Main Process）**，渲染进程通过 **IPC 通信** 与主进程交互。

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────┐
│                     渲染进程 (Renderer)                    │
│                                                         │
│  ┌──────────┐      ┌──────────────┐                     │
│  │ Home.vue │─────▶│ Pinia Store  │                     │
│  │          │      │              │                     │
│  │ 输入消息  │      │ sendMessage()│                     │
│  │ 发送按钮  │      │              │                     │
│  │ 消息展示  │      │ - 创建消息    │                     │
│  │ Markdown │      │ - 调用 IPC   │                     │
│  │ 渲染     │      │ - 流式监听    │                     │
│  └──────────┘      └──────┬───────┘                     │
│                           │                             │
│              ┌────────────┼────────────┐                │
│              │ preload/index.ts        │                │
│              │ contextBridge API       │                │
│              │                         │                │
│              │ sendAgentMessage()      │                │
│              │ onAgentChunk()          │                │
│              │ onAgentDone()           │                │
│              └────────────┼────────────┘                │
└───────────────────────────┼─────────────────────────────┘
                            │ IPC 通信
┌───────────────────────────┼─────────────────────────────┐
│                      主进程 (Main Process)               │
│                           │                             │
│              ┌────────────┼────────────┐                │
│              │ main/index.ts           │                │
│              │                         │                │
│              │ ipcMain.handle          │                │
│              │   ('agent:send')        │                │
│              └────────────┬────────────┘                │
│                           │                             │
│              ┌────────────▼────────────┐                │
│              │ main/agent-service.ts  │                │
│              │                         │                │
│              │ createDeepAgent()       │                │
│              │ agent.streamEvents(     │                │
│              │   { version: 'v3' })    │                │
│              │                         │                │
│              │ webContents.send(       │                │
│              │   'agent:stream-chunk') │                │
│              │ webContents.send(       │                │
│              │   'agent:stream-done')  │                │
│              └────────────┬────────────┘                │
│                           │                             │
│              ┌────────────▼────────────┐                │
│              │     DeepSeek API        │                │
│              │  api.deepseek.com       │                │
│              └─────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

### 2.3 IPC 通道设计

| IPC 通道 | 方向 | 触发方式 | 载荷 |
|----------|------|----------|------|
| `agent:send` | Renderer → Main | `ipcRenderer.invoke` | `string`（用户消息） |
| `agent:stream-chunk` | Main → Renderer | `webContents.send` | `string`（增量文本） |
| `agent:stream-done` | Main → Renderer | `webContents.send` | 无（流结束信号） |

**IPC 返回值**：`{ success: boolean, error?: string }`（不含完整文本，文本通过流式通道传输）

**设计原因**：将流式推送（`stream-chunk`/`stream-done`）与请求-响应（`agent:send`）解耦，避免 `result.content` 覆盖流式累积的内容，保证打字机效果。

---

## 3. 各文件角色与代码详解

### 3.1 `src/main/agent-service.ts` — 智能体核心

**角色**：创建 deepagents 智能体实例，封装流式调用逻辑。

**关键设计**：
- **单例模式**：`getAgent()` 确保全局只有一个 agent 实例，避免重复初始化
- **v3 流式 API**：使用 `agent.streamEvents(state, { version: 'v3' })`（非 legacy `stream()`）
- **双层异步迭代**：外层 `for await (const chunk of run.messages)` 迭代消息块，内层 `for await (const text of chunk.text)` 迭代文本增量
- **IPC 推送**：每个文本增量通过 `win.webContents.send('agent:stream-chunk', text)` 实时推送
- **完成信号**：流结束后发送 `agent:stream-done` 事件

```ts
// src/main/agent-service.ts
import { createDeepAgent } from 'deepagents'
import type { BrowserWindow } from 'electron'

let agentInstance: Awaited<ReturnType<typeof createDeepAgent>> | null = null

function getAgent(): ReturnType<typeof createDeepAgent> {
  if (!agentInstance) {
    agentInstance = createDeepAgent({
      model: 'deepseek:deepseek-v4-pro',
      tools: [],
      systemPrompt: '你是一个专业的AI助手...'
    })
  }
  return agentInstance
}

export async function invokeAgentStream(
  userMessage: string,
  win: BrowserWindow
): Promise<void> {
  const agent = await getAgent()
  const run = await agent.streamEvents(
    { messages: [{ role: 'user', content: userMessage }] },
    { version: 'v3' }
  )

  for await (const chunk of run.messages) {
    for await (const text of chunk.text) {
      win.webContents.send('agent:stream-chunk', text)
    }
  }
  win.webContents.send('agent:stream-done')
}
```

### 3.2 `src/main/index.ts` — 主进程入口

**角色**：Electron 主进程入口，注册 IPC handler。

**关键设计**：
- `import 'dotenv/config'` 必须在第一行，确保所有后续模块能访问 `.env` 环境变量
- `ipcMain.handle('agent:send', ...)` 接收渲染进程的用户消息，调用 `invokeAgentStream`，并返回操作状态
- 返回 `{ success: true }` 不含文本内容（文本由流式通道传输）

```ts
import 'dotenv/config'  // ← 必须在第一行
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { invokeAgentStream } from './agent-service'

// ...

ipcMain.handle('agent:send', async (event, userMessage: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('No window found')
  try {
    await invokeAgentStream(userMessage, win)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Agent invocation failed' }
  }
})
```

### 3.3 `src/preload/index.ts` — 预加载桥接层

**角色**：通过 `contextBridge` 将主进程的 IPC 能力安全暴露给渲染进程。

**关键设计**：
- `sendAgentMessage(content)`：调用 `ipcRenderer.invoke('agent:send', content)` 发起对话
- `onAgentChunk(callback)`：监听主进程推送的 `agent:stream-chunk` 事件，返回取消监听函数
- `onAgentDone(callback)`：监听主进程推送的 `agent:stream-done` 事件，返回值同

```ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  sendAgentMessage(content: string): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('agent:send', content) as Promise<{ success: boolean; error?: string }>
  },
  onAgentChunk(callback: (chunk: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => {
      callback(chunk)
    }
    ipcRenderer.on('agent:stream-chunk', handler)
    return () => ipcRenderer.removeListener('agent:stream-chunk', handler)
  },
  onAgentDone(callback: () => void): () => void {
    ipcRenderer.on('agent:stream-done', callback)
    return () => ipcRenderer.removeListener('agent:stream-done', callback)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
}
```

### 3.4 `src/renderer/src/store/index.ts` — 状态管理

**角色**：Pinia Store，管理对话列表、消息、流式状态。

**关键设计**：
- `sendMessage()` 是核心方法，负责发送用户消息并等待 AI 回复
- 创建占位 assistant 消息（content 为空）后，注册两个 IPC 监听器
- `onAgentChunk` 回调逐片累积 `assistantMsg.content += chunk`，实时持久化到 `localStorage`
- `onAgentDone` 通过 `Promise` 包装，等待流式输出完成
- **不覆盖**：不再用 `result.content` 覆盖累积的 `assistantMsg.content`

```ts
async function sendMessage(content: string, type = 'text', extra?) {
  // 1. 创建用户消息
  conv.messages.push({ id: genId(), role: 'user', content, type, timestamp: Date.now() })
  
  // 2. 创建占位 AI 消息
  const assistantMsg: Message = { id: genId(), role: 'assistant', content: '', type: 'text', timestamp: Date.now() }
  conv.messages.push(assistantMsg)

  isStreaming.value = true

  // 3. 等待流完成的 Promise
  const streamDone = new Promise<void>((resolve) => {
    const unlistenDone = window.api.onAgentDone(() => { unlistenDone(); resolve() })
  })

  // 4. 监听文本增量
  const unlistenChunk = window.api.onAgentChunk((chunk: string) => {
    assistantMsg.content += chunk          // 逐片累积
    conv.updatedAt = Date.now()
    persist()                              // 实时持久化
  })

  try {
    const result = await window.api.sendAgentMessage(content)
    if (!result.success) {
      assistantMsg.content = result.error || '抱歉，请求出错了，请重试。'
      return
    }
    await streamDone                       // 等待流式输出完毕
  } catch {
    if (!assistantMsg.content) {
      assistantMsg.content = '抱歉，请求出错了，请重试。'
    }
  } finally {
    unlistenChunk()
    isStreaming.value = false
    assistantMsg.timestamp = Date.now()
    conv.updatedAt = Date.now()
    persist()
  }
}
```

### 3.5 `src/renderer/src/env.d.ts` — 类型声明

**角色**：为 `window.api` 提供 TypeScript 类型支持。

```ts
interface Window {
  api: {
    sendAgentMessage: (content: string) => Promise<{ success: boolean; error?: string }>
    onAgentChunk: (callback: (chunk: string) => void) => () => void
    onAgentDone: (callback: () => void) => () => void
  }
}
```

### 3.6 `src/renderer/src/views/Home.vue` — 聊天 UI

**角色**：聊天界面，包含消息展示、输入框、侧边栏。

**关键设计**：
- `renderMarkdown(text)` 调用 `marked.parse()` 将 Markdown 转为 HTML
- 模板使用 `v-html="renderMarkdown(msg.content)"` 渲染 HTML
- `markdown-body` CSS class 提供 GitHub 风格的 Markdown 样式
- 流式光标 `streaming-cursor` 在 AI 回复进行中显示闪烁的 `▌`

```vue
<script setup lang="ts">
import { marked } from 'marked'

function renderMarkdown(text: string): string {
  if (!text) return ''
  return marked.parse(text) as string
}
</script>

<template>
  <div v-if="msg.type === 'text'" class="msg-text markdown-body"
       v-html="renderMarkdown(msg.content)"></div>
  <span v-if="store.isStreaming && msg.content && ..." class="streaming-cursor">▌</span>
</template>
```

### 3.7 文件修改汇总

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 新增依赖 | `marked` |
| `.env` | 已有 | DeepSeek API Key 和 Base URL |
| `src/main/agent-service.ts` | **新建** | 智能体创建 + v3 流式调用 + IPC 推送 |
| `src/main/index.ts` | 修改 | `import 'dotenv/config'` + `ipcMain.handle('agent:send')` |
| `src/preload/index.ts` | 修改 | 暴露 `sendAgentMessage` / `onAgentChunk` / `onAgentDone` |
| `src/renderer/src/store/index.ts` | 修改 | `sendMessage` 替换模拟函数为 IPC 调用 + 流式监听 |
| `src/renderer/src/env.d.ts` | 修改 | `Window.api` 类型声明 |
| `src/renderer/src/views/Home.vue` | 修改 | 删除 `parseContent`，新增 `renderMarkdown` + `marked` + `markdown-body` CSS |
| `src/renderer/src/agent/agent.ts` | **删除** | 逻辑已迁移到主进程 |

---

## 4. 流式输出实现细节

### 4.1 流式输出完整流程

```
用户输入 "Hello"
    │
    ▼
Home.vue: handleSend()  → store.sendMessage("Hello")
    │
    ▼
Store: 创建用户消息 + 占位 AI 消息
       注册 onAgentChunk 监听器
       注册 onAgentDone 监听器
       调用 window.api.sendAgentMessage("Hello")
    │
    ▼
Preload: ipcRenderer.invoke('agent:send', "Hello")
    │
    ▼
Main: ipcMain.handle('agent:send')
       调用 invokeAgentStream("Hello", win)
    │
    ▼
agent-service.ts:
  agent.streamEvents(
    { messages: [{ role: 'user', content: "Hello" }] },
    { version: 'v3' }                          ← v3 流式 API
  )
    │
    ▼
  for await (const chunk of run.messages) {    ← 外层迭代消息块
    for await (const text of chunk.text) {     ← 内层迭代文本增量
      win.webContents.send(                    ← 推送到渲染进程
        'agent:stream-chunk', text
      )
    }
  }
  win.webContents.send('agent:stream-done')    ← 流结束信号
    │
    ▼
Renderer 事件循环处理:
  ipcRenderer.on('agent:stream-chunk')
    → assistantMsg.content += chunk            ← 逐片累积
    → persist()                                ← 实时持久化
    → Vue 响应式更新 → UI 逐字刷新
    
  ipcRenderer.on('agent:stream-done')
    → resolve(streamDone Promise)
    → isStreaming = false
    → 关闭流式光标
```

### 4.2 关键 API：`streamEvents({ version: 'v3' })`

**为什么不用 `agent.stream()`？**

`agent.stream()` 返回的是 LangGraph 原始内部事件（格式为 `{ agent: { messages: [...] } }`），提取增量文本非常困难。

**为什么用 `agent.streamEvents()` + `version: 'v3'`？**

这是 deepagents 官方推荐的 v3 流式 API，返回 `AgentRunStream` 对象：

- `run.messages` → `AsyncIterable<ChatModelStreamHandle>`（消息级流）
- `chunk.text` → `AsyncIterable<string>`（文本增量级流，真正逐字的来源）
- `run.toolCalls` → 工具调用流（可选）
- `run.subagents` → 子智能体流（可选）

**双层迭代**是必须的：外层迭代处理每条消息（包括可能的多轮工具调用），内层迭代获取逐字的文本增量。

### 4.3 IPC 时序保证

**核心问题**：`webContents.send` 和 `ipcMain.handle` 使用不同的 IPC 机制，顺序不保证。

**解决方案**：
- `ipcMain.handle` **不返回**完整文本（只返回 `{ success: true }`）
- 所有文本通过 `webContents.send('agent:stream-chunk')` 推送
- 用 `agent:stream-done` 信号标记流结束
- Store 中通过 `Promise` + `onAgentDone` 等待所有 chunk 到达后才清理监听器

**时序保证**：主进程中 `for await` 循环同步执行完所有 `webContents.send` 调用后才返回 IPC 响应。渲染进程中 `await` 让渡控制权给事件循环，允许 `agent:stream-chunk` 事件被处理。

---

## 5. Markdown 渲染实现

### 5.1 技术选型

使用 `marked` 库（轻量、零配置）将 AI 返回的 Markdown 文本转为 HTML，通过 Vue 的 `v-html` 指令渲染。

### 5.2 实现代码

**Home.vue script**：

```ts
import { marked } from 'marked'

function renderMarkdown(text: string): string {
  if (!text) return ''
  return marked.parse(text) as string
}
```

**Home.vue template**：

```html
<div v-if="msg.type === 'text'" class="msg-text markdown-body"
     v-html="renderMarkdown(msg.content)"></div>
```

### 5.3 CSS 样式

通过 `.markdown-body` 类作用域下的子选择器，提供完整的 Markdown 视觉样式：

| 元素 | 样式要点 |
|------|----------|
| h1~h6 | 层级字号递减（1.5em → 0.85em），16px/8px 上下边距 |
| p | 1.65 行高，10px 底部边距 |
| ul/ol | 24px 左缩进，4px 列表项间距 |
| a | `#4f7cf7` 蓝色链接，hover 下划线 |
| blockquote | 3px 左边框 + 灰色背景 + 圆角 |
| code（行内） | 灰色背景 + 4px 圆角 + 等宽字体 |
| pre > code | 灰色背景 + 8px 圆角 + 横向滚动 |
| hr | 1px 灰色分割线 |
| table | 完整边框 + 表头背景色 |
| img | `max-width: 100%` + 8px 圆角 |

---

## 6. 踩坑记录与解决方案

### 6.1 `.env` 未加载 → API Key 报错

**现象**：`Deepseek API key not found`

**原因**：Electron 主进程不会自动加载 `.env` 文件

**解决**：在 `src/main/index.ts` 第一行添加 `import 'dotenv/config'`

### 6.2 `agent.stream()` 返回空内容

**现象**：AI 回复为空（只有时间戳）

**原因**：`agent.stream()` 无 `version: 'v3'` 时返回 LangGraph 原始内部事件，格式不匹配

**解决**：改用 `agent.streamEvents(state, { version: 'v3' })`，通过 `run.messages` 获取消息流

### 6.3 流式不是打字机效果

**现象**：消息一次性完整出现，没有逐字效果；或流式内容被覆盖

**原因**：Store 中 `result.content` 覆盖了累积的流式内容

**解决**：
1. `agent-service.ts` 不返回文本，发送 `agent:stream-done` 信号
2. Store 中用 `Promise` + `onAgentDone` 等待流完成，不覆盖 `assistantMsg.content`

### 6.4 消息重复渲染

**现象**：每条消息在界面展示两次

**原因**：模板中多余的 `<div v-if="msg.content && ..." v-html="...">` 对所有带内容的文本消息又渲染了一次

**解决**：添加条件 `v-if="msg.type !== 'text' && msg.content && ..."`

### 6.5 ChatModelStream 用 `.text` 而非 `.content`

**现象**：TypeScript 报错 `Property 'content' does not exist on type 'ChatModelStreamHandle'`

**原因**：v3 流式 API 的 `ChatModelStreamHandle` 使用 `.text`（`AsyncIterable<string>`）获取文本增量，而非 `.content`

**解决**：使用 `for await (const text of chunk.text)` 获取逐字增量

---

## 附录：完整文件清单

```
项目根目录/
├── .env                          # DeepSeek API Key + Base URL
├── package.json                  # 依赖：deepagents, langchain, marked, pinia
│
├── src/
│   ├── main/
│   │   ├── index.ts              # 主进程入口：dotenv 加载 + IPC handler
│   │   └── agent-service.ts      # 智能体核心：创建 + v3 流式调用
│   │
│   ├── preload/
│   │   └── index.ts              # 预加载桥接：contextBridge API
│   │
│   └── renderer/src/
│       ├── env.d.ts              # TypeScript 类型声明
│       ├── store/
│       │   └── index.ts          # Pinia Store：对话管理 + 流式监听
│       └── views/
│           └── Home.vue          # 聊天 UI：Markdown 渲染 + 消息展示
```

---

> **最后更新**：2026-07-28
> **状态**：TypeScript 编译通过，ESLint 零错误零警告，可正常运行 `npm run dev` 测试