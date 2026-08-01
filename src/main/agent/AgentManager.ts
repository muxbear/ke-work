import type { DeepAgent } from 'deepagents'
import type { WorkMode } from '../mode/work-mode'
import { AgentBuilder } from './AgentBuilder'

/** 智能体生命周期管理（单例由调用方持有） */
export class AgentManager {
  private agent: DeepAgent | null = null
  private builder: AgentBuilder | null = null
  private model = 'deepseek:deepseek-v4-pro'
  private skills: string[] = []

  constructor(
    private readonly workspaceDir: string,
    private readonly checkpointDbPath: string
  ) {}

  /** 应用启动时初始化智能体 */
  async init(mode: WorkMode): Promise<void> {
    this.builder = new AgentBuilder(mode, this.workspaceDir, this.checkpointDbPath)
      .withModeDefaults()
      .setModel(this.model)
    if (this.skills.length > 0) this.builder.setSkills(this.skills)
    this.agent = await this.builder.build()
  }

  /**
   * 切换工作模式：重建 backend 与记忆，保留自定义配置
   * 注：deepagents 的 DeepAgent 无 dispose/close API（资源由 backend 管理），
   * 旧实例直接丢弃，新实例在 build 时重建 checkpointer/store
   */
  async switchMode(newMode: WorkMode): Promise<void> {
    if (!this.builder) throw new Error('AgentManager not initialized')
    await this.builder.setMode(newMode).withModeDefaults()
    this.agent = await this.builder.build()
  }

  getAgent(): DeepAgent | null {
    return this.agent
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
