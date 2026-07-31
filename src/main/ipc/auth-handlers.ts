import type { AuthService } from '../services/AuthService'
import type { DataSourceFactory } from '../database/DataSourceFactory'
import type { SessionService } from '../services/SessionService'
import type { IpcMain } from 'electron'

interface AuthHandlerDeps {
  authService: AuthService
  dataSourceFactory: DataSourceFactory
  session: SessionService
}

/** 统一的 IPC 结果包裹：成功返回 data，失败返回 { success:false, error } */
function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

/** 注册认证相关 IPC 通道 */
export function registerAuthHandlers(ipc: IpcMain, deps: AuthHandlerDeps): void {
  ipc.handle('auth:login-password', async (_event, account?: unknown, password?: unknown) => {
    if (typeof account !== 'string' || typeof password !== 'string') {
      return { success: false, error: '参数错误' }
    }
    try {
      const result = await deps.authService.loginByPassword(account, password)
      deps.session.setCurrentUser(result.user.id)
      return ok(result)
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipc.handle('auth:login-sms', async (_event, mobile?: unknown, code?: unknown) => {
    if (typeof mobile !== 'string' || typeof code !== 'string') {
      return { success: false, error: '参数错误' }
    }
    try {
      const result = await deps.authService.loginBySms(mobile, code)
      deps.session.setCurrentUser(result.user.id)
      return ok(result)
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipc.handle('auth:send-sms-code', async (_event, mobile?: unknown) => {
    if (typeof mobile !== 'string') {
      return { success: false, error: '参数错误' }
    }
    try {
      await deps.authService.sendSmsCode(mobile)
      return ok(null)
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipc.handle('auth:login-wechat', async (_event, code?: unknown) => {
    if (typeof code !== 'string') {
      return { success: false, error: '参数错误' }
    }
    try {
      const result = await deps.authService.loginByWechat(code)
      deps.session.setCurrentUser(result.user.id)
      return ok(result)
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipc.handle('auth:logout', async (_event, account?: unknown) => {
    if (typeof account !== 'string') {
      return { success: false, error: '参数错误' }
    }
    try {
      await deps.authService.logout(account)
      deps.session.clear()
      return ok(null)
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
