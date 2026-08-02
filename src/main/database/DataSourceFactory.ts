import { EventEmitter } from 'events'
import { join } from 'path'
import { homedir } from 'os'
import type { WorkMode } from '../mode/work-mode'
import type { IConfigRepository } from './interfaces/IConfigRepository'
import type { IAuthRepository } from './interfaces/IAuthRepository'
import { LocalDataSource } from './local/LocalDataSource'
import { LocalConfigRepository } from './local/LocalConfigRepository'
import { LocalAuthRepository } from './local/LocalAuthRepository'
import { WorkspaceRepository } from '../workspace/WorkspaceRepository'
import { CloudDataSource, type CloudTokenStore } from './cloud/CloudDataSource'
import { CloudAuthRepository } from './cloud/CloudAuthRepository'
import { CloudConfigRepository } from './cloud/CloudConfigRepository'

/**
 * 数据源工厂（单例 + 工厂 + 观察者）
 * 按当前工作模式创建对应的 Repository 实现（Strategy）
 */
export class DataSourceFactory {
  private static instance: DataSourceFactory | null = null

  private mode: WorkMode = 'local'
  private localDbPath = join(homedir(), '.ke-work', 'ke-work.db')
  private localDataSource: LocalDataSource | null = null
  private cloudDataSource: CloudDataSource | null = null
  private cloudBaseUrl = ''
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
  configure(options: { localDbPath?: string; cloudBaseUrl?: string }): void {
    if (options.localDbPath) this.localDbPath = options.localDbPath
    if (options.cloudBaseUrl) this.cloudBaseUrl = options.cloudBaseUrl
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

  /** 注入云端 token 提供器（登录后设置） */
  setCloudTokenStore(store: CloudTokenStore): void {
    this.getCloudDataSource().setTokenStore(store)
  }

  /** 注入云端 401 刷新回调（返回 true 表示刷新成功） */
  setCloudUnauthorizedHandler(handler: () => Promise<boolean>): void {
    this.getCloudDataSource().setUnauthorizedHandler(handler)
  }

  getCloudDataSource(): CloudDataSource {
    if (!this.cloudDataSource) {
      if (!this.cloudBaseUrl) {
        throw new Error('cloudBaseUrl not configured. Call configure({ cloudBaseUrl }) first.')
      }
      this.cloudDataSource = new CloudDataSource({ baseUrl: this.cloudBaseUrl })
    }
    return this.cloudDataSource
  }

  // ── Repository 工厂方法（Strategy）──

  createConfigRepository(): IConfigRepository {
    return this.mode === 'local'
      ? new LocalConfigRepository(this.getLocalDataSource())
      : new CloudConfigRepository(this.getCloudDataSource())
  }

  createAuthRepository(): IAuthRepository {
    return this.mode === 'local'
      ? new LocalAuthRepository(this.getLocalDataSource())
      : new CloudAuthRepository(this.getCloudDataSource())
  }

  /** 工作空间仓储（机器级资源，与工作模式无关，复用本地连接） */
  createWorkspaceRepository(): WorkspaceRepository {
    return new WorkspaceRepository(this.getLocalDataSource().getDb())
  }

  private getLocalDataSource(): LocalDataSource {
    if (!this.localDataSource) {
      this.localDataSource = new LocalDataSource(this.localDbPath)
    }
    return this.localDataSource
  }

  /** 释放资源（应用退出/测试清理时调用） */
  close(): void {
    this.localDataSource?.close()
    this.localDataSource = null
    this.cloudDataSource = null
  }
}
