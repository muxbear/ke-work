import type { IpcMain } from 'electron'
import type { WorkspaceService } from '../workspace/WorkspaceService'
import type { SessionService } from '../services/SessionService'

export interface WorkspaceHandlerDeps {
  workspaceService: WorkspaceService
  session: SessionService
}

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

/**
 * 注册工作空间相关 IPC 通道
 * 工作空间按登录用户隔离（主进程 session 注入 userId）；
 * 渲染层只传 id/name，路径一律由主进程解析，防路径注入
 */
export function registerWorkspaceHandlers(ipc: IpcMain, deps: WorkspaceHandlerDeps): void {
  const { workspaceService, session } = deps

  ipc.handle('workspace:list', async () => {
    try {
      const userId = session.requireUserId()
      return ok(workspaceService.list(userId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:create', async (_event, name?: unknown) => {
    if (typeof name !== 'string' || !name.trim()) return fail('参数错误')
    try {
      const userId = session.requireUserId()
      return ok(workspaceService.createWorkspace(name, userId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:select-dir', async () => {
    try {
      const userId = session.requireUserId()
      // 用户取消时返回 null（success: true）
      return ok(await workspaceService.selectExternalDir(userId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:default', async () => {
    try {
      session.requireUserId()
      return ok(workspaceService.ensureDefaultWorkspace())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:open', async (_event, id?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    try {
      const userId = session.requireUserId()
      await workspaceService.openWorkspace(id, userId)
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:delete', async (_event, id?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    try {
      const userId = session.requireUserId()
      workspaceService.deleteWorkspace(id, userId)
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:list-files', async (_event, id?: unknown, relPath?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    if (relPath !== undefined && typeof relPath !== 'string') return fail('参数错误')
    try {
      const userId = session.requireUserId()
      return ok(workspaceService.listFiles(id, userId, relPath ?? ''))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:read-file', async (_event, id?: unknown, relPath?: unknown) => {
    if (typeof id !== 'string' || !id || typeof relPath !== 'string') return fail('参数错误')
    try {
      const userId = session.requireUserId()
      return ok(await workspaceService.readFile(id, userId, relPath))
    } catch (err) {
      return fail((err as Error).message)
    }
  })
}
