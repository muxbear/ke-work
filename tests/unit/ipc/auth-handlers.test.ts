import { describe, expect, it, vi } from 'vitest'
import { registerAuthHandlers } from '../../../src/main/ipc/auth-handlers'
import { SessionService } from '../../../src/main/services/SessionService'

/** 构造 handler 依赖（session 为真实实例） */
function deps(overrides: Record<string, unknown> = {}) {
  return {
    authService: {} as never,
    dataSourceFactory: {} as never,
    session: new SessionService(),
    cancelAllAgents: vi.fn(),
    ...overrides
  } as never
}

/** fake ipcMain */
function createFakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    handlers,
    async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
      // 模拟 Electron：handler 首个参数为 IpcMainInvokeEvent
      return handlers.get(channel)!({} as never, ...args) as T
    }
  }
}

describe('auth IPC handlers', () => {
  it('IPC-01: 注册 auth:* 全部通道', () => {
    const ipc = createFakeIpcMain()
    registerAuthHandlers(ipc as never, deps())
    for (const channel of [
      'auth:login-password',
      'auth:login-sms',
      'auth:send-sms-code',
      'auth:login-wechat',
      'auth:logout'
    ]) {
      expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('IPC-02: 参数校验，非法入参返回错误而非异常', async () => {
    const ipc = createFakeIpcMain()
    registerAuthHandlers(ipc as never, deps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('auth:login-password')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('IPC-03: 业务错误返回错误信息而不抛异常', async () => {
    const ipc = createFakeIpcMain()
    registerAuthHandlers(
      ipc as never,
      deps({
        authService: {
          loginByPassword: vi.fn().mockRejectedValue(new Error('账号或密码错误'))
        }
      })
    )
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'auth:login-password',
      'wangke',
      'wrong'
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('账号或密码错误')
  })

  it('IPC-04: 成功返回 { success:true, data }', async () => {
    const ipc = createFakeIpcMain()
    registerAuthHandlers(
      ipc as never,
      deps({
        authService: {
          loginByPassword: vi.fn().mockResolvedValue({
            token: 't',
            refreshToken: 'r',
            user: { id: 'u1', username: 'wangke' }
          })
        }
      })
    )
    const result = await ipc.invoke<{
      success: boolean
      data?: { token: string }
    }>('auth:login-password', 'wangke', 'Secret123!')
    expect(result.success).toBe(true)
    expect(result.data!.token).toBe('t')
  })

  it('IPC-05: auth:logout 成功——先取消全部任务，再清 token 与 session', async () => {
    const ipc = createFakeIpcMain()
    const calls: string[] = []
    const cancelAllAgents = vi.fn(() => calls.push('cancel'))
    const logout = vi.fn(async () => {
      calls.push('logout')
    })
    const session = new SessionService()
    session.setCurrentUser('u1')
    registerAuthHandlers(ipc as never, deps({ authService: { logout }, session, cancelAllAgents }))

    const result = await ipc.invoke<{ success: boolean }>('auth:logout', 'wangke')
    expect(result.success).toBe(true)
    expect(cancelAllAgents).toHaveBeenCalled()
    expect(logout).toHaveBeenCalledWith('wangke')
    // 顺序：取消全部任务必须发生在登出之前
    expect(calls).toEqual(['cancel', 'logout'])
    expect(session.getCurrentUserId()).toBeNull()
  })

  it('IPC-06: auth:logout 参数非字符串返回参数错误，且不执行任何动作', async () => {
    const ipc = createFakeIpcMain()
    const cancelAllAgents = vi.fn()
    const logout = vi.fn()
    const session = new SessionService()
    session.setCurrentUser('u1')
    registerAuthHandlers(ipc as never, deps({ authService: { logout }, session, cancelAllAgents }))

    const result = await ipc.invoke<{ success: boolean; error?: string }>('auth:logout')
    expect(result.success).toBe(false)
    expect(result.error).toBe('参数错误')
    expect(cancelAllAgents).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
    expect(session.getCurrentUserId()).toBe('u1')
  })

  it('IPC-07: auth:logout 业务异常返回错误且不破坏登录态', async () => {
    const ipc = createFakeIpcMain()
    const cancelAllAgents = vi.fn()
    const session = new SessionService()
    session.setCurrentUser('u1')
    registerAuthHandlers(
      ipc as never,
      deps({
        authService: { logout: vi.fn().mockRejectedValue(new Error('db error')) },
        session,
        cancelAllAgents
      })
    )

    const result = await ipc.invoke<{ success: boolean; error?: string }>('auth:logout', 'wangke')
    expect(result.success).toBe(false)
    expect(result.error).toBe('db error')
    expect(session.getCurrentUserId()).toBe('u1')
  })
})
