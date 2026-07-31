import { describe, expect, it, vi } from 'vitest'
import { registerConversationHandlers } from '../../../src/main/ipc/conversation-handlers'

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

describe('conversation IPC handlers', () => {
  it('注册 conversation:* 全部通道', () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(ipc as never, {
      conversationService: {
        findAll: vi.fn(),
        create: vi.fn(),
        findById: vi.fn(),
        updateTitle: vi.fn(),
        delete: vi.fn(),
        addMessage: vi.fn()
      } as never
    })
    for (const channel of [
      'conversation:list',
      'conversation:create',
      'conversation:get',
      'conversation:update',
      'conversation:delete',
      'conversation:add-message'
    ]) {
      expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('参数校验：缺失参数返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(ipc as never, {
      conversationService: {
        findAll: vi.fn(),
        create: vi.fn(),
        findById: vi.fn(),
        updateTitle: vi.fn(),
        delete: vi.fn(),
        addMessage: vi.fn()
      } as never
    })
    const result = await ipc.invoke<{ success: boolean; error?: string }>('conversation:create')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('list 返回会话数组', async () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(ipc as never, {
      conversationService: {
        findAll: vi.fn().mockResolvedValue([{ id: 'c1', title: '对话' }])
      } as never
    })
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>('conversation:list')
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('业务错误返回错误信息而不抛异常', async () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(ipc as never, {
      conversationService: {
        addMessage: vi.fn().mockRejectedValue(new Error('conversation not found'))
      } as never
    })
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'conversation:add-message',
      'nope',
      { role: 'user', content: 'x' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})
