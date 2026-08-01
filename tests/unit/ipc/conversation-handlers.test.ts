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
    conversationStore: {
      listConversations: vi.fn(),
      getMessages: vi.fn(),
      deleteConversation: vi.fn(),
      buildThreadId: vi.fn()
    },
    session: new SessionService(),
    ...overrides
  } as never
}

describe('conversation IPC handlers（基于 LangGraph checkpointer）', () => {
  it('注册 conversation:list/get/delete 通道', () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(ipc as never, deps())
    for (const channel of ['conversation:list', 'conversation:get', 'conversation:delete']) {
      expect(ipc.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('参数校验：缺失 id 返回错误', async () => {
    const ipc = createFakeIpcMain()
    registerConversationHandlers(ipc as never, deps())
    const result = await ipc.invoke<{ success: boolean; error?: string }>('conversation:get')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('list 基于当前登录用户返回会话列表', async () => {
    const ipc = createFakeIpcMain()
    const session = new SessionService()
    session.setCurrentUser('real-user')
    registerConversationHandlers(
      ipc as never,
      deps({
        conversationStore: {
          listConversations: vi.fn().mockResolvedValue([{ id: 'c1', title: '对话' }])
        },
        session
      })
    )
    const result = await ipc.invoke<{ success: boolean; data?: unknown[] }>('conversation:list')
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('get 注入登录 userId（thread_id 由 ConversationStore 合成，防越权）', async () => {
    const ipc = createFakeIpcMain()
    const session = new SessionService()
    session.setCurrentUser('real-user')
    const getMessages = vi.fn().mockResolvedValue([{ id: 'm1', role: 'user', content: 'hi' }])
    registerConversationHandlers(
      ipc as never,
      deps({
        conversationStore: { getMessages },
        session
      })
    )
    const result = await ipc.invoke<{ success: boolean; data?: { messages: unknown[] } }>(
      'conversation:get',
      'c1'
    )
    expect(result.success).toBe(true)
    expect(getMessages).toHaveBeenCalledWith('real-user', 'c1')
    expect(result.data!.messages).toHaveLength(1)
  })

  it('delete 注入登录 userId 并调用删除', async () => {
    const ipc = createFakeIpcMain()
    const session = new SessionService()
    session.setCurrentUser('real-user')
    const deleteConversation = vi.fn().mockResolvedValue(undefined)
    registerConversationHandlers(
      ipc as never,
      deps({
        conversationStore: { deleteConversation },
        session
      })
    )
    const result = await ipc.invoke<{ success: boolean }>('conversation:delete', 'c1')
    expect(result.success).toBe(true)
    expect(deleteConversation).toHaveBeenCalledWith('real-user', 'c1')
  })

  it('业务错误返回错误信息而不抛异常', async () => {
    const ipc = createFakeIpcMain()
    const session = new SessionService()
    session.setCurrentUser('real-user')
    registerConversationHandlers(
      ipc as never,
      deps({
        conversationStore: {
          deleteConversation: vi.fn().mockRejectedValue(new Error('thread not found'))
        },
        session
      })
    )
    const result = await ipc.invoke<{ success: boolean; error?: string }>('conversation:delete', 'nope')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})
