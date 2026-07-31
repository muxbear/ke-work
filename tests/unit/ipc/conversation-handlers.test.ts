import { describe, expect, it, vi } from 'vitest'
import { registerConversationHandlers } from '../../../src/main/ipc/conversation-handlers'
import { SessionService } from '../../../src/main/services/SessionService'

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

/** 构造 handler 依赖（session 为真实实例） */
function deps(overrides: Record<string, unknown> = {}) {
  return {
    conversationService: {
      findAll: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      updateTitle: vi.fn(),
      delete: vi.fn(),
      addMessage: vi.fn()
    },
    session: new SessionService(),
    ...overrides
  } as never
}

describe('conversation IPC handlers', () => {
  it('注册 conversation:* 全部通道', () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(ipc as never, deps())
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
    registerConversationHandlers(ipc as never, deps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('conversation:create')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('list 返回会话数组', async () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(
      ipc as never,
      deps({
        conversationService: {
          findAll: vi.fn().mockResolvedValue([{ id: 'c1', title: '对话' }])
        }
      })
    )
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>('conversation:list')
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('业务错误返回错误信息而不抛异常', async () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(
      ipc as never,
      deps({
        conversationService: {
          addMessage: vi.fn().mockRejectedValue(new Error('conversation not found'))
        }
      })
    )
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'conversation:add-message',
      'nope',
      { role: 'user', content: 'x' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('契约: 未登录时 conversation:create 拒绝（不信任渲染层 userId）', async () => {
    const ipc = createFakeIpcMain()
    const create = vi.fn()
    registerConversationHandlers(
      ipc as never,
      deps({
        conversationService: { create }
      })
    )
    const result = await ipc.invoke<{ success: boolean; error?: string }>(
      'conversation:create',
      'fake-user-id',
      '新对话'
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/未登录/)
    expect(create).not.toHaveBeenCalled()
  })

  it('契约: 登录后 conversation:create 注入真实 userId（忽略渲染层传参）', async () => {
    const ipc = createFakeIpcMain()
    const session = new SessionService()
    session.setCurrentUser('real-user')
    const create = vi.fn().mockResolvedValue({ id: 'c1', userId: 'real-user', title: '新对话' })
    registerConversationHandlers(
      ipc as never,
      deps({
        conversationService: { create },
        session
      })
    )
    const result = await ipc.invoke<{ success: boolean; data?: { userId: string } }>(
      'conversation:create',
      'fake-user-id',
      '新对话'
    )
    expect(result.success).toBe(true)
    expect(create).toHaveBeenCalledWith({ userId: 'real-user', title: '新对话' })
  })
})
