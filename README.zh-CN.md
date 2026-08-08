<div align="center">

# KE-WORK

**基于 Electron、Vue 3 与 DeepAgents 的桌面端 AI 智能体工作台**

![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![DeepAgents](https://img.shields.io/badge/DeepAgents-1.11-7C3AED)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)

**[English](README.md)** | 简体中文

</div>

KE-WORK 是一款跨平台桌面应用，将 **DeepAgents 驱动的 AI 智能体**带到你的电脑上。它坚持本地优先的设计——对话、记忆与智能体状态全部保存在本机 SQLite 中；同时提供可选的**云端模式**（PostgreSQL），在界面不变的前提下将底层数据源切换到远端服务。流式对话、按**工作空间**组织任务，并通过丰富的设置中心配置模型、智能体、技能与系统行为。

## ✨ 功能特性

- **🧠 DeepAgents 多智能体引擎** —— 基于 [DeepAgents](https://github.com/langchain-ai/deepagents) / LangChain，接入 DeepSeek 模型，支持流式输出与实时"思考"事件
- **🔄 双工作模式** —— **本地模式**（对话、记忆、智能体状态全部存储在本地 SQLite）或**云端模式**（PostgreSQL checkpointer/store + 远端 HTTP 服务）；切换模式只替换底层数据源，应用其余部分完全一致
- **💬 丰富的对话体验** —— 流式 token、推理过程预览、Markdown 渲染、重新生成、中途取消，以及 AI 自动生成的会话标题
- **🗂️ 工作空间** —— 按登录用户隔离的工作目录并与会话绑定；工作空间由主进程权威解析，伪造 ID 无法劫持会话
- **🔐 多渠道登录** —— 本地密码账号（JWT + bcrypt）、短信验证码、微信登录，配套滑块验证码；受保护路由一律经主进程会话校验
- **🧩 智能体可配置** —— 在设置中心配置模型、系统提示词、技能、记忆文件、子智能体、工具、权限与输出格式
- **⚙️ 系统设置** —— 网络代理（经 Chromium 代理 API 生效）、锁屏保持唤醒、工作空间基目录、数据管理（磁盘占用）、个性化、快捷键、安全等
- **🛡️ 安全优先** —— 密钥经 Electron `safeStorage` 加密存储，JWT 密钥随机生成并安全落盘，preload 桥接沙箱化，任务取消基于 `AbortController`
- **📦 自动更新** —— 使用 `electron-builder`（NSIS / DMG / AppImage + deb + snap）打包，配合 `electron-updater` 支持通用 HTTP 源更新

## 🧱 技术栈

| 分层 | 技术 |
| --- | --- |
| 桌面壳 | Electron 39 · electron-vite · electron-builder · electron-updater |
| 前端 | Vue 3 · Pinia · Vue Router · marked（Markdown 渲染） |
| AI 引擎 | DeepAgents 1.11 · LangChain · @langchain/deepseek · @langchain/openai |
| 本地存储 | better-sqlite3 · LangGraph SqliteSaver / SqliteStore · SQL 迁移 |
| 云端存储 | LangGraph PostgresSaver / PostgresStore · HTTP API 客户端（axios） |
| 安全 | bcryptjs · jsonwebtoken · Electron safeStorage · 自研加密工具 |
| 测试 | Vitest（单元 + 集成 + 安全）· Playwright（e2e） |

## 📁 项目结构

```
ke-work/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── agent/            # AgentBuilder、AgentManager、会话存储、标题服务
│   │   ├── database/         # 数据源抽象：本地（SQLite）/ 云端（PostgreSQL + API）
│   │   │   ├── interfaces/   # 仓储契约（IAuthRepository、IConfigRepository…）
│   │   │   ├── local/        # SQLite 仓储 + 迁移执行器
│   │   │   └── cloud/        # 云端仓储 + HTTP 数据源
│   │   ├── ipc/              # IPC 处理器：auth、conversation、mode、workspace、config
│   │   ├── mode/             # 工作模式存储（local / cloud）
│   │   ├── services/         # AuthService、SessionService
│   │   ├── settings/         # 设置存储/服务 + 磁盘占用
│   │   ├── workspace/        # 工作空间仓储与服务
│   │   ├── security/         # Token、加解密、safeStorage 密钥存储
│   │   └── state/            # 上次启动快照、工作区状态
│   ├── preload/              # contextBridge 桥接，暴露类型化 window.api（IPC）
│   └── renderer/             # Vue 3 界面
│       └── src/
│           ├── views/        # Login、Home、Assistant、Expert、Automation、Project、NewTask
│           ├── components/   # 聊天面板、文件预览、设置窗口、滑块验证码…
│           ├── store/        # Pinia 状态（user、agent、workspace、workMode、settings…）
│           └── router/       # Hash 路由 + 主进程会话守卫
├── tests/
│   ├── unit/                 # 智能体构建/管理、会话存储、服务
│   ├── integration/          # 数据库仓储、健壮性
│   ├── security/             # 安全回归测试
│   └── e2e/                  # Playwright 端到端测试
├── build/                    # electron-builder 资源
├── resources/                # 应用图标
├── electron-builder.yml      # 打包与发布配置
└── electron.vite.config.ts   # electron-vite 配置
```

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) **≥ 20.19**（Vite 7 / Electron 39 要求）
- npm（随 Node.js 附带）
- Windows / macOS / Linux

### 1. 安装依赖

```bash
npm install
```

> `postinstall` 脚本会自动确保 `better-sqlite3` 原生绑定与当前 Electron 运行时匹配；若本机缺少 VS 工具链，会自动回退到预编译二进制，无需额外配置。

### 2. 配置环境变量

在项目根目录创建 `.env` 文件（`.env` 已被 gitignore，模板如下）：

```env
# DeepSeek 模型
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=sk-your-api-key

# 云端模式（可选——仅在云端工作模式下需要）
CLOUD_API_BASE_URL=https://your-cloud-api.example.com
CLOUD_POSTGRES_CONN_STRING=postgres://user:pass@host:5432/db

# 可选：LangSmith 追踪
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-key
```

| 变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_API_KEY` | ✅ | 智能体使用的 DeepSeek 模型地址与密钥 |
| `CLOUD_API_BASE_URL` | 仅云端模式 | 远端服务基础地址（登录、数据 API） |
| `CLOUD_POSTGRES_CONN_STRING` | 仅云端模式 | checkpointer 与长期记忆使用的 PostgreSQL 连接串 |
| `LANGSMITH_TRACING` / `LANGSMITH_API_KEY` | 可选 | LangSmith 可观测性 |

### 3. 开发模式运行

```bash
npm run dev
```

### 4. 生产构建

```bash
npm run build:win     # Windows（NSIS 安装包）
npm run build:mac     # macOS（DMG）
npm run build:linux   # Linux（AppImage、deb、snap）
```

如需本地验证可不打包：`npm run build:unpack` 生成免安装目录。

## 📜 可用脚本

| 脚本 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式启动（支持 HMR） |
| `npm run start` | 预览生产构建产物 |
| `npm run typecheck` | 主进程 + 渲染进程类型检查（`tsc` + `vue-tsc`） |
| `npm run lint` | ESLint 全量检查 |
| `npm run format` | Prettier 全量格式化 |
| `npm test` | 运行单元 / 集成 / 安全测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run test:e2e` | 先构建应用再运行 Playwright e2e 测试 |
| `npm run build` | 类型检查后 electron-vite 构建 |

## 🧪 测试

KE-WORK 提供分层测试体系：

- **单元测试**（`tests/unit`）—— 智能体构建器与管理器、会话存储、SQLite 存储、标题服务
- **集成测试**（`tests/integration`）—— 本地数据源、登录/配置仓储、健壮性
- **安全测试**（`tests/security`）—— token 与凭证处理的回归覆盖
- **E2E 测试**（`tests/e2e`）—— 针对构建产物的 Playwright 测试：登录、聊天菜单、技能多选、工作空间绑定、自动标题更新

```bash
npm test          # 全部非 e2e 测试
npm run test:e2e  # 端到端测试（会先构建应用）
```

## 🏗️ 架构设计

应用遵循严格的三层结构：

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer（Vue 3）—— 页面、Pinia 状态、设置界面             │
├─────────────────────────────────────────────────────────────┤
│  Preload —— contextBridge 暴露类型化 window.api（IPC）      │
├─────────────────────────────────────────────────────────────┤
│  Main process（Node.js）                                   │
│   ├─ Services: Auth、Session、Settings、Workspace           │
│   ├─ AgentManager: DeepAgents 智能体 + checkpoint/store     │
│   └─ DataSourceFactory: local（SQLite）↔ cloud（PostgreSQL）│
└─────────────────────────────────────────────────────────────┘
```

关键设计点：

- **仓储模式** —— 业务服务只依赖 `IAuthRepository` / `IConfigRepository` 等接口；`DataSourceFactory` 根据当前工作模式注入 SQLite 或云端实现，应用其余部分与存储无关。
- **记忆随模式切换** —— 短期记忆（LangGraph checkpointer）与长期记忆（store）在本地模式为 `SqliteSaver`/`SqliteStore`，云端模式为 `PostgresSaver`/`PostgresStore`。
- **主进程权威** —— 会话有效性、工作空间解析与智能体执行全部发生在主进程；渲染层只传 ID，不传路径或权限。
- **本地优先数据** —— 应用数据位于 `~/.ke-work`（SQLite 数据库、`secrets.bin`、设置、`work-mode.json`）；工作空间文件默认位于 `~/KeWork`，可在系统设置中修改。

## 🤝 参与贡献

1. Fork 仓库并新建功能分支。
2. 遵循既有代码风格——仓库启用 ESLint + Prettier（无分号）与 TypeScript 严格检查。
3. 确保 `npm run typecheck`、`npm run lint` 与 `npm test` 全部通过。
4. UI 改动请同步补充或更新 `tests/e2e` 下的 Playwright 用例。

## 📄 许可证

私有项目，未声明许可证。使用条款请联系维护者。
