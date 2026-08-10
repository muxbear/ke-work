import { describe, expect, it, vi } from 'vitest'
import { registerModelHandlers, type ModelHandlerDeps } from '../../../src/main/ipc/model-handlers'

function createFakeIpcMain(): {
  handle: ReturnType<typeof vi.fn>
  handlers: Map<string, (...args: unknown[]) => unknown>
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
} {
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

const fakeRecord = {
  id: 'gpt-4o',
  name: 'gpt-4o',
  vendor: 'DeepSeek',
  url: 'https://api.deepseek.com/chat/completions',
  apiKey: 'sk-test',
  supportsToolCall: true,
  supportsImages: false,
  supportsReasoning: false
}

/** 测试依赖：mock ModelService（机器级，无需 SessionService） */
function createDeps(overrides: Record<string, unknown> = {}): ModelHandlerDeps {
  return {
    modelService: {
      list: vi.fn().mockReturnValue([fakeRecord]),
      add: vi.fn().mockReturnValue(fakeRecord),
      remove: vi.fn().mockReturnValue(undefined),
      listProviders: vi.fn().mockReturnValue([{ id: 'deepseek', name: 'DeepSeek', defaultUrl: '', plans: [] }])
    } as never,
    ...overrides
  } as ModelHandlerDeps
}

const validInput = {
  id: 'gpt-4o',
  name: 'gpt-4o',
  vendor: 'DeepSeek',
  url: 'https://api.deepseek.com/chat/completions',
  apiKey: 'sk-test'
}

describe('model IPC handlers（机器级，不依赖登录态）', () => {
  it('注册 model:list/add/remove/update/list-providers 通道', () => {
    const ipc = createFakeIpcMain()
    registerModelHandlers(ipc as never, createDeps())
    for (const channel of [
      'model:list',
      'model:add',
      'model:remove',
      'model:update',
      'model:list-providers'
    ]) {
      expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('list 返回全部模型', async () => {
    const ipc = createFakeIpcMain()
    registerModelHandlers(ipc as never, createDeps())
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>('model:list')
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('add 缺参 / 字段类型错返回 fail', async () => {
    const ipc = createFakeIpcMain()
    registerModelHandlers(ipc as never, createDeps())
    const noArg = await ipc.invoke<{ success: boolean; error?: string }>('model:add')
    expect(noArg.success).toBe(false)
    expect(noArg.error).toBeTruthy()
    const badType = await ipc.invoke<{ success: boolean; error?: string }>('model:add', {
      ...validInput,
      apiKey: 123
    })
    expect(badType.success).toBe(false)
  })

  it('add 合法入参透传并返回记录', async () => {
    const ipc = createFakeIpcMain()
    const add = vi.fn().mockReturnValue(fakeRecord)
    registerModelHandlers(ipc as never, createDeps({ modelService: { add } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown }>('model:add', validInput)
    expect(add).toHaveBeenCalledWith(validInput)
    expect(result.success).toBe(true)
    expect(result.data).toEqual(fakeRecord)
  })

  it('add 业务错误（已存在同名模型）透传 fail', async () => {
    const ipc = createFakeIpcMain()
    const add = vi.fn().mockImplementation(() => {
      throw new Error('已存在同名模型')
    })
    registerModelHandlers(ipc as never, createDeps({ modelService: { add } }))
    const result = await ipc.invoke<{ success: boolean; error?: string }>('model:add', validInput)
    expect(result.success).toBe(false)
    expect(result.error).toContain('已存在')
  })

  it('remove 无 id 返回 fail', async () => {
    const ipc = createFakeIpcMain()
    registerModelHandlers(ipc as never, createDeps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('model:remove')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('remove 合法 id 调用服务（幂等）', async () => {
    const ipc = createFakeIpcMain()
    const remove = vi.fn().mockReturnValue(undefined)
    registerModelHandlers(ipc as never, createDeps({ modelService: { remove } }))
    const result = await ipc.invoke<{ success: boolean }>('model:remove', 'gpt-4o')
    expect(remove).toHaveBeenCalledWith('gpt-4o')
    expect(result.success).toBe(true)
  })

  it('update 缺 id / 缺参 / 类型错返回 fail', async () => {
    const ipc = createFakeIpcMain()
    registerModelHandlers(ipc as never, createDeps())
    const noId = await ipc.invoke<{ success: boolean; error?: string }>('model:update', undefined, validInput)
    expect(noId.success).toBe(false)
    const noInput = await ipc.invoke<{ success: boolean; error?: string }>('model:update', 'gpt-4o')
    expect(noInput.success).toBe(false)
    const badType = await ipc.invoke<{ success: boolean; error?: string }>('model:update', 'gpt-4o', { ...validInput, apiKey: 123 })
    expect(badType.success).toBe(false)
  })

  it('update 合法入参透传（id + input）并返回更新记录', async () => {
    const ipc = createFakeIpcMain()
    const update = vi.fn().mockReturnValue({ ...fakeRecord, name: '改名' })
    registerModelHandlers(ipc as never, createDeps({ modelService: { update } }))
    const result = await ipc.invoke<{ success: boolean; data?: unknown }>(
      'model:update',
      'gpt-4o',
      { ...validInput, name: '改名' }
    )
    expect(update).toHaveBeenCalledWith('gpt-4o', { ...validInput, name: '改名' })
    expect(result.success).toBe(true)
    expect((result.data as { name: string }).name).toBe('改名')
  })

  it('update 业务错误（模型不存在）透传 fail', async () => {
    const ipc = createFakeIpcMain()
    const update = vi.fn().mockImplementation(() => {
      throw new Error('模型不存在')
    })
    registerModelHandlers(ipc as never, createDeps({ modelService: { update } }))
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'model:update',
      'nope',
      validInput
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
  })

  it('list-providers 透传提供商列表', async () => {
    const ipc = createFakeIpcMain()
    const providers = [{ id: 'deepseek', name: 'DeepSeek', defaultUrl: 'x', plans: [{ type: 'Token Plan' }] }]
    registerModelHandlers(
      ipc as never,
      createDeps({ modelService: { listProviders: vi.fn().mockReturnValue(providers) } })
    )
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>('model:list-providers')
    expect(result.success).toBe(true)
    expect(result.data).toEqual(providers)
  })
})
