import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  reasoning?: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createAt: number
  updateAt: number
}

/**
 * 生成一条 ID
 * @returns
 */
function getId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

/**
 * 存储中提取所有会话
 * @returns
 */
function loadCoversations(): Conversation[] {
  try {
    const raw = localStorage.getItem('chat_conversations')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * 保持所有会话到存储
 * @param list
 */
function saveConversations(list: Conversation[]): void {
  localStorage.setItem('chat_conversations', JSON.stringify(list))
}

/**
 * 智能体状态管理（使用组合式 API 写法）
 */
export const useAgentStore = defineStore('agent', () => {
  // ====== 状态(State) ======
  const sidebarVisible = ref<boolean>(true)

  const conversations = ref<Conversation[]>(loadCoversations())
  const currentConversationId = ref<string | null>(null)
  const isStreaming = ref<boolean>(false)
  const isThinking = ref<boolean>(false)

  // ====== 计算属性(Getters) ======
  const currentConversation = computed(
    () => conversations.value.find((cov) => cov.id == currentConversationId.value) ?? null
  )

  const currentMessages = computed(() => currentConversation.value?.messages ?? [])

  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => b.updateAt - a.updateAt)
  )

  // ====== 方法(Actions) ======
  function persist(): void {
    saveConversations(conversations.value)
  }

  /**
   * 创建会话(多轮对话)
   * @returns
   */
  function createConversation(): Conversation {
    const conv: Conversation = {
      id: getId(),
      title: '新对话',
      messages: [],
      createAt: Date.now(),
      updateAt: Date.now()
    }
    conversations.value.push(conv)
    currentConversationId.value = conv.id
    persist()
    // 返回 reactive 代理对象，而非原始对象
    return conversations.value[conversations.value.length - 1]
  }

  /**
   * 获取本次对话（多轮对话）
   * @returns
   */
  function ensureConversation(): Conversation {
    if (!currentConversationId.value || !currentConversation.value) {
      return createConversation()
    }
    return currentConversation.value
  }

  /**
   * 选中一个会话
   * @param id
   */
  function selectConversation(id: string): void {
    currentConversationId.value = id
  }

  function deleteConversation(id: string): void {
    const idx = conversations.value.findIndex((c) => c.id === id)
    if (idx === -1) return

    conversations.value.splice(idx, 1)

    if (currentConversationId.value === id) {
      currentConversationId.value =
        conversations.value.length > 0 ? conversations.value[0].id : null
    }

    persist()
  }

  /**
   * 批量删除会话
   * @param ids 会话标识串（以“,”连接）
   */
  function batchDeleteConversations(ids: string): void {
    conversations.value = conversations.value.filter((c) => !ids.includes(c.id))
    if (currentConversationId.value && ids.includes(currentConversationId.value)) {
      currentConversationId.value =
        conversations.value.length > 0 ? conversations.value[0].id : null
    }
    persist()
  }

  /**
   * 更新会话标题
   * @param id 会话标识
   * @param title 会话标题
   */
  function updateConversationTitle(id: string, title: string): void {
    const conv = conversations.value.find((c) => c.id === id)
    if (conv) {
      conv.title = title
      persist()
    }
  }

  async function sendMessage(content: string): Promise<void> {
    console.log('[store] sendMessage called with:', content)
    const conv = ensureConversation()
    console.log('[store] conv id:', conv.id, 'isProxy:', typeof conv === 'object')

    const userMsg: Message = {
      id: getId(),
      role: 'user',
      content: content
    }

    conv.messages.push(userMsg)
    conv.updateAt = Date.now()
    console.log('[store] pushed userMsg, messages count:', conv.messages.length)

    // 根据用户消息生成会话标题
    if (conv.messages.length === 1) {
      conv.title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
    }

    persist()

    // 创建一条 AI 消息进行占位
    const assistantMsg: Message = {
      id: getId(),
      role: 'assistant',
      content: ''
    }

    conv.messages.push(assistantMsg)
    conv.updateAt = Date.now()
    persist()
    console.log('[store] pushed assistantMsg placeholder')

    isStreaming.value = true
    isThinking.value = true
    console.log('[store] window.api available:', typeof (window as any).api, 'sendAgentMessage:', typeof (window as any).api?.sendAgentMessage, 'onAgentChunk:', typeof (window as any).api?.onAgentChunk)

    // 通过 reactive 代理获取 assistant 消息，确保后续修改能触发响应式更新
    const getAssistantMsg = (): Message | undefined => {
      const msgs = conv.messages
      const last = msgs[msgs.length - 1]
      console.log('[store] getAssistantMsg from conv.messages, count:', msgs.length, 'last role:', last?.role)
      return last && last.role === 'assistant' ? last : undefined
    }

    // 深度思考（reasoning）流
    const unlistenThinking = (window.api as any).onAgentThinking((chunk: string) => {
      const msg = getAssistantMsg()
      if (msg) {
        msg.reasoning = (msg.reasoning || '') + chunk
      }
      conv.updateAt = Date.now()
      persist()
    })

    const unlistenThinkingDone = (window.api as any).onAgentThinkingDone(() => {
      console.log('[store] onAgentThinkingDone received')
      isThinking.value = false
    })

    const unlistenChunk = (window.api as any).onAgentChunk((chunk: string) => {
      const msg = getAssistantMsg()
      console.log('[store] onAgentChunk received, msg found:', !!msg, 'chunk len:', chunk.length)
      if (msg) {
        msg.content += chunk
      }
      conv.updateAt = Date.now()
      persist()
    })

    const STREAM_TIMEOUT = 120_000 // 2 分钟超时

    // 用 Promise.race 包装流式完成信号 + 超时保护
    const streamDone = Promise.race([
      new Promise<void>((resolve) => {
        const unlistenDone = (window.api as any).onAgentDone(() => {
          console.log('[store] onAgentDone received')
          unlistenDone()
          resolve()
        })
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => {
          console.warn('[store] Agent stream timed out after', STREAM_TIMEOUT / 1000, 'seconds')
          reject(new Error('请求超时，请重试'))
        }, STREAM_TIMEOUT)
      )
    ])

    // 构建对话历史（不含空占位的 assistant 消息）
    const history = conv.messages
      .filter((m) => m.id !== assistantMsg.id)
      .map((m) => ({ role: m.role, content: m.content }))
    console.log('[store] history to send:', JSON.stringify(history))

    try {
      console.log('[store] calling sendAgentMessage...')
      const result = await (window.api as any).sendAgentMessage(history)
      console.log('[store] sendAgentMessage result:', JSON.stringify(result))
      if (!result.success) {
        const msg = getAssistantMsg()
        console.log('[store] send failed, setting error on msg found:', !!msg)
        if (msg) {
          msg.content = result.error || '抱歉，请求出错了，请重试'
        }
        return
      }

      // 等待流式完成
      console.log('[store] waiting for streamDone...')
      await streamDone
      console.log('[store] streamDone resolved')
    } catch (err) {
      console.error('[store] sendMessage error:', err)
      const msg = getAssistantMsg()
      if (msg && !msg.content) {
        msg.content = '抱歉，请求出错了，请重试'
      }
    } finally {
      unlistenThinking()
      unlistenThinkingDone()
      unlistenChunk()
      isThinking.value = false
      isStreaming.value = false
      persist()
      console.log('[store] sendMessage finally, isStreaming:', isStreaming.value, 'final conv messages:', JSON.stringify(conv.messages.map(m => ({role:m.role, content:m.content.slice(0,50)}))))
    }
  }

  function cancelMessage(): void {
    ;(window.api as any).cancelAgentMessage()
    isThinking.value = false
  }

  return {
    sidebarVisible,
    sendMessage,
    cancelMessage,
    isStreaming,
    isThinking,
    currentConversationId,
    createConversation,
    deleteConversation,
    batchDeleteConversations,
    updateConversationTitle,
    currentMessages,
    sortedConversations,
    selectConversation
  }
})
