import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAgentStore } from '../../../src/renderer/src/store/agent'

/** 取 mock 首次调用的第一个参数（宽松类型，避免空元组索引报错） */
function firstCallArg(fn: { mock: { calls: unknown[][] } }): unknown {
  return fn.mock.calls[0]?.[0]
}

/** 内存版 window.api（仅保留通道；会话数据由 LangGraph checkpointer 管理） */
function createMockWindowApi() {
  const conversations = new Map<
    string,
    { id: string; title: string; createAt: number; updateAt: number; messages: unknown[] }
  >()

  const api = {
    listConversations: vi.fn(async () => ({
      success: true,
      data: [...conversations.values()].map(({ messages: _m, ...c }) => c)
    })),
    getConversation: vi.fn(async (id: string) => {
      const conv = conversations.get(id)
      if (!conv) return { success: true, data: { id, messages: [] } }
      return { success: true, data: { id: conv.id, messages: conv.messages } }
    }),
    deleteConversation: vi.fn(async (id: string) => {
      conversations.delete(id)
      return { success: true, data: null }
    }),
    sendAgentMessage: vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({
      success: true
    })),
    cancelAgentMessage: vi.fn(),
    onAgentChunk: vi.fn(() => () => {}),
    onAgentThinking: vi.fn(() => () => {}),
    onAgentThinkingDone: vi.fn(() => () => {}),
    onAgentDone: vi.fn(() => () => {}),
    onConversationTitleUpdated: vi.fn(() => () => {})
  }

  return { api, conversations }
}

describe('useAgentStore（会话数据基于 LangGraph checkpoint）', () => {
  let mock: ReturnType<typeof createMockWindowApi>

  beforeEach(() => {
    setActivePinia(createPinia())
    mock = createMockWindowApi()
    ;(globalThis as Record<string, unknown>).window = { api: mock.api }
    // workspace store 读取 localStorage 持久化当前空间（node 测试环境无 localStorage）
    ;(globalThis as Record<string, unknown>).localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).window
    delete (globalThis as Record<string, unknown>).localStorage
  })

  it('loadConversations 从 IPC 加载会话列表', async () => {
    const store = useAgentStore()
    mock.conversations.set('c1', { id: 'c1', title: 'A', createAt: 1, updateAt: 2, messages: [] })
    mock.conversations.set('c2', { id: 'c2', title: 'B', createAt: 1, updateAt: 3, messages: [] })
    await store.loadConversations()
    expect(store.sortedConversations.length).toBe(2)
    expect(store.sortedConversations[0].id).toBe('c2') // 按 updateAt 降序
    expect(mock.api.listConversations).toHaveBeenCalled()
  })

  it('createConversation 本地生成 id 并设为当前会话（不调 IPC）', async () => {
    const store = useAgentStore()
    const conv = await store.createConversation()
    expect('createConversation' in mock.api).toBe(false) // 通道已删除，本地创建
    expect(store.currentConversationId).toBe(conv.id)
    expect(store.currentConversation?.title).toBe('新对话')
    expect(store.sortedConversations).toHaveLength(1)
  })

  it('sendMessage 完整流程：流式输出、标题本地生成、主进程收 conversationId + content + workspaceId', async () => {
    const store = useAgentStore()
    await store.createConversation()
    const convId = store.currentConversationId!

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
    // 主进程契约：conversationId + content + workspaceId（未选择空间时为 undefined）+ 发送模式
    expect(mock.api.sendAgentMessage).toHaveBeenCalledWith(convId, '你好世界', undefined, {
      regenerate: false
    })
    // 标题本地生成（第一条消息）
    expect(store.currentConversation?.title).toBe('你好世界')
    // 不再经 IPC 落库
    expect(mock.api.getConversation).not.toHaveBeenCalled()
  })

  it('sendMessage 失败时展示错误信息并保持消息流状态', async () => {
    const store = useAgentStore()
    await store.createConversation()
    mock.api.sendAgentMessage.mockResolvedValueOnce({ success: false, error: '请求超时' })

    await store.sendMessage('测试失败')

    expect(store.currentMessages[1].content).toBe('请求超时')
    expect(store.isStreaming).toBe(false)
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
    mock.conversations.set(convId, {
      id: convId,
      title: '新对话',
      createAt: 1,
      updateAt: 1,
      messages: [{ id: 'm1', role: 'user', content: '存量消息' }]
    })

    await store.selectConversation(convId)
    expect(store.currentMessages).toHaveLength(1)
    expect(store.currentMessages[0].content).toBe('存量消息')
  })

  it('regenerate 截断到最后一条 user 并重发（IPC 第 4 参 regenerate: true，不重复 user 消息）', async () => {
    const store = useAgentStore()
    await store.createConversation()
    const convId = store.currentConversationId!

    // 第一轮
    const p1 = store.sendMessage('第一个问题')
    await vi.waitFor(() => expect(mock.api.onAgentDone).toHaveBeenCalled())
    ;(firstCallArg(mock.api.onAgentDone) as () => void)()
    await p1

    // 第二轮
    mock.api.onAgentDone.mockClear()
    const p2 = store.sendMessage('第二个问题')
    await vi.waitFor(() => expect(mock.api.onAgentDone).toHaveBeenCalled())
    ;(firstCallArg(mock.api.onAgentDone) as () => void)()
    await p2

    expect(store.currentMessages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])

    // regenerate：截断最后一条 AI 回复 + 新占位；user 消息数不变
    mock.api.sendAgentMessage.mockClear()
    mock.api.onAgentDone.mockClear()
    const regen = store.regenerate()
    expect(store.currentMessages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(store.currentMessages.filter((m) => m.role === 'user')).toHaveLength(2)

    await vi.waitFor(() => expect(mock.api.onAgentDone).toHaveBeenCalled())
    ;(firstCallArg(mock.api.onAgentDone) as () => void)()
    await regen

    expect(mock.api.sendAgentMessage).toHaveBeenCalledWith(convId, '第二个问题', undefined, {
      regenerate: true
    })
    const last = store.currentMessages[store.currentMessages.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('regenerate 在流式进行中拒绝（不调用 IPC）', async () => {
    const store = useAgentStore()
    await store.createConversation()
    const p = store.sendMessage('问题')
    await vi.waitFor(() => expect(mock.api.onAgentDone).toHaveBeenCalled())
    const doneHandler = firstCallArg(mock.api.onAgentDone) as () => void

    mock.api.sendAgentMessage.mockClear()
    await store.regenerate()
    expect(mock.api.sendAgentMessage).not.toHaveBeenCalled()

    doneHandler()
    await p
  })

  it('stopAllTasks 重置流式状态（登出/切换前停止所有任务）', () => {
    const store = useAgentStore()
    store.isStreaming = true
    store.isThinking = true

    store.stopAllTasks()

    expect(store.isStreaming).toBe(false)
    expect(store.isThinking).toBe(false)
    // 不触发任何 IPC（主进程任务停止由 auth:logout 联动）
    expect(mock.api.cancelAgentMessage).not.toHaveBeenCalled()
  })

  it('loadConversations 当前会话已不存在（级联删除）时清空选中态', async () => {
    const store = useAgentStore()
    mock.conversations.set('c1', {
      id: 'c1',
      title: 'A',
      createAt: 1,
      updateAt: 2,
      messages: [{ id: 'm1', role: 'user', content: 'hi' }]
    })
    await store.loadConversations()
    await store.selectConversation('c1')
    expect(store.currentConversationId).toBe('c1')
    // 主进程侧会话被级联删除（移除工作空间）→ 重载列表不含 c1
    mock.conversations.delete('c1')
    await store.loadConversations()
    expect(store.currentConversationId).toBeNull()
    expect(store.currentMessages.length).toBe(0)
  })

  it('loadConversations 当前会话仍在列表中时保留选中态', async () => {
    const store = useAgentStore()
    mock.conversations.set('c1', {
      id: 'c1',
      title: 'A',
      createAt: 1,
      updateAt: 2,
      messages: []
    })
    await store.loadConversations()
    await store.selectConversation('c1')
    await store.loadConversations()
    expect(store.currentConversationId).toBe('c1')
  })
})
