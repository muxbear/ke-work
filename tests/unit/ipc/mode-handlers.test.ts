import { describe, expect, it, vi } from 'vitest'
import { registerModeHandlers } from '../../../src/main/ipc/mode-handlers'

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

describe('mode IPC handlers', () => {
  it('注册 mode:get / mode:set 通道', () => {
    const ipc = createFakeIpcMain()
    registerModeHandlers(ipc as never, {
      modeStore: { getMode: () => 'local' } as never,
      dataSourceFactory: { setMode: vi.fn(), getMode: () => 'local' } as never,
      agentManager: { switchMode: vi.fn() } as never,
      authService: { logout: vi.fn() } as never
    })
    expect(ipc.handle).toHaveBeenCalledWith('mode:get', expect.any(Function))
    expect(ipc.handle).toHaveBeenCalledWith('mode:set', expect.any(Function))
  })

  it('mode:get 返回当前模式', async () => {
    const ipc = createFakeIpcMain()
    registerModeHandlers(ipc as never, {
      modeStore: { getMode: () => 'cloud' } as never,
      dataSourceFactory: { setMode: vi.fn(), getMode: () => 'cloud' } as never,
      agentManager: { switchMode: vi.fn() } as never,
      authService: { logout: vi.fn() } as never
    })
    const result = await ipc.invoke<{ success: boolean; data?: string }>('mode:get')
    expect(result.success).toBe(true)
    expect(result.data).toBe('cloud')
  })

  it('mode:set 联动工厂/AgentManager/登出并持久化', async () => {
    const ipc = createFakeIpcMain()
    const setMode = vi.fn()
    const switchMode = vi.fn().mockResolvedValue(undefined)
    const logout = vi.fn().mockResolvedValue(undefined)
    const storeSet = vi.fn()
    registerModeHandlers(ipc as never, {
      modeStore: { getMode: () => 'local', setMode: storeSet } as never,
      dataSourceFactory: { setMode, getMode: () => 'local' } as never,
      agentManager: { switchMode } as never,
      authService: { logout } as never
    })
    const result = await ipc.invoke<{ success: boolean }>('mode:set', 'cloud')
    expect(result.success).toBe(true)
    expect(storeSet).toHaveBeenCalledWith('cloud') // 持久化
    expect(setMode).toHaveBeenCalledWith('cloud') // 工厂切换
    expect(switchMode).toHaveBeenCalledWith('cloud') // Agent 重建
    expect(logout).toHaveBeenCalled() // 登录态清除（需重新登录）
  })

  it('非法模式值拒绝', async () => {
    const ipc = createFakeIpcMain()
    registerModeHandlers(ipc as never, {
      modeStore: { getMode: () => 'local' } as never,
      dataSourceFactory: { setMode: vi.fn(), getMode: () => 'local' } as never,
      agentManager: { switchMode: vi.fn() } as never,
      authService: { logout: vi.fn() } as never
    })
    const result = await ipc.invoke<{ success: boolean; error?: string }>('mode:set', 'bogus')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('Agent 重建失败时返回错误且模式回滚', async () => {
    const ipc = createFakeIpcMain()
    const storeSet = vi.fn()
    const setMode = vi.fn()
    const switchMode = vi.fn().mockRejectedValue(new Error('agent build failed'))
    registerModeHandlers(ipc as never, {
      modeStore: { getMode: () => 'local', setMode: storeSet } as never,
      dataSourceFactory: { setMode, getMode: () => 'local' } as never,
      agentManager: { switchMode } as never,
      authService: { logout: vi.fn() } as never
    })
    const result = await ipc.invoke<{ success: boolean; error?: string }>('mode:set', 'cloud')
    expect(result.success).toBe(false)
    // 持久化与工厂均未切换（回滚）
    expect(storeSet).not.toHaveBeenCalled()
    expect(setMode).not.toHaveBeenCalled()
  })
})
