import type { IpcMain } from 'electron'
import type { WorkspaceService } from '../workspace/WorkspaceService'

interface WorkspaceHandlerDeps {
  workspaceService: WorkspaceService
}

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

/**
 * 注册工作空间相关 IPC 通道
 * 工作空间是机器级资源（目录创建/校验集中在主进程），不依赖登录用户；
 * 渲染层只传 id/name，路径一律由主进程解析，防路径注入
 */
export function registerWorkspaceHandlers(ipc: IpcMain, deps: WorkspaceHandlerDeps): void {
  const { workspaceService } = deps

  ipc.handle('workspace:list', async () => {
    try {
      return ok(workspaceService.list())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:create', async (_event, name?: unknown) => {
    if (typeof name !== 'string' || !name.trim()) return fail('参数错误')
    try {
      return ok(workspaceService.createWorkspace(name))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:select-dir', async () => {
    try {
      // 用户取消时返回 null（success: true）
      return ok(await workspaceService.selectExternalDir())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:timestamp', async () => {
    try {
      return ok(workspaceService.ensureTimestampWorkspace())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:open', async (_event, id?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    try {
      await workspaceService.openWorkspace(id)
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:delete', async (_event, id?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    try {
      workspaceService.deleteWorkspace(id)
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:list-files', async (_event, id?: unknown, relPath?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    if (relPath !== undefined && typeof relPath !== 'string') return fail('参数错误')
    try {
      return ok(workspaceService.listFiles(id, relPath ?? ''))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('workspace:read-file', async (_event, id?: unknown, relPath?: unknown) => {
    if (typeof id !== 'string' || !id || typeof relPath !== 'string') return fail('参数错误')
    try {
      return ok(workspaceService.readFile(id, relPath))
    } catch (err) {
      return fail((err as Error).message)
    }
  })
}
