import { createDeepAgent, LocalShellBackend, StoreBackend } from 'deepagents'
import type { SubAgent, DeepAgent } from 'deepagents'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store'
import type { WorkMode } from '../mode/work-mode'
import { SqliteStore } from './SqliteStore'

/** 云端 PostgreSQL 连接串（生产环境经 secure-storage 读取） */
const cloudPostgresConnString = process.env.CLOUD_POSTGRES_CONN_STRING ?? ''

/**
 * 按工作模式创建 backend（虚拟文件系统后端）
 *
 * local 分支返回工厂函数而非实例：deepagents 每次工具调用时以运行期 runtime 调用工厂，
 * 从 configurable.workspace_dir 解析当前会话的工作空间目录，为不同任务创建不同根目录的
 * LocalShellBackend（同时获得 execute shell 工具能力）。
 *
 * ⚠️ LocalShellBackend 无沙箱（文档警告 unrestricted shell execution）；virtualMode: true
 * 只约束文件操作、不限制 shell 命令，工作空间目录由主进程权威解析（渲染层只传 id）。
 */
function createBackend(mode: WorkMode, defaultWorkspaceDir: string) {
  if (mode === 'local') {
    return (runtime: {
      configurable?: Record<string, unknown>
      config?: { configurable?: Record<string, unknown> }
    }): LocalShellBackend => {
      const dir = String(
        runtime.configurable?.workspace_dir ??
          runtime.config?.configurable?.workspace_dir ??
          defaultWorkspaceDir
      )
      return new LocalShellBackend({ rootDir: dir, virtualMode: true, inheritEnv: true })
    }
  }
  return new StoreBackend({
    // 按用户身份隔离命名空间（user id 经 agent:send 的 configurable.user_id 注入）
    namespace: (context) => [String(context.config?.configurable?.user_id ?? 'default')]
  })
}

/** 按工作模式创建短期记忆（Checkpointer） */
function createCheckpointer(mode: WorkMode, dbPath: string) {
  return mode === 'local'
    ? SqliteSaver.fromConnString(dbPath)
    : PostgresSaver.fromConnString(cloudPostgresConnString)
}

/** 按工作模式创建长期记忆（Store）：local 用 SqliteStore（参考 PostgresStore 移植），cloud 用 PostgresStore */
async function createStore(mode: WorkMode, storeDbPath: string) {
  if (mode === 'local') {
    return SqliteStore.fromConnString(storeDbPath)
  }
  const store = PostgresStore.fromConnString(cloudPostgresConnString)
  await store.setup()
  return store
}

/** 智能体建造者（建造者模式）：将 createDeepAgent 配置拆为链式步骤 */
export class AgentBuilder {
  private mode: WorkMode
  private config: Record<string, unknown> = {}
  private storePromise: Promise<unknown> | null = null
  private checkpointer: unknown = null

  constructor(
    mode: WorkMode,
    private readonly defaultWorkspaceDir: string,
    private readonly checkpointDbPath: string,
    private readonly storeDbPath: string
  ) {
    this.mode = mode
  }

  /** 切换工作模式（重载默认 backend + 记忆，保留自定义项） */
  setMode(mode: WorkMode): this {
    this.mode = mode
    return this
  }

  /**
   * 加载工作模式默认配置：backend、短期记忆、长期记忆
   * 同步返回 this 以支持链式调用；异步的 store 创建延后到 build() 时 await
   */
  withModeDefaults(): this {
    this.config.backend = createBackend(this.mode, this.defaultWorkspaceDir)
    this.checkpointer = createCheckpointer(this.mode, this.checkpointDbPath)
    this.config.checkpointer = this.checkpointer
    this.storePromise = createStore(this.mode, this.storeDbPath)
    return this
  }

  /** 当前 checkpointer（供 ConversationStore 会话读写使用；mode 切换后指向新实例） */
  getCheckpointer(): unknown {
    return this.checkpointer
  }

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
    if (this.storePromise) {
      this.config.store = await this.storePromise
      this.storePromise = null
    }
    return createDeepAgent({ ...this.config })
  }
}

/** 工厂入口：按工作模式创建带默认配置的建造者（同步返回，可立即链式调用） */
export function createAgentBuilder(
  mode: WorkMode,
  defaultWorkspaceDir: string,
  checkpointDbPath: string,
  storeDbPath: string
): AgentBuilder {
  return new AgentBuilder(mode, defaultWorkspaceDir, checkpointDbPath, storeDbPath).withModeDefaults()
}
