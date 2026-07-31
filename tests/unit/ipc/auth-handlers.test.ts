import { describe, expect, it, vi } from 'vitest'
import { registerAuthHandlers } from '../../../src/main/ipc/auth-handlers'

/** fake ipcMain */
function createFakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    handlers,
    async invoke(channel: string, ...args: unknown[]) {
      // 模拟 Electron：handler 首个参数为 IpcMainInvokeEvent
      return handlers.get(channel)!({} as never, ...args)
    }
  }
}

describe('auth IPC handlers', () => {
  it('IPC-01: 注册 auth:* 全部通道', () => {
    const ipc = createFakeIpcMain()
    registerAuthHandlers(ipc as never, {
      authService: {} as never,
      dataSourceFactory: {} as never
    })
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
    registerAuthHandlers(ipc as never, {
      authService: {} as never,
      dataSourceFactory: {} as never
    })
    const result = await ipc.invoke('auth:login-password')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('IPC-03: 业务错误返回错误信息而不抛异常', async () => {
    const ipc = createFakeIpcMain()
    registerAuthHandlers(ipc as never, {
      authService: {
        loginByPassword: vi.fn().mockRejectedValue(new Error('账号或密码错误'))
      } as never,
      dataSourceFactory: {} as never
    })
    const result = await ipc.invoke('auth:login-password', 'wangke', 'wrong')
    expect(result.success).toBe(false)
    expect(result.error).toBe('账号或密码错误')
  })

  it('IPC-04: 成功返回 { success:true, data }', async () => {
    const ipc = createFakeIpcMain()
    registerAuthHandlers(ipc as never, {
      authService: {
        loginByPassword: vi.fn().mockResolvedValue({ token: 't', refreshToken: 'r', user: {} })
      } as never,
      dataSourceFactory: {} as never
    })
    const result = await ipc.invoke('auth:login-password', 'wangke', 'Secret123!')
    expect(result.success).toBe(true)
    expect(result.data.token).toBe('t')
  })
})
