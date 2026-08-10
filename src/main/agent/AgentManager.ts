import type { DeepAgent } from 'deepagents'
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import type { WorkMode } from '../mode/work-mode'
import type { ModelService } from '../model/ModelService'
import { AgentBuilder } from './AgentBuilder'
import { createModelOverrideMiddleware } from './ModelOverrideMiddleware'

/** 智能体生命周期管理（单例由调用方持有） */
export class AgentManager {
  private agent: DeepAgent | null = null
  private builder: AgentBuilder | null = null
  private initPromise: Promise<void> | null = null
  private model = 'deepseek:deepseek-v4-pro'
  private skills: string[] = []

  constructor(
    private readonly defaultWorkspaceDir: string,
    private readonly checkpointDbPath: string,
    private readonly storeDbPath: string,
    /** 自定义模型服务（可选：测试/无自定义模型场景不注入则不注册覆盖中间件） */
    private readonly modelService?: ModelService
  ) {}

  /** 应用启动时初始化智能体（保存 promise，供 ready() 复用） */
  async init(mode: WorkMode): Promise<void> {
    this.initPromise = this.buildAgent(mode)
    return this.initPromise
  }

  private async buildAgent(mode: WorkMode): Promise<void> {
    this.builder = new AgentBuilder(
      mode,
      this.defaultWorkspaceDir,
      this.checkpointDbPath,
      this.storeDbPath
    )
      .withModeDefaults()
      .setModel(this.model)
    // 自定义模型覆盖中间件：运行期按 configurable.model_override 切换模型（无需重建 agent）
    if (this.modelService) this.builder.setMiddleware([createModelOverrideMiddleware(this.modelService)])
    if (this.skills.length > 0) this.builder.setSkills(this.skills)
    this.agent = await this.builder.build()
  }

  /** 等待智能体就绪（agent:send 前 await；init 失败时抛错） */
  async ready(): Promise<DeepAgent> {
    if (!this.initPromise) throw new Error('AgentManager not initialized')
    await this.initPromise
    if (!this.agent) throw new Error('Agent not built')
    return this.agent
  }

  /** 当前 checkpointer（会话读写用；switchMode 后指向新实例） */
  getCheckpointer(): BaseCheckpointSaver {
    if (!this.builder) throw new Error('AgentManager not initialized')
    return this.builder.getCheckpointer() as BaseCheckpointSaver
  }

  /**
   * 切换工作模式：重建 backend 与记忆，保留自定义配置
   * 注：deepagents 的 DeepAgent 无 dispose/close API（资源由 backend 管理），
   * 旧实例直接丢弃，新实例在 build 时重建 checkpointer/store
   */
  async switchMode(newMode: WorkMode): Promise<void> {
    if (!this.builder) throw new Error('AgentManager not initialized')
    this.initPromise = this.buildAgent(newMode)
    await this.initPromise
  }

  setModel(model: string): this {
    this.model = model
    this.builder?.setModel(model)
    return this
  }

  setSkills(skills: string[]): this {
    this.skills = skills
    this.builder?.setSkills(skills)
    return this
  }
}
