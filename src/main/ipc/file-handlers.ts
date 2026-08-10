import type { IpcMain } from 'electron'
import { stat } from 'fs/promises'
import { classifyPath } from '../agent/file-parts'

/** file:inspect 依赖：登录态守卫（受保护 IPC 路由，主进程会话校验） */
export interface FileInspectDeps {
  requireUserId: () => string
}

/** 注册 file:inspect：选中文件时即时校验（存在性 + 类型分类 + 大小），供渲染层拒绝非法附件 */
export function registerFileHandlers(ipcMain: IpcMain, deps: FileInspectDeps): void {
  ipcMain.handle('file:inspect', async (_event, path?: unknown) => {
    try {
      deps.requireUserId()
    } catch (err) {
      return { success: false, error: (err as Error).message || '未登录' }
    }
    if (typeof path !== 'string' || !path) return { success: false, error: '参数错误' }
    const info = await stat(path).catch(() => null)
    if (!info || !info.isFile()) {
      return { success: true, data: { exists: false, size: 0, kind: 'missing' } }
    }
    return { success: true, data: { exists: true, size: info.size, kind: classifyPath(path) } }
  })
}
