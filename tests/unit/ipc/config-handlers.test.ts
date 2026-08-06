import { describe, expect, it, vi } from 'vitest'
import { registerConfigHandlers } from '../../../src/main/ipc/config-handlers'
import type { SettingsService } from '../../../src/main/settings/SettingsService'

function createFakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    handlers,
    async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
      return handlers.get(channel)!({} as never, ...args) as T
    }
  }
}

function createSettingsServiceMock(overrides: Partial<Record<keyof SettingsService, unknown>> = {}) {
  return {
    getAll: vi.fn(() => ({ settings: {}, meta: { dataBaseDir: '/tmp', workspaceBaseDir: 'C:\\KeWork' } })),
    set: vi.fn(),
    getStorageStats: vi.fn(async () => ({
      baseDir: '/tmp',
      usedBytes: 1024,
      diskTotal: 1024 * 1024,
      diskFree: 512 * 1024
    })),
    selectWorkspaceDir: vi.fn(async () => null),
    openDataDir: vi.fn(async () => undefined),
    ...overrides
  }
}

describe('config IPC handlers', () => {
  it('注册 5 个通道', () => {
    const ipc = createFakeIpcMain()
    registerConfigHandlers(ipc as never, {
      settingsService: createSettingsServiceMock() as never
    })
    expect(ipc.handle).toHaveBeenCalledWith('config:get-all', expect.any(Function))
    expect(ipc.handle).toHaveBeenCalledWith('config:set', expect.any(Function))
    expect(ipc.handle).toHaveBeenCalledWith('config:storage-stats', expect.any(Function))
    expect(ipc.handle).toHaveBeenCalledWith('config:select-workspace-dir', expect.any(Function))
    expect(ipc.handle).toHaveBeenCalledWith('config:open-data-dir', expect.any(Function))
  })

  it('config:get-all 返回设置快照 + meta', async () => {
    const ipc = createFakeIpcMain()
    const settingsService = createSettingsServiceMock()
    registerConfigHandlers(ipc as never, { settingsService: settingsService as never })
    const result = await ipc.invoke<{ success: boolean; data?: unknown }>('config:get-all')
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('meta')
  })

  it('config:set 合法参数透传并返回 ok', async () => {
    const ipc = createFakeIpcMain()
    const settingsService = createSettingsServiceMock()
    registerConfigHandlers(ipc as never, { settingsService: settingsService as never })
    const result = await ipc.invoke<{ success: boolean }>('config:set', 'ui.language', 'en')
    expect(result.success).toBe(true)
    expect(settingsService.set).toHaveBeenCalledWith('ui.language', 'en')
  })

  it('config:set 非法参数拒绝（key 非字符串）', async () => {
    const ipc = createFakeIpcMain()
    const settingsService = createSettingsServiceMock()
    registerConfigHandlers(ipc as never, { settingsService: settingsService as never })
    const result = await ipc.invoke<{ success: boolean; error?: string }>('config:set', 123)
    expect(result.success).toBe(false)
    expect(settingsService.set).not.toHaveBeenCalled()
  })

  it('config:set 服务抛错转为 { success: false }', async () => {
    const ipc = createFakeIpcMain()
    const settingsService = createSettingsServiceMock({
      set: vi.fn(() => {
        throw new Error('设置值非法')
      })
    })
    registerConfigHandlers(ipc as never, { settingsService: settingsService as never })
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'config:set',
      'ui.language',
      'fr-FR'
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('设置值非法')
  })

  it('config:storage-stats 返回统计', async () => {
    const ipc = createFakeIpcMain()
    registerConfigHandlers(ipc as never, {
      settingsService: createSettingsServiceMock() as never
    })
    const result = await ipc.invoke<{ success: boolean; data?: { usedBytes: number } }>(
      'config:storage-stats'
    )
    expect(result.success).toBe(true)
    expect(result.data?.usedBytes).toBe(1024)
  })

  it('config:select-workspace-dir 用户取消返回 null（success: true）', async () => {
    const ipc = createFakeIpcMain()
    registerConfigHandlers(ipc as never, {
      settingsService: createSettingsServiceMock() as never
    })
    const result = await ipc.invoke<{ success: boolean; data?: unknown }>(
      'config:select-workspace-dir'
    )
    expect(result.success).toBe(true)
    expect(result.data).toBeNull()
  })

  it('config:open-data-dir 返回 ok', async () => {
    const ipc = createFakeIpcMain()
    const settingsService = createSettingsServiceMock()
    registerConfigHandlers(ipc as never, { settingsService: settingsService as never })
    const result = await ipc.invoke<{ success: boolean }>('config:open-data-dir')
    expect(result.success).toBe(true)
    expect(settingsService.openDataDir).toHaveBeenCalled()
  })
})
