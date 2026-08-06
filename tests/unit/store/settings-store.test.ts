import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../../../src/renderer/src/store/settings'

/** 内存版 window.api（仅设置相关通道） */
function createMockWindowApi() {
  const store = new Map<string, unknown>([
    ['ui.language', 'zh-CN'],
    ['ui.fontSize', 17]
  ])
  const api = {
    setZoomFactor: vi.fn(),
    getAllSettings: vi.fn(async () => ({
      success: true,
      data: {
        settings: Object.fromEntries(store),
        meta: { dataBaseDir: 'C:\\Users\\t\\.ke-work', workspaceBaseDir: 'C:\\Users\\t\\KeWork' }
      }
    })),
    setSetting: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
      return { success: true, data: null }
    }),
    getStorageStats: vi.fn(async () => ({
      success: true,
      data: { baseDir: '/tmp', usedBytes: 1024, diskTotal: 1024 * 1024, diskFree: 512 * 1024 }
    })),
    selectDefaultWorkspaceDir: vi.fn(async () => ({ success: true, data: null })),
    openDataDir: vi.fn(async () => ({ success: true, data: null }))
  }
  return { api, store }
}

describe('useSettingsStore（渲染层系统设置）', () => {
  let mock: ReturnType<typeof createMockWindowApi>

  beforeEach(() => {
    setActivePinia(createPinia())
    mock = createMockWindowApi()
    ;(globalThis as Record<string, unknown>).window = { api: mock.api }
    mock.api.setZoomFactor.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('load：回填字段 + meta + 应用字体缩放', async () => {
    const s = useSettingsStore()
    await s.load()
    expect(s.language).toBe('zh-CN')
    expect(s.fontSize).toBe(17)
    expect(s.meta?.workspaceBaseDir).toBe('C:\\Users\\t\\KeWork')
    expect(s.loaded).toBe(true)
    expect(mock.api.setZoomFactor).toHaveBeenCalledWith(1) // 17/17
  })

  it('load：主进程返回的设置覆盖默认值', async () => {
    mock.store.set('ui.language', 'en')
    mock.store.set('ui.fontSize', 20)
    const s = useSettingsStore()
    await s.load()
    expect(s.language).toBe('en')
    expect(s.fontSize).toBe(20)
    expect(mock.api.setZoomFactor).toHaveBeenCalledWith(20 / 17)
  })

  it('set：乐观更新本地 + 防抖 300ms 合并持久化', async () => {
    vi.useFakeTimers()
    const s = useSettingsStore()
    await s.load()
    await s.set('ui.language', 'en')
    expect(s.language).toBe('en') // 乐观更新（未等待 IPC）
    expect(mock.api.setSetting).not.toHaveBeenCalled() // 防抖未到期
    await vi.advanceTimersByTimeAsync(300)
    expect(mock.api.setSetting).toHaveBeenCalledWith('ui.language', 'en')
  })

  it('set：同一 key 连续写只落最后值', async () => {
    vi.useFakeTimers()
    const s = useSettingsStore()
    await s.load()
    await s.set('ui.language', 'en')
    await s.set('ui.language', 'zh-TW')
    await vi.advanceTimersByTimeAsync(300)
    expect(mock.api.setSetting).toHaveBeenCalledTimes(1)
    expect(mock.api.setSetting).toHaveBeenCalledWith('ui.language', 'zh-TW')
  })

  it('set 失败：回滚（重新 load 以主进程为准）', async () => {
    vi.useFakeTimers()
    mock.api.setSetting.mockResolvedValue({ success: false, error: '设置值非法' } as never)
    const s = useSettingsStore()
    await s.load()
    await s.set('ui.language', 'fr-FR')
    await vi.advanceTimersByTimeAsync(300)
    expect(s.language).toBe('zh-CN') // 回滚为已持久化值
  })

  it('refreshStorageStats：回填存储统计', async () => {
    const s = useSettingsStore()
    await s.refreshStorageStats()
    expect(s.storageStats?.usedBytes).toBe(1024)
  })

  it('changeWorkspaceDir：选择成功时更新路径与 meta', async () => {
    mock.api.selectDefaultWorkspaceDir.mockResolvedValue({
      success: true,
      data: 'D:\\MyWork'
    } as never)
    const s = useSettingsStore()
    await s.load()
    await s.changeWorkspaceDir()
    expect(s.defaultWorkspaceDir).toBe('D:\\MyWork')
    expect(s.meta?.workspaceBaseDir).toBe('D:\\MyWork')
  })

  it('changeWorkspaceDir：取消（null）不更新', async () => {
    const s = useSettingsStore()
    await s.load()
    await s.changeWorkspaceDir()
    expect(s.defaultWorkspaceDir).toBe('')
  })

  it('load 失败：保留首帧默认值不抛错', async () => {
    mock.api.getAllSettings.mockResolvedValue({ success: false, error: 'boom' } as never)
    const s = useSettingsStore()
    await expect(s.load()).resolves.toBeUndefined()
    expect(s.fontSize).toBe(17)
    expect(s.loaded).toBe(false)
  })
})
