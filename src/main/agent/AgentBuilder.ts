import { createDeepAgent, FilesystemBackend, StoreBackend } from 'deepagents'
import type { SubAgent, DeepAgent } from 'deepagents'
import { InMemoryStore } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { PostgresSaver, PostgresStore } from '@langchain/langgraph-checkpoint-postgres'
import type { WorkMode } from '../mode/work-mode'

/** 云端 PostgreSQL 连接串（生产环境经 secure-storage 读取） */
const cloudPostgresConnString = process.env.CLOUD_POSTGRES_CONN_STRING ?? ''

/** 按工作模式创建 backend（虚拟文件系统后端） */
function createBackend(mode: WorkMode, workspaceDir: string) {
  if (mode === 'local') {
    return new FilesystemBackend({
      rootDir: workspaceDir,
      virtualMode: true
    })
  }
  return new StoreBackend({
    namespace: (rt: { serverInfo: { user: { identity: string } } }) => [rt.serverInfo.user.identity]
  })
}

/** 按工作模式创建短期记忆（Checkpointer） */
function createCheckpointer(mode: WorkMode, dbPath: string) {
  return mode === 'local'
    ? SqliteSaver.fromConnString(dbPath)
    : PostgresSaver.fromConnString(cloudPostgresConnString)
}

/** 按工作模式创建长期记忆（Store） */
async function createStore(mode: WorkMode) {
  if (mode === 'local') {
    return new InMemoryStore()
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

  constructor(
    mode: WorkMode,
    private readonly workspaceDir: string
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
    this.config.backend = createBackend(this.mode, this.workspaceDir)
    this.config.checkpointer = createCheckpointer(this.mode, this.workspaceDir)
    this.storePromise = createStore(this.mode)
    return this
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
export function createAgentBuilder(mode: WorkMode, workspaceDir: string): AgentBuilder {
  return new AgentBuilder(mode, workspaceDir).withModeDefaults()
}
