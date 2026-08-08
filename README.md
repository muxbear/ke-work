<div align="center">

# KE-WORK

**A desktop AI agent workbench built with Electron, Vue 3 and DeepAgents**

![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![DeepAgents](https://img.shields.io/badge/DeepAgents-1.11-7C3AED)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)

**English** | [简体中文](README.zh-CN.md)

</div>

KE-WORK is a cross-platform desktop application that puts a **DeepAgents-powered AI agent** in your hands. It runs fully on your machine with a local-first design — conversations, memory and agent state live in SQLite on disk — while an optional **cloud mode** (PostgreSQL) lets you switch the same interface to a remote backend. Chat with streaming output, organize work into **workspaces**, and configure models, agents, skills and system behavior from a rich settings center.

## ✨ Features

- **🧠 DeepAgents multi-agent engine** — built on [DeepAgents](https://github.com/langchain-ai/deepagents) / LangChain, powered by DeepSeek models, with streaming responses and real-time "thinking" events
- **🔄 Dual work modes** — **Local mode** (everything stored on your machine: conversations, memory, agent state in SQLite) or **Cloud mode** (PostgreSQL checkpointer/store + remote HTTP services); switching modes swaps only the underlying data source, the rest of the app stays identical
- **💬 Rich chat experience** — streaming tokens, reasoning previews, Markdown rendering, regenerate, cancel mid-generation, and automatic AI-generated conversation titles
- **🗂️ Workspaces** — per-user workspace directories bound to conversations; the main process resolves the workspace authoritatively so sessions can never be hijacked by forged IDs
- **🔐 Multi-channel authentication** — local password accounts (JWT + bcrypt), SMS code and WeChat login, slide captcha; session state is verified by the main process on every protected route
- **🧩 Agent customization** — configure model, system prompt, skills, memory files, sub-agents, tools, permissions and response format from the settings center
- **⚙️ System settings** — network proxy (applied via Chromium's proxy API), lock-screen keep-awake, workspace base directory, data management (disk usage), personalization, keyboard shortcuts, security and more
- **🛡️ Security first** — secrets encrypted with Electron `safeStorage`, JWT secret generated and stored securely, sandboxed preload bridge, `AbortController`-based task cancellation
- **📦 Auto-update** — packaged with `electron-builder` (NSIS / DMG / AppImage + deb + snap) and `electron-updater` for generic HTTP feeds

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 39 · electron-vite · electron-builder · electron-updater |
| Frontend | Vue 3 · Pinia · Vue Router · marked (Markdown rendering) |
| AI engine | DeepAgents 1.11 · LangChain · @langchain/deepseek · @langchain/openai |
| Local storage | better-sqlite3 · LangGraph SqliteSaver / SqliteStore · SQL migrations |
| Cloud storage | LangGraph PostgresSaver / PostgresStore · HTTP API client (axios) |
| Security | bcryptjs · jsonwebtoken · Electron safeStorage · custom crypto helpers |
| Testing | Vitest (unit + integration + security) · Playwright (e2e) |

## 📁 Project Structure

```
ke-work/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── agent/            # AgentBuilder, AgentManager, conversation store, title service
│   │   ├── database/         # Data source abstraction: local (SQLite) / cloud (PostgreSQL + API)
│   │   │   ├── interfaces/   # Repository contracts (IAuthRepository, IConfigRepository…)
│   │   │   ├── local/        # SQLite repositories + migration runner
│   │   │   └── cloud/        # Cloud repositories + HTTP data source
│   │   ├── ipc/              # IPC handlers: auth, conversation, mode, workspace, config
│   │   ├── mode/             # Work mode store (local / cloud)
│   │   ├── services/         # AuthService, SessionService
│   │   ├── settings/         # Settings store/service + disk usage
│   │   ├── workspace/        # Workspace repository & service
│   │   ├── security/         # Token, crypto, safeStorage-backed secret store
│   │   └── state/            # Last launch snapshot, workspace state
│   ├── preload/              # Context-bridged IPC API exposed as window.api
│   └── renderer/             # Vue 3 UI
│       └── src/
│           ├── views/        # Login, Home, Assistant, Expert, Automation, Project, NewTask
│           ├── components/   # Chat panel, file preview, settings windows, slide captcha…
│           ├── store/        # Pinia stores (user, agent, workspace, workMode, settings…)
│           └── router/       # Hash router with main-process session guard
├── tests/
│   ├── unit/                 # Agent builder/manager, conversation store, services
│   ├── integration/          # Database repositories, robustness
│   ├── security/             # Security regression tests
│   └── e2e/                  # Playwright end-to-end tests
├── build/                    # electron-builder resources
├── resources/                # App icons
├── electron-builder.yml      # Packaging & publishing config
└── electron.vite.config.ts   # electron-vite config
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **≥ 20.19** (required by Vite 7 / Electron 39)
- npm (bundled with Node.js)
- Windows / macOS / Linux

### 1. Install dependencies

```bash
npm install
```

> The `postinstall` script automatically ensures the `better-sqlite3` native binding matches your Electron runtime. If a VS toolchain is unavailable it falls back to a prebuilt binary — no extra setup needed.

### 2. Configure environment

Create a `.env` file in the project root (`.env` is gitignored; a template is below):

```env
# DeepSeek LLM
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=sk-your-api-key

# Cloud mode (optional — only needed if you use cloud work mode)
CLOUD_API_BASE_URL=https://your-cloud-api.example.com
CLOUD_POSTGRES_CONN_STRING=postgres://user:pass@host:5432/db

# Optional: LangSmith tracing
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-key
```

| Variable | Required | Description |
| --- | --- | --- |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_API_KEY` | ✅ | DeepSeek model endpoint and key used by the agent |
| `CLOUD_API_BASE_URL` | cloud mode only | Base URL of the remote service (auth, data API) |
| `CLOUD_POSTGRES_CONN_STRING` | cloud mode only | PostgreSQL connection string for checkpointer & long-term store |
| `LANGSMITH_TRACING` / `LANGSMITH_API_KEY` | optional | LangSmith observability |

### 3. Run in development

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build:win     # Windows (NSIS installer)
npm run build:mac     # macOS (DMG)
npm run build:linux   # Linux (AppImage, deb, snap)
```

Or produce an unpacked build for local testing: `npm run build:unpack`.

## 📜 Available Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the app in development mode with HMR |
| `npm run start` | Preview a production build |
| `npm run typecheck` | Type-check main + renderer (`tsc` + `vue-tsc`) |
| `npm run lint` | ESLint over the codebase |
| `npm run format` | Prettier format everything |
| `npm test` | Run unit / integration / security tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Build the app and run Playwright e2e tests |
| `npm run build` | Type-check then build with electron-vite |

## 🧪 Testing

KE-WORK ships a layered test suite:

- **Unit tests** (`tests/unit`) — agent builder & manager, conversation store, SQLite store, title service
- **Integration tests** (`tests/integration`) — local data source, auth/config repositories, robustness
- **Security tests** (`tests/security`) — regression coverage for token & credential handling
- **E2E tests** (`tests/e2e`) — Playwright against a built app: login, chat menus, skill multi-select, workspace binding, auto-title updates

```bash
npm test          # all non-e2e tests
npm run test:e2e  # end-to-end (builds the app first)
```

## 🏗️ Architecture

The app follows a strict three-layer split:

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer (Vue 3)  — views, Pinia stores, settings UI      │
├─────────────────────────────────────────────────────────────┤
│  Preload — contextBridge exposes a typed window.api (IPC)  │
├─────────────────────────────────────────────────────────────┤
│  Main process (Node.js)                                    │
│   ├─ Services: Auth, Session, Settings, Workspace          │
│   ├─ AgentManager: DeepAgents agent + checkpoint/store     │
│   └─ DataSourceFactory: local (SQLite) ↔ cloud (PostgreSQL)│
└─────────────────────────────────────────────────────────────┘
```

Key design points:

- **Repository pattern** — business services depend on `IAuthRepository` / `IConfigRepository` interfaces; `DataSourceFactory` swaps in a SQLite or cloud-backed implementation based on the current work mode, so the rest of the app is storage-agnostic.
- **Memory follows the mode** — short-term memory (LangGraph checkpointer) and long-term memory (store) are `SqliteSaver`/`SqliteStore` in local mode and `PostgresSaver`/`PostgresStore` in cloud mode.
- **Main process is authoritative** — session validity, workspace resolution and agent execution all happen in the main process; the renderer only passes IDs, never paths or permissions.
- **Local-first data** — app data lives in `~/.ke-work` (SQLite database, `secrets.bin`, settings, `work-mode.json`); workspace files default to `~/KeWork` and can be changed in system settings.

## 🤝 Contributing

1. Fork the repository and create a feature branch.
2. Follow the existing code style — the repo enforces ESLint + Prettier (semi-less) and TypeScript strict checks.
3. Make sure `npm run typecheck`, `npm run lint` and `npm test` pass.
4. For UI changes, add or update Playwright e2e coverage in `tests/e2e`.

## 📄 License

Private project — no license declared. Reach out to the maintainer for usage terms.
