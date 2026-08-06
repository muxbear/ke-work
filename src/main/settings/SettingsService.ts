import { join } from 'path'
import { homedir } from 'os'
import { isAbsolute } from 'path'
import type { SettingsStore } from './SettingsStore'
import { isSettingsKey, isValidSettingsValue } from './schema'
import { getDiskUsage, type StorageStats } from './DiskUsageService'

export type ProxyMode = 'direct' | 'system' | 'manual'

/** 外部效果依赖（index.ts 装配注入；可注入便于测试） */
export interface SettingsServiceDeps {
  /** 应用代理（session.setProxy 封装） */
  applyProxy: (mode: ProxyMode, url: string) => Promise<void>
  /** 锁屏远程（powerSaveBlocker 封装） */
  setLockScreen: (enabled: boolean) => void
  /** 系统目录选择对话框（取消返回 null） */
  selectDir: () => Promise<string | null>
  /** 打开目录（shell.openPath） */
  openPath: (p: string) => Promise<void>
  /** 工作空间基址变更通知（WorkspaceService.setBaseDir） */
  onWorkspaceBaseDirChange: (dir: string) => void
}

export interface SettingsMeta {
  /** ~/.ke-work 基础目录 */
  dataBaseDir: string
  /** 生效中的工作空间基址（settings 为空时 = ~/KeWork） */
  workspaceBaseDir: string
}

/** 工作空间基址默认值（与 WorkspaceService 构造默认一致） */
export const DEFAULT_WORKSPACE_BASE_DIR = join(homedir(), 'KeWork')

/**
 * 系统设置业务服务：
 * - getAll：默认值合并后的扁平快照 + meta（供 UI 显示真实值）
 * - set：白名单 + 类型/枚举校验（主进程校验权威）→ 持久化 → 按 key 分发效果
 * - 存储统计 / 目录选择 / 打开数据目录
 */
export class SettingsService {
  constructor(
    private readonly store: SettingsStore,
    private readonly dataBaseDir: string,
    private readonly deps: SettingsServiceDeps
  ) {}

  getAll(): { settings: Record<string, unknown>; meta: SettingsMeta } {
    const settings = this.store.getAll() as unknown as Record<string, unknown>
    const workspaceBaseDir =
      (this.store.get('workspace.defaultWorkspaceDir') as string) || DEFAULT_WORKSPACE_BASE_DIR
    return { settings, meta: { dataBaseDir: this.dataBaseDir, workspaceBaseDir } }
  }

  /** 校验 → 持久化 → 按 key 分发效果（代理/锁屏/工作空间基址即时生效） */
  set(key: string, value: unknown): void {
    if (!isSettingsKey(key)) throw new Error(`未知设置项: ${String(key)}`)
    if (!isValidSettingsValue(key, value)) {
      throw new Error(`设置值非法: ${key}=${JSON.stringify(value)}`)
    }
    this.store.set(key, value)

    switch (key) {
      case 'network.proxyMode':
      case 'network.proxyUrl': {
        const mode = this.store.get('network.proxyMode') as ProxyMode
        const url = this.store.get('network.proxyUrl') as string
        void this.deps
          .applyProxy(mode, url)
          .catch((err) => console.warn('[settings] applyProxy failed:', err))
        break
      }
      case 'lockScreen.remoteLock':
        this.deps.setLockScreen(value === true)
        break
      case 'workspace.defaultWorkspaceDir':
        this.deps.onWorkspaceBaseDirChange((value as string) || DEFAULT_WORKSPACE_BASE_DIR)
        break
    }
  }

  /** ~/.ke-work 目录占用真实统计 + 磁盘容量（设置页打开时请求） */
  getStorageStats(): Promise<StorageStats> {
    return getDiskUsage(this.dataBaseDir)
  }

  /** 系统目录选择对话框 → 校验绝对路径 → 持久化（set 触发基址变更分发） */
  async selectWorkspaceDir(): Promise<string | null> {
    const dir = await this.deps.selectDir()
    if (!dir) return null
    if (!isAbsolute(dir)) throw new Error('路径必须为绝对路径')
    this.set('workspace.defaultWorkspaceDir', dir)
    return dir
  }

  /** 打开 ~/.ke-work 数据目录 */
  openDataDir(): Promise<void> {
    return this.deps.openPath(this.dataBaseDir)
  }
}
