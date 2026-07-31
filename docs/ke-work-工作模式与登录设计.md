# KE-WORK 工作模式与登录系统 — 设计文档

**日期**: 2026-07-31
**状态**: 草案

---

## 1. 需求概述

### 1.1 核心需求

1. **双工作模式**：系统支持"本地工作"和"云端工作"两种模式
   - 本地模式：用户数据、对话数据、日志等保存在电脑本地，使用 SQLite
   - 云端模式：数据保存在云端数据库（PostgreSQL），通过 HTTP API 调用远端服务
2. **模式切换**：用户可在两种模式间切换，切换后调用接口保持一致，仅底层实现不同
3. **登录安全**：敏感数据加密传输，数据库安全存储，符合业界安全规范
4. **DeepAgents 集成**：智能体短期记忆（Checkpointer）和长期记忆（Store）随工作模式切换不同后端

### 1.2 约束条件

- 云端后端服务（Python/Java）不在本项目范围内，客户端仅负责调用 HTTP API
- 本地模式使用 SQLite，云端模式使用 PostgreSQL
- 项目基于 Electron + Vue 3 + TypeScript + DeepAgents 框架

---

## 2. 整体架构

### 2.1 分层架构图

```
┌──────────────────────────────────────────────────────────┐
│                   Renderer (Vue 3)                        │
│  Login.vue  │  Home.vue  │  Settings.vue                  │
│  useUserStore  │  useAgentStore  │  useWorkModeStore      │
├──────────────────────────────────────────────────────────┤
│                    Preload (IPC Bridge)                    │
│  auth:*  │  data:*  │  agent:*  │  config:*               │
├──────────────────────────────────────────────────────────┤
│                  Main Process (Node.js)                    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐     │
│  │           Service Layer (Business Logic)         │     │
│  │  AuthService  │  ConversationService             │     │
│  │  ConfigService │  LogService                     │     │
│  └────────────┬────────────────────────────────────┘     │
│               │                                            │
│  ┌────────────┴────────────────────────────────────┐     │
│  │      Repository Interfaces (Abstract)            │     │
│  │  IAuthRepository  │  IConversationRepository      │     │
│  │  IConfigRepository│  ILogRepository               │     │
│  └──────┬──────────────────────┬────────────────────┘     │
│         │                      │                           │
│  ┌──────┴──────────┐  ┌───────┴──────────────┐           │
│  │ LocalDataSource  │  │  CloudDataSource     │           │
│  │   (SQLite)       │  │   (HTTP API)         │           │
│  │                  │  │                      │           │
│  │ SqliteSaver      │  │  PostgresSaver       │           │
│  │ InMemoryStore    │  │  PostgresStore       │           │
│  └──────────────────┘  └──────────────────────┘           │
└──────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 层次 | 本地模式 | 云端模式 |
|------|---------|---------|
| 数据库 | SQLite (better-sqlite3) | PostgreSQL（远端，客户端不直接连接） |
| 通信方式 | 进程内直接调用 | HTTP/HTTPS API |
| Checkpointer | `SqliteSaver` (`@langchain/langgraph-checkpoint-sqlite`) | `PostgresSaver` (`@langchain/langgraph-checkpoint-postgres`) |
| Store | `InMemoryStore` + `FileSaver` 持久化备份 | `PostgresStore` (`@langchain/langgraph-checkpoint-postgres`) |
| 配置存储 | SQLite | 远端服务 |

---

## 3. 核心设计模式

### 3.1 模式总览

| 模式 | 应用场景 | 说明 |
|------|---------|------|
| **Repository** | 数据访问抽象 | 为每种实体定义统一接口，业务层只依赖接口 |
| **Strategy** | 本地/云端切换 | `LocalDataSource` 和 `CloudDataSource` 可互换 |
| **Factory** | 创建数据源 | `DataSourceFactory.create(mode)` 返回对应实例 |
| **Singleton** | 连接管理 | SQLite 连接、DataDirectory 全局唯一 |
| **Observer** | 模式切换通知 | EventEmitter 通知各组件热切换 DataSource |

### 3.2 Repository 模式

```
interface IAuthRepository {
  loginByPassword(account: string, password: string): Promise<AuthResult>
  loginBySms(mobile: string, code: string): Promise<AuthResult>
  loginByWechat(code: string): Promise<AuthResult>
  sendSmsCode(mobile: string): Promise<void>
  refreshToken(refreshToken: string): Promise<TokenPair>
  logout(): Promise<void>
}

interface IConversationRepository {
  create(conv: CreateConversationDTO): Promise<Conversation>
  findById(id: string): Promise<Conversation | null>
  findAll(): Promise<Conversation[]>
  update(id: string, data: UpdateConversationDTO): Promise<Conversation>
  delete(id: string): Promise<void>
  addMessage(convId: string, msg: Message): Promise<Message>
}

interface IConfigRepository {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  getAll(): Promise<Record<string, string>>
}
```

### 3.3 Strategy 模式 — 数据源切换

```typescript
// 工厂方法
class DataSourceFactory {
  private static instance: DataSourceFactory
  private currentMode: WorkMode = 'local'
  private eventEmitter = new EventEmitter()

  static getInstance(): DataSourceFactory { /* singleton */ }

  setMode(mode: WorkMode): void {
    this.currentMode = mode
    this.eventEmitter.emit('mode:changed', mode)  // Observer 通知
  }

  createAuthRepository(): IAuthRepository {
    return this.currentMode === 'local'
      ? new LocalAuthRepository()
      : new CloudAuthRepository()
  }

  // ...其他 Repository 工厂方法
}
```

### 3.4 Observer 模式

```typescript
// 模式切换时，各 Service 订阅通知，热切换底层 Repository
class AuthService {
  private repository: IAuthRepository

  constructor(factory: DataSourceFactory) {
    this.repository = factory.createAuthRepository()
    factory.on('mode:changed', (mode) => {
      this.repository = factory.createAuthRepository()  // 热切换
    })
  }
}
```

---

## 4. 数据模型与数据库表设计

### 4.1 ER 图

```
┌──────────────┐       ┌──────────────────┐
│    users     │ 1───N │   conversations   │
├──────────────┤       ├──────────────────┤
│ id (PK)      │       │ id (PK)          │
│ username     │       │ user_id (FK)     │
│ password_hash│       │ title            │
│ mobile       │       │ work_mode        │
│ wechat_openid│       │ created_at       │
│ avatar       │       │ updated_at       │
│ work_mode    │       └───────┬──────────┘
│ created_at   │               │
│ updated_at   │       ┌───────┴──────────┐
└──────────────┘       │    messages       │
                       ├──────────────────┤
                       │ id (PK)          │
                       │ conversation_id  │
                       │ role             │
                       │ content          │
                       │ reasoning        │
                       │ created_at       │
                       └──────────────────┘

┌──────────────┐       ┌──────────────────┐
│    config     │       │   audit_logs     │
├──────────────┤       ├──────────────────┤
│ key (PK)     │       │ id (PK)          │
│ value        │       │ user_id          │
│ updated_at   │       │ action           │
└──────────────┘       │ detail           │
                       │ ip_address       │
                       │ created_at       │
                       └──────────────────┘
```

### 4.2 表结构详细设计

#### 本地模式 (SQLite)

```sql
-- 用户表
CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- UUID
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,             -- bcrypt/argon2 hash
  password_salt TEXT,                      -- 盐值（若 hash 不自带）
  mobile        TEXT UNIQUE,
  wechat_openid TEXT UNIQUE,
  avatar        TEXT,
  work_mode     TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'cloud'
  token_hash    TEXT,                      -- 当前有效 token 的 SHA-256 hash
  token_expire  INTEGER,                  -- token 过期时间 (unix timestamp)
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,  -- 连续失败次数（防暴力破解）
  locked_until  INTEGER,                  -- 账户锁定截止时间 (unix timestamp ms)
  created_at    INTEGER NOT NULL,         -- unix timestamp ms
  updated_at    INTEGER NOT NULL
);

-- 会话表（多轮对话）
CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,            -- UUID
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '新对话',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_conv_user ON conversations(user_id, updated_at DESC);

-- 消息表
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,        -- UUID
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('user','assistant','tool','system')),
  content         TEXT NOT NULL DEFAULT '',
  reasoning       TEXT,                    -- DeepSeek 深度思考内容
  metadata        TEXT,                    -- JSON, 工具调用等元数据
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);

-- 配置表
CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 审计日志表
CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  action     TEXT NOT NULL,               -- 'login', 'logout', 'create_conv', etc.
  detail     TEXT,                        -- JSON 详情
  ip_address TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_log_user ON audit_logs(user_id, created_at DESC);
```

#### 云端模式 (PostgreSQL — 远端服务维护)

云端表结构与本地一致，但由远端 Python/Java 服务维护。客户端仅调用 HTTP API：

```sql
-- 云端额外字段（由服务端管理）
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_login_ip INET;
ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;
```

### 4.3 JWT Token 设计

```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: {
  "sub": "<user_id>",
  "mode": "local|cloud",
  "iat": 1719763200,
  "exp": 1719849600,
  "jti": "<unique-token-id>",
  "type": "access|refresh"
}

Access Token:  有效期 2 小时
Refresh Token:  有效期 30 天，存储 SHA-256 hash 在 users 表
```

---

## 5. 安全设计

### 5.1 传输安全

```
┌──────────┐                    ┌──────────┐
│  Client  │ ═══ HTTPS/TLS ═══ │  Server  │
│(Electron)│    (1.2 min)       │(Python/  │
│          │                    │  Java)   │
└──────────┘                    └──────────┘

本地模式：进程内调用，无网络传输，不涉及 TLS
云端模式：
  - 强制 HTTPS，证书固定在客户端
  - Certificate Pinning 防止中间人攻击
  - 请求头: Strict-Transport-Security
```

### 5.2 密码安全

```
注册/修改密码流程:
  plaintext_password
       │
       ▼
  bcrypt(salt_rounds=12) 或 argon2id
       │
       ▼
  hash 存入数据库 (password_hash 字段)

登录验证流程:
  plaintext_password ──► bcrypt.compare(hash, password)
                               │
                     ┌─────────┴──────────┐
                     ▼                    ▼
                  匹配                  不匹配
                   │                    │
                   ▼                    ▼
              签发 JWT             返回 401 + 增加失败计数
```

### 5.3 敏感数据存储

| 数据类型 | 本地存储方式 | 云端存储方式 |
|---------|------------|------------|
| 密码 | bcrypt/argon2id hash | bcrypt/argon2id hash |
| JWT Token | 内存 + SQLite（SHA-256 hash） | 内存 + 服务端管理 |
| 数据库密钥 | Windows DPAPI / macOS Keychain | 不适用（客户端不直连DB） |
| API Key | 系统级安全存储 | 环境变量/密钥管理服务 |
| 对话内容 | SQLite 明文（本地文件系统权限保护） | PostgreSQL（服务端访问控制） |

### 5.4 防暴力破解

```
本地模式:
  - 连续失败 10 次 → 锁定 15 分钟
  - 失败计数存储在 users.failed_login_attempts
  - 使用 rate-limiter-flexible 库

云端模式:
  - 由服务端实现（客户端可做初步限流）
  - 客户端在连续失败后显示递增的冷却时间
```

### 5.5 安全审计

所有认证相关操作记录到 `audit_logs` 表：
- 登录成功/失败
- Token 刷新
- 密码修改
- 工作模式切换
- 账户锁定/解锁

---

## 6. DeepAgents 集成

### 6.1 智能体建造者（Builder 模式）

`createDeepAgent` 的参数较多（model、backend、记忆、skills、middleware、subagents 等），直接构造时参数组合复杂、难以复用。采用**建造者模式（Builder Pattern）**将创建过程拆分为可链式调用的配置步骤，将"如何创建"与"创建什么"分离，调用方只按需设置关心的配置项。

依据 LangChain 官方文档（[Customize Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/customization)），`createDeepAgent` 可配置项与建造者方法的对应关系：

| 配置项 | 链式方法 | 说明 |
|--------|---------|------|
| 模型 | `setModel()` | `provider:model` 字符串或已初始化的模型实例 |
| 系统提示词 | `setSystemPrompt()` | 智能体人设指令 |
| 工具 | `setTools()` | 领域工具（支持 MCP 工具） |
| Backend | `setBackend()` | 虚拟文件系统后端：`StateBackend`（默认）/ `FilesystemBackend` / `StoreBackend` / `CompositeBackend` |
| 短期记忆 | `setCheckpointer()` | 线程内对话状态持久化（checkpoint），`interruptOn` 依赖它 |
| 长期记忆 | `setStore()` | 跨线程持久存储（`BaseStore`），`StoreBackend` / `MemoryMiddleware` 依赖它 |
| 记忆文件 | `setMemoryFiles()` | AGENTS.md 上下文文件，启动时注入 |
| Skill | `setSkills()` | Skill 目录，按需加载技能 |
| 中间件 | `setMiddleware()` | 附加中间件，追加在默认中间件栈之后 |
| 子智能体 | `setSubagents()` | 委派任务的专用子智能体（`SubAgent`） |
| 权限 | `setPermissions()` | 文件系统路径级访问控制 |
| 人工介入 | `setInterruptOn()` | 工具调用前暂停，等待人工审批 |
| 结构化输出 | `setResponseFormat()` | 输出 schema |
| 运行时上下文 | `setContextSchema()` | 每次运行的上下文 schema（用户 ID、API Key、功能开关） |

```typescript
// agent/AgentBuilder.ts — 智能体建造者（建造者模式）

import {
  createDeepAgent,
  FilesystemBackend,
  StoreBackend,
  type SubAgent,
  type DeepAgent
} from 'deepagents'
import { InMemoryStore } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { PostgresSaver, PostgresStore } from '@langchain/langgraph-checkpoint-postgres'
import { join } from 'path'
import { getDataDirectory } from '../data-dir'

export type WorkMode = 'local' | 'cloud'

/** 云端 PostgreSQL 连接串（生产环境经 secure-storage 读取） */
const cloudPostgresConnString = process.env.CLOUD_POSTGRES_CONN_STRING ?? ''

// ── 模式默认配置工厂（内部使用）──────────────────────────────

/** 按工作模式创建 backend（虚拟文件系统后端） */
function createBackend(mode: WorkMode) {
  if (mode === 'local') {
    // 本地模式：文件落盘 ~/.ke-work/workspace（虚拟路径映射本地磁盘）
    return new FilesystemBackend({
      rootDir: join(getDataDirectory().getBaseDir(), 'workspace'),
      virtualMode: true
    })
  }
  // 云端模式：文件按用户隔离存储在 Store（PostgreSQL）中，跨设备同步
  return new StoreBackend({
    namespace: (rt) => [rt.serverInfo.user.identity]
  })
}

/** 按工作模式创建短期记忆（Checkpointer） */
function createCheckpointer(mode: WorkMode) {
  return mode === 'local'
    ? SqliteSaver.fromConnString(join(getDataDirectory().getBaseDir(), 'ke-work.db'))
    : PostgresSaver.fromConnString(cloudPostgresConnString)
}

/** 按工作模式创建长期记忆（Store） */
async function createStore(mode: WorkMode) {
  if (mode === 'local') {
    // 本地模式：InMemoryStore（JS 生态当前无持久化 SqliteStore，见 6.3 说明）
    return new InMemoryStore()
  }
  const store = PostgresStore.fromConnString(cloudPostgresConnString)
  await store.setup()
  return store
}

// ── 建造者 ────────────────────────────────────────────────────

export class AgentBuilder {
  private mode: WorkMode
  private config: Record<string, unknown> = {}

  constructor(mode: WorkMode) {
    this.mode = mode
  }

  /** 切换工作模式并重载该模式的默认配置（backend + 记忆），保留其余自定义项 */
  setMode(mode: WorkMode): this {
    this.mode = mode
    return this
  }

  /** 加载工作模式默认配置：backend、短期记忆、长期记忆 */
  async withModeDefaults(): Promise<this> {
    this.config.backend = createBackend(this.mode)
    this.config.checkpointer = createCheckpointer(this.mode)
    this.config.store = await createStore(this.mode)
    return this
  }

  // ── 配置项（链式调用）──
  setModel(model: string): this {
    this.config.model = model
    return this
  }
  setSystemPrompt(prompt: string): this {
    this.config.systemPrompt = prompt
    return this
  }
  setTools(tools: unknown[]): this {
    this.config.tools = tools
    return this
  }
  setBackend(backend: unknown): this {
    this.config.backend = backend
    return this
  }
  setCheckpointer(checkpointer: unknown): this {
    this.config.checkpointer = checkpointer
    return this
  }
  setStore(store: unknown): this {
    this.config.store = store
    return this
  }
  setMemoryFiles(files: string[]): this {
    this.config.memory = files
    return this
  }
  setSkills(skills: string[]): this {
    this.config.skills = skills
    return this
  }
  setMiddleware(middleware: unknown[]): this {
    this.config.middleware = middleware
    return this
  }
  setSubagents(subagents: SubAgent[]): this {
    this.config.subagents = subagents
    return this
  }
  setPermissions(permissions: unknown): this {
    this.config.permissions = permissions
    return this
  }
  setInterruptOn(interruptOn: unknown): this {
    this.config.interruptOn = interruptOn
    return this
  }
  setResponseFormat(schema: unknown): this {
    this.config.responseFormat = schema
    return this
  }
  setContextSchema(schema: unknown): this {
    this.config.contextSchema = schema
    return this
  }

  /** 构建智能体实例 */
  async build(): Promise<DeepAgent> {
    return createDeepAgent({ ...this.config })
  }
}

/** 工厂入口：按工作模式创建带默认配置的建造者 */
export function createAgentBuilder(mode: WorkMode): AgentBuilder {
  return new AgentBuilder(mode).withModeDefaults()
}
```

**使用示例**：

```typescript
// 本地模式：使用默认 backend + 记忆，仅附加 Skill 与中间件
const agent = await createAgentBuilder('local')
  .setModel('deepseek:deepseek-v4-pro')
  .setSystemPrompt('You are a helpful assistant...')
  .setSkills([join(getDataDirectory().getBaseDir(), 'skills/')])
  .setMiddleware([logToolCallsMiddleware])
  .build()

// 云端模式：追加子智能体，配置人工审批
const agent = await createAgentBuilder('cloud')
  .setModel('deepseek:deepseek-v4-pro')
  .setSubagents([researchSubagent])
  .setInterruptOn({ write_file: true })
  .build()
```

**设计要点**：

- `withModeDefaults()` 预置该模式下的 backend 与记忆（checkpointer/store），调用方可逐项覆盖（如 `setBackend`）
- 使用 `skills` / `memory` 时，需确保 Skill / AGENTS.md 文件已存在于 backend 文件系统中（`FilesystemBackend` 直接放置文件；`StoreBackend` 需先通过 `store.aput` 写入）
- 自定义 `middleware` 追加在默认中间件栈之后（Skills → Filesystem → SubAgent → Summarization → PatchToolCalls → 自定义中间件 → Prompt Caching → Memory → HumanInTheLoop）

### 6.2 模式切换时重新初始化 Agent

```typescript
// agent/AgentManager.ts — 智能体生命周期管理
class AgentManager {
  private agent: DeepAgent | null = null
  private builder: AgentBuilder | null = null

  /** 应用启动时初始化智能体 */
  async init(mode: WorkMode): Promise<void> {
    this.builder = createAgentBuilder(mode)
      .setModel('deepseek:deepseek-v4-pro')
      .setSystemPrompt('You are a helpful assistant...')
    this.agent = await this.builder.build()
  }

  /** 切换工作模式：重建 backend 与记忆，保留其他自定义配置 */
  async switchMode(newMode: WorkMode): Promise<void> {
    if (!this.builder) throw new Error('AgentManager not initialized')
    // 1. 释放旧 agent 资源（关闭 checkpointer/store 连接）
    await this.agent?.dispose?.()
    // 2. 切换模式并重载默认 backend + 记忆
    await this.builder.setMode(newMode).withModeDefaults()
    // 3. 以新模式构建 agent（model/systemPrompt/tools 等自定义项保持不变）
    this.agent = await this.builder.build()
  }

  getAgent(): DeepAgent | null {
    return this.agent
  }
}

export const agentManager = new AgentManager()
```

### 6.3 Checkpointer 与 Store 对照

| 功能 | 本地模式 | 云端模式 |
|------|---------|---------|
| 短期记忆 (Checkpointer) | `SqliteSaver` | `PostgresSaver` |
| 长期记忆 (Store) | `InMemoryStore` + `FileSaver` 持久化 | `PostgresStore` |
| 存储内容 | per-thread 对话状态、中断状态 | 跨线程记忆、用户偏好、知识 |
| npm 包 | `@langchain/langgraph-checkpoint-sqlite` | `@langchain/langgraph-checkpoint-postgres` |

---

## 7. 工作模式管理

### 7.1 模式生命周期

```
应用启动
    │
    ▼
读取持久化的 workMode（~/.ke-work/config/work-mode.json，独立于数据库，
保证模式读取与 SQLite 解耦——数据库损坏时仍能启动并默认 local）
    │
    ├── 首次使用 → 默认 'local'
    │
    ├── 已设置 → 恢复上次选择
    │
    ▼
初始化对应 DataSource + Agent
    │
    ▼
用户切换模式（登录页 / 设置页）
    │
    ▼
1. 持久化新模式到 config
2. DataSourceFactory.setMode(newMode)
3. AgentManager.switchMode(newMode)
4. EventEmitter 通知所有 Service 热切换
5. 若在云端模式 → 检查登录状态，可能需要重新登录
```

### 7.2 WorkModeStore

```typescript
// renderer store
export const useWorkModeStore = defineStore('workMode', () => {
  const mode = ref<WorkMode>('local')

  async function loadMode(): Promise<void> {
    // 通过 IPC 从 main process 读取持久化配置
    mode.value = await window.api.getWorkMode()
  }

  async function switchMode(newMode: WorkMode): Promise<void> {
    mode.value = newMode
    await window.api.setWorkMode(newMode)
  }

  return { mode, loadMode, switchMode }
})
```

---

## 8. 模块拆分

### 8.1 文件结构

```
src/main/
├── index.ts                        # [修改] 增加模式初始化
├── platform.ts                     # [已有]
├── data-dir.ts                     # [已有] 数据目录管理
├── database/                       # [新增] 数据库层
│   ├── interfaces/                 # Repository 接口定义
│   │   ├── IAuthRepository.ts
│   │   ├── IConversationRepository.ts
│   │   ├── IConfigRepository.ts
│   │   └── ILogRepository.ts
│   ├── local/                      # 本地 SQLite 实现
│   │   ├── LocalDataSource.ts      # SQLite 连接管理 (Singleton)
│   │   ├── LocalAuthRepository.ts
│   │   ├── LocalConversationRepository.ts
│   │   ├── LocalConfigRepository.ts
│   │   └── migrations/             # SQLite 建表迁移脚本
│   │       └── 001_init.sql
│   ├── cloud/                      # 云端 HTTP API 实现
│   │   ├── CloudDataSource.ts      # Axios 实例管理
│   │   ├── CloudAuthRepository.ts
│   │   ├── CloudConversationRepository.ts
│   │   └── CloudConfigRepository.ts
│   └── DataSourceFactory.ts        # 工厂 + Observer
├── services/                       # [新增] 业务逻辑层
│   ├── AuthService.ts
│   ├── ConversationService.ts
│   └── ConfigService.ts
├── agent/                          # [修改]
│   ├── AgentBuilder.ts             # [新增] 智能体建造者（Builder 模式）
│   ├── AgentManager.ts             # [新增] Agent 生命周期管理
│   ├── agent.ts                    # [修改] Agent 单例入口（委托给 AgentManager）
│   └── service.ts                  # [已有]
├── security/                       # [新增] 安全模块
│   ├── crypto.ts                   # 密码哈希、token 哈希
│   ├── token.ts                    # JWT 签发/验证
│   └── secure-storage.ts           # DPAPI/Keychain 封装
└── ipc/                            # [新增] IPC 处理器
    ├── auth-handlers.ts
    ├── data-handlers.ts
    └── config-handlers.ts

src/renderer/src/
├── store/
│   ├── user.ts                     # [修改] useUserStore
│   ├── agent.ts                    # [修改] useAgentStore
│   └── workMode.ts                 # [新增] useWorkModeStore
├── api/
│   ├── auth.ts                     # [修改] 改用 IPC 调用
│   └── data.ts                     # [新增] 数据 API
└── views/
    ├── Login.vue                   # [修改] 完善登录逻辑
    └── Settings.vue                # [新增] 设置页（模式切换）
```

### 8.2 npm 新增依赖

```json
{
  "dependencies": {
    "better-sqlite3": "^11.x",
    "@langchain/langgraph-checkpoint-sqlite": "^1.0.0",
    "@langchain/langgraph-checkpoint-postgres": "^1.0.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "uuid": "^10.0.0"
  }
}
```

---

## 9. 数据流

### 9.1 登录流程

```
┌──────┐      ┌──────────┐      ┌──────────┐      ┌───────────┐
│Login │ IPC  │  Main    │Repo  │  Local/  │ SQL/ │ Database  │
│.vue  │─────►│ Process  │─────►│  Cloud   │─────►│ (File/API)│
└──────┘      └──────────┘      └──────────┘      └───────────┘

Password Login Flow:
  1. Login.vue: 用户输入账号密码 → handleLogin()
  2. IPC: api.loginByPassword(account, password)
  3. AuthService.loginByPassword(account, password)
  4. repository.loginByPassword(account, password)
     ├── Local: bcrypt.compare + JWT sign
     └── Cloud: POST /api/auth/login-password (HTTPS)
  5. 返回 AuthResult { token, refreshToken, user }
  6. userStore.setToken(token), userStore.setUserInfo(user)
  7. Router → /home
```

### 9.2 模式切换流程

```
Settings.vue 切换模式
  │
  ▼
IPC: api.setWorkMode('cloud')
  │
  ▼
Main Process:
  1. configRepo.set('workMode', 'cloud')   // 持久化
  2. DataSourceFactory.setMode('cloud')      // 切换工厂
  3. AgentManager.switchMode('cloud')        // 重建 Agent
  4. EventEmitter.emit('mode:changed')       // 通知订阅者
  5. 返回成功
  │
  ▼
Renderer: workModeStore.mode = 'cloud'
  若为云端模式且未登录 → 跳转登录页
```

---

## 10. 错误处理

| 场景 | 处理策略 |
|------|---------|
| SQLite 数据库文件损坏 | 备份 → 重建 → 提示用户数据已重置 |
| 云端 API 不可达 | 重试 3 次（间隔递增）→ 提示用户检查网络/切换本地模式 |
| Token 过期 | 自动使用 refreshToken 刷新，失败则跳转登录 |
| 密码连续错误 | 本地：5 次锁定 15 分钟；云端：由服务端控制 |
| 模式切换中 Agent 重建失败 | 回滚到原模式，提示用户稍后重试 |
| 磁盘空间不足 (SQLite) | 捕获写入错误，提示用户清理空间 |

---

## 11. 测试要点

- Repository 接口的两种实现可互换测试（Mock 切换）
- 密码哈希/验证正确性
- JWT 签发、验证、过期处理
- 模式切换后各 Service 的 Repository 引用更新
- DeepAgents checkpointer/store 模式切换
- 登录表单验证（手机号格式、密码长度、验证码）
- IPC 调用超时和错误处理
- SQLite migration 脚本正确性
