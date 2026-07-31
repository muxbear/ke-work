import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAgentStore } from '../../../src/renderer/src/store/agent'

/** 取 mock 首次调用的第一个参数（宽松类型，避免空元组索引报错） */
function firstCallArg(fn: { mock: { calls: unknown[][] } }): unknown {
  return fn.mock.calls[0]?.[0]
}

/** 内存版 window.api（仅会话相关） */
function createMockWindowApi() {
  const conversations = new Map<
    string,
    { id: string; title: string; createdAt: number; updatedAt: number; messages: unknown[] }
  >()
  let seq = 0

  const api = {
    listConversations: vi.fn(async () => ({
      success: true,
      data: [...conversations.values()].map(({ messages: _m, ...c }) => c)
    })),
    createConversation: vi.fn(async (title: string) => {
      const id = `c${++seq}`
      const conv = { id, title, createdAt: seq, updatedAt: seq, messages: [] }
      conversations.set(id, conv)
      return { success: true, data: { id, title, createdAt: seq, updatedAt: seq } }
    }),
    getConversation: vi.fn(async (id: string) => {
      const conv = conversations.get(id)
      if (!conv) return { success: true, data: null }
      return { success: true, data: { ...conv } }
    }),
    updateConversationTitle: vi.fn(async (id: string, title: string) => {
      const conv = conversations.get(id)!
      conv.title = title
      return { success: true, data: { ...conv } }
    }),
    deleteConversation: vi.fn(async (id: string) => {
      conversations.delete(id)
      return { success: true, data: null }
    }),
    addConversationMessage: vi.fn(async (id: string, msg: { role: string; content: string }) => {
      const conv = conversations.get(id)!
      conv.messages.push({ id: `m${conv.messages.length + 1}`, ...msg })
      return { success: true, data: { id: `m${conv.messages.length}`, ...msg } }
    }),
    sendAgentMessage: vi.fn(async () => ({ success: true })),
    cancelAgentMessage: vi.fn(),
    onAgentChunk: vi.fn(() => () => {}),
    onAgentThinking: vi.fn(() => () => {}),
    onAgentThinkingDone: vi.fn(() => () => {}),
    onAgentDone: vi.fn(() => () => {})
  }

  return { api, conversations }
}

describe('useAgentStore（IPC 落库）', () => {
  let mock: ReturnType<typeof createMockWindowApi>

  beforeEach(() => {
    setActivePinia(createPinia())
    mock = createMockWindowApi()
    ;(globalThis as Record<string, unknown>).window = { api: mock.api }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).window
  })

  it('loadConversations 从 IPC 加载会话列表', async () => {
    const store = useAgentStore()
    await store.createConversation()
    await store.createConversation()
    await store.loadConversations()
    expect(store.sortedConversations.length).toBe(2)
    expect(mock.api.listConversations).toHaveBeenCalled()
  })

  it('createConversation 调用 IPC 并设为当前会话', async () => {
    const store = useAgentStore()
    const conv = await store.createConversation()
    expect(mock.api.createConversation).toHaveBeenCalledWith('新对话')
    expect(store.currentConversationId).toBe(conv.id)
    expect(store.currentConversation?.title).toBe('新对话')
  })

  it('sendMessage 完整流程：用户消息与 assistant 消息落库、标题生成', async () => {
    const store = useAgentStore()
    await store.createConversation()

    // 启动 sendMessage（不 await），等待事件监听注册完成后模拟流式事件
    const sendPromise = store.sendMessage('你好世界')
    await vi.waitFor(() => {
      expect(mock.api.onAgentChunk).toHaveBeenCalled()
      expect(mock.api.onAgentDone).toHaveBeenCalled()
    })
    const chunkHandler = firstCallArg(mock.api.onAgentChunk) as (c: string) => void
    const doneHandler = firstCallArg(mock.api.onAgentDone) as () => void
    const thinkingHandler = firstCallArg(mock.api.onAgentThinking) as (c: string) => void

    // 流式输出
    thinkingHandler('思考中...')
    chunkHandler('你好，')
    chunkHandler('世界！')
    doneHandler()
    await sendPromise

    expect(store.currentMessages).toHaveLength(2)
    expect(store.currentMessages[0].content).toBe('你好世界')
    expect(store.currentMessages[1].content).toBe('你好，世界！')
    expect(store.currentMessages[1].reasoning).toBe('思考中...')
    // 落库调用：用户 1 次 + assistant 1 次
    expect(mock.api.addConversationMessage).toHaveBeenCalledTimes(2)
    // 标题生成（第一条消息）
    expect(store.currentConversation?.title).toBe('你好世界')
    expect(mock.api.updateConversationTitle).toHaveBeenCalled()
  })

  it('deleteConversation 同步 IPC 并切换当前会话', async () => {
    const store = useAgentStore()
    await store.createConversation()
    const first = store.currentConversationId!
    await store.createConversation()
    const second = store.currentConversationId!

    await store.deleteConversation(first)
    expect(mock.api.deleteConversation).toHaveBeenCalledWith(first)
    expect(store.currentConversationId).toBe(second)
  })

  it('selectConversation 异步加载消息', async () => {
    const store = useAgentStore()
    await store.createConversation()
    const convId = store.currentConversationId!
    await mock.api.addConversationMessage(convId, { role: 'user', content: '存量消息' })

    await store.selectConversation(convId)
    expect(store.currentMessages).toHaveLength(1)
    expect(store.currentMessages[0].content).toBe('存量消息')
  })
})
