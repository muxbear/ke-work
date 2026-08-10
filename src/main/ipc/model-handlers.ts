import type { IpcMain } from 'electron'
import type { ModelService } from '../model/ModelService'

export interface ModelHandlerDeps {
  modelService: ModelService
}

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

/** 添加模型入参白名单（渲染层不可信，类型校验在主进程） */
function toAddInput(input: unknown): {
  id: string
  name: string
  vendor: string
  url: string
  apiKey: string
} | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  if (
    typeof v.id !== 'string' ||
    typeof v.name !== 'string' ||
    typeof v.vendor !== 'string' ||
    typeof v.url !== 'string' ||
    typeof v.apiKey !== 'string'
  ) {
    return null
  }
  return { id: v.id, name: v.name, vendor: v.vendor, url: v.url, apiKey: v.apiKey }
}

/**
 * 注册自定义模型相关 IPC 通道
 * 机器级配置（本地 models.json，与登录态无关），不调 session.requireUserId()；
 * 主进程为校验权威，渲染层不可信
 */
export function registerModelHandlers(ipc: IpcMain, deps: ModelHandlerDeps): void {
  const { modelService } = deps

  ipc.handle('model:list', async () => {
    try {
      return ok(modelService.list())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('model:add', async (_event, input?: unknown) => {
    const parsed = toAddInput(input)
    if (!parsed) return fail('参数错误')
    try {
      return ok(modelService.add(parsed))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('model:remove', async (_event, id?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    try {
      modelService.remove(id)
      return ok(null)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('model:update', async (_event, id?: unknown, input?: unknown) => {
    if (typeof id !== 'string' || !id) return fail('参数错误')
    const parsed = toAddInput(input)
    if (!parsed) return fail('参数错误')
    try {
      return ok(modelService.update(id, parsed))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipc.handle('model:list-providers', async () => {
    try {
      return ok(modelService.listProviders())
    } catch (err) {
      return fail((err as Error).message)
    }
  })
}
