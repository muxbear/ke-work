import type { IpcMain } from 'electron'
import type { SettingsService } from '../settings/SettingsService'

export interface ConfigHandlerDeps {
  settingsService: SettingsService
}

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

/**
 * 注册系统设置相关 IPC 通道
 * 机器级配置（与登录态无关），不调 session.requireUserId()；
 * 主进程为校验权威（白名单 + 类型/枚举/路径合法性），渲染层不可信
 */
export function registerConfigHandlers(ipc: IpcMain, deps: ConfigHandlerDeps): void {
  const { settingsService } = deps

  ipc.handle('config:get-all', async () => {
    try {
      return ok(settingsService.getAll())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('config:set', async (_event, key?: unknown, value?: unknown) => {
    if (typeof key !== 'string' || !key) return fail('参数错误')
    try {
      settingsService.set(key, value)
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('config:storage-stats', async () => {
    try {
      return ok(await settingsService.getStorageStats())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('config:select-workspace-dir', async () => {
    try {
      // 用户取消返回 null（success: true），对齐 workspace:select-dir
      return ok(await settingsService.selectWorkspaceDir())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('config:open-data-dir', async () => {
    try {
      await settingsService.openDataDir()
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })
}
