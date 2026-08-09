# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

KE-WORK：Electron 39 + Vue 3 + DeepAgents 的桌面 AI 智能体工作台。本地优先（SQLite），可选云端模式（PostgreSQL + HTTP API）。仓库内代码注释、文档、提交信息以中文为主，新增代码请保持同样风格。

## 常用命令

```bash
npm run dev               # 开发模式（HMR）
npm run typecheck         # tsc（main/preload）+ vue-tsc（renderer）
npm run lint              # ESLint（vue 块强制 <script lang="ts">）
npm run format            # prettier --write .（semi-less，单引号，无尾逗号）
npm test                  # vitest run：tests/unit + tests/integration + tests/security
npm run test:coverage     # 覆盖率仅统计 src/main/{mode,database,security,services}
npm run test:e2e          # 先 npm run build 再跑 Playwright（vitest.e2e.config.ts，单用例 90s 超时）
npm run build             # typecheck + electron-vite build → out/
npm run build:unpack      # 未打包产物（本地验证用）
```

单测单文件：`npx vitest run tests/unit/agent/AgentBuilder.test.ts`（可加 `-t "用例名"` 过滤）。e2e 单文件：先 `npm run build`，再 `npx vitest run --config vitest.e2e.config.ts tests/e2e/login.e2e.ts`。

## 架构

严格三层：`src/renderer`（Vue 3 + Pinia）→ `src/preload`（contextBridge 暴露 `window.api`）→ `src/main`（Node）。**主进程是权威**：会话校验、工作空间解析、agent 执行都在主进程；渲染层只传 ID，不传路径/权限。

- **Repository 策略模式**：业务服务依赖 `src/main/database/interfaces/` 的 `IAuthRepository`/`IConfigRepository` 接口；`DataSourceFactory`（单例 + 观察者）按工作模式（`src/main/mode/work-mode.ts`）注入 SQLite 或云端实现。`setMode()` 发 `mode:changed` 事件，切换后 AgentManager 重建 backend。
- **Agent 管线**：`AgentManager`（生命周期单例，`init()` 返回 promise 供 `ready()` 复用）→ `AgentBuilder`（DeepAgent 组装，checkpointer/store 从 builder 取出）→ `invokeSendMessage`（`src/main/agent/service.ts`）。消息体在 LangGraph checkpoint 内（`thread_id = buildThreadId(userId, conversationId)`），checkpoint 与业务表**共用一个 ke-work.db**（SqliteSaver 自建表）；会话自定义标题等业务数据走 `ConversationStore` 的本地库。
- **流式 IPC**：`agent:send` 校验入参 → `AbortController` 按窗口 id 存入 map（`agent:cancel` 取消、登出时 `cancelAllAgents()`）→ 流式事件 `agent:stream-chunk` / `agent:stream-thinking` / `agent:stream-done` → 结束后异步 `summarizeTitle` 生成标题并推 `conversation:title-updated`。
- **工作空间**：`WorkspaceService` 主进程权威解析，会话已绑定 > 渲染层传入 > null；绑定写入业务表（checkpoint metadata 不可靠）。默认目录 `~/KeWork`，与应用数据目录 `~/.ke-work` 无关。
- **安全**：密码 bcrypt + JWT（secret 存 `secrets.bin`，safeStorage 加密）；受保护 IPC 路由先 `session.requireUserId()`；渲染层 localStorage token 仅是便利，主进程 session.json 才是真源。
- **迁移**：`src/main/database/local/migrations.ts` 内置 SQL 以 `--> statement-breakpoint` 分隔，seed 成 `~/.ke-work/.ke-work-sqlite-migrations/NNNN_name.sql`（磁盘文件即迁移源，可手工追加）。跑测试前如库结构变了，先看迁移是否需新增而非直接改建表 SQL。

## 测试约定

- `tests/unit` 镜像 `src/main` 目录；`tests/integration/database` 覆盖真实 SQLite 仓储；`tests/security` 是安全回归。单元测试不得访问网络/真实用户目录。
- e2e 用 Playwright `_electron` 驱动 `out/main/index.js`，通过 `KE_WORK_HOME` + `KE_WORK_USER_DATA` 环境变量隔离到临时目录，`setup-test-data.mjs` 预置 `e2euser / Secret123!` 账号。e2e 用例命名 `*.e2e.ts`，断言偏好 CSS class 选择器 + role。

## 已知坑

- **better-sqlite3 ABI**：`@langchain/langgraph-checkpoint-sqlite` 嵌套的 better-sqlite3 v12 非 N-API，必须匹配 Electron ABI（Electron 39 = 140）。`postinstall` 的 `scripts/ensure-better-sqlite3-electron.cjs` 会自动用 prebuild-install 下载修复；若报 `Could not locate the bindings file`，手动跑该脚本或从 GitHub release 下载对应预编译包。
- **prettier 模板折行**：prettier 3.x no-semi 会把 Vue 模板里多语句的 `@click` 内联 handler 折成无分号多行导致 vue 编译报错——多语句 handler 收敛成方法。
- **.env 必填**：`DEEPSEEK_BASE_URL` / `DEEPSEEK_API_KEY`（agent 必需）、可选 `CLOUD_API_BASE_URL` / `CLOUD_POSTGRES_CONN_STRING`（云端模式）、`LANGSMITH_TRACING` / `LANGSMITH_API_KEY`。`.env` 已 gitignore，勿提交真实密钥。
