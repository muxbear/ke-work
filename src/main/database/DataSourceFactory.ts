import { EventEmitter } from 'events'
import { join } from 'path'
import { homedir } from 'os'
import type { WorkMode } from '../mode/work-mode'
import type { IConfigRepository } from './interfaces/IConfigRepository'
import type { IConversationRepository } from './interfaces/IConversationRepository'
import { LocalDataSource } from './local/LocalDataSource'
import { LocalConfigRepository } from './local/LocalConfigRepository'
import { LocalConversationRepository } from './local/LocalConversationRepository'

/**
 * 数据源工厂（单例 + 工厂 + 观察者）
 * 按当前工作模式创建对应的 Repository 实现（Strategy）
 */
export class DataSourceFactory {
  private static instance: DataSourceFactory | null = null

  private mode: WorkMode = 'local'
  private localDbPath = join(homedir(), '.ke-work', 'ke-work.db')
  private localDataSource: LocalDataSource | null = null
  private readonly emitter = new EventEmitter()

  private constructor() {}

  static getInstance(): DataSourceFactory {
    if (!DataSourceFactory.instance) {
      DataSourceFactory.instance = new DataSourceFactory()
    }
    return DataSourceFactory.instance
  }

  /** 测试用：重置单例 */
  static resetForTest(): void {
    DataSourceFactory.instance = null
  }

  /** 运行时配置（应用启动时调用） */
  configure(options: { localDbPath?: string }): void {
    if (options.localDbPath) this.localDbPath = options.localDbPath
  }

  getMode(): WorkMode {
    return this.mode
  }

  /** 切换工作模式并通知订阅者 */
  setMode(mode: WorkMode): void {
    if (this.mode === mode) return
    this.mode = mode
    this.emitter.emit('mode:changed', mode)
  }

  onModeChanged(listener: (mode: WorkMode) => void): () => void {
    this.emitter.on('mode:changed', listener)
    return () => this.emitter.off('mode:changed', listener)
  }

  // ── Repository 工厂方法（Strategy）──

  createConfigRepository(): IConfigRepository {
    return this.mode === 'local'
      ? new LocalConfigRepository(this.getLocalDataSource())
      : (this.createCloudRepository('config') as IConfigRepository)
  }

  createConversationRepository(): IConversationRepository {
    return this.mode === 'local'
      ? new LocalConversationRepository(this.getLocalDataSource())
      : (this.createCloudRepository('conversation') as IConversationRepository)
  }

  private getLocalDataSource(): LocalDataSource {
    if (!this.localDataSource) {
      this.localDataSource = new LocalDataSource(this.localDbPath)
    }
    return this.localDataSource
  }

  /** 云端实现占位：迭代 3 替换为真实 CloudRepository */
  private createCloudRepository(_kind: string): unknown {
    throw new Error(`cloud repository not implemented yet (kind=${_kind})`)
  }

  /** 释放资源（应用退出/测试清理时调用） */
  close(): void {
    this.localDataSource?.close()
    this.localDataSource = null
  }
}
