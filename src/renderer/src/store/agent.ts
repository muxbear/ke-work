import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
// 渲染层 window.api 类型（preload 的全局声明；node tsconfig 下需此处显式合并）
import type { KeWorkWindowApi } from '../../../preload/index.d'

declare global {
  interface Window {
    api: KeWorkWindowApi
  }
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  reasoning?: string
}

export interface Conversation {
  id: string
  title: string
  createAt: number
  updateAt: number
}

interface ApiConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/**
 * 生成一条 ID
 * @returns
 */
function getId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

function toConversation(c: ApiConversation): Conversation {
  return { id: c.id, title: c.title, createAt: c.createdAt, updateAt: c.updatedAt }
}

/**
 * 智能体状态管理（使用组合式 API 写法）
 * 对话数据经 IPC 落库（本地 SQLite / 云端 API，由工作模式决定）
 */
export const useAgentStore = defineStore('agent', () => {
  // ====== 状态(State) ======
  const sidebarVisible = ref<boolean>(true)

  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)
  const selectedMessages = ref<Message[]>([])
  const isStreaming = ref<boolean>(false)
  const isThinking = ref<boolean>(false)
  const loaded = ref<boolean>(false)

  // ====== 计算属性(Getters) ======
  const currentConversation = computed(
    () => conversations.value.find((cov) => cov.id == currentConversationId.value) ?? null
  )

  const currentMessages = computed(() => selectedMessages.value)

  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => b.updateAt - a.updateAt)
  )

  // ====== 方法(Actions) ======

  /** 启动时从数据源加载会话列表 */
  async function loadConversations(): Promise<void> {
    const result = await window.api.listConversations()
    if (result.success && result.data) {
      conversations.value = result.data.map(toConversation)
    }
    loaded.value = true
  }

  /**
   * 创建会话（多轮对话）
   * @returns
   */
  async function createConversation(): Promise<Conversation> {
    const result = await window.api.createConversation('新对话')
    if (!result.success || !result.data) throw new Error(result.error ?? '创建会话失败')
    const conv = toConversation(result.data)
    conversations.value.unshift(conv)
    currentConversationId.value = conv.id
    selectedMessages.value = []
    return conv
  }

  /**
   * 获取本次对话（多轮对话）
   * @returns
   */
  async function ensureConversation(): Promise<Conversation> {
    if (!currentConversationId.value || !currentConversation.value) {
      return createConversation()
    }
    return currentConversation.value
  }

  /** 选中一个会话（异步加载消息） */
  async function selectConversation(id: string): Promise<void> {
    currentConversationId.value = id
    selectedMessages.value = []
    const result = await window.api.getConversation(id)
    if (result.success && result.data) {
      selectedMessages.value = (result.data as { messages: Message[] }).messages
    }
  }

  async function deleteConversation(id: string): Promise<void> {
    await window.api.deleteConversation(id)
    const idx = conversations.value.findIndex((c) => c.id === id)
    if (idx !== -1) conversations.value.splice(idx, 1)

    if (currentConversationId.value === id) {
      currentConversationId.value = conversations.value.length > 0 ? conversations.value[0].id : null
      selectedMessages.value = []
      if (currentConversationId.value) await selectConversation(currentConversationId.value)
    }
  }

  /** 批量删除会话 */
  async function batchDeleteConversations(ids: string): Promise<void> {
    const idList = ids.split(',')
    await Promise.all(idList.map((id) => window.api.deleteConversation(id)))
    conversations.value = conversations.value.filter((c) => !idList.includes(c.id))
    if (currentConversationId.value && idList.includes(currentConversationId.value)) {
      currentConversationId.value =
        conversations.value.length > 0 ? conversations.value[0].id : null
      selectedMessages.value = []
      if (currentConversationId.value) await selectConversation(currentConversationId.value)
    }
  }

  /**
   * 更新会话标题
   * @param id 会话标识
   * @param title 会话标题
   */
  async function updateConversationTitle(id: string, title: string): Promise<void> {
    await window.api.updateConversationTitle(id, title)
    const conv = conversations.value.find((c) => c.id === id)
    if (conv) conv.title = title
  }

  async function sendMessage(content: string): Promise<void> {
    console.log('[store] sendMessage called with:', content)
    const conv = await ensureConversation()

    const userMsg: Message = {
      id: getId(),
      role: 'user',
      content: content
    }

    selectedMessages.value.push(userMsg)
    // 用户消息落库
    await window.api.addConversationMessage(conv.id, { role: 'user', content })

    // 根据用户消息生成会话标题
    if (selectedMessages.value.length === 1) {
      const title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
      await updateConversationTitle(conv.id, title)
      conv.title = title
    }

    // 创建一条 AI 消息进行占位
    const assistantMsg: Message = {
      id: getId(),
      role: 'assistant',
      content: ''
    }

    selectedMessages.value.push(assistantMsg)
    conv.updateAt = Date.now()

    isStreaming.value = true
    isThinking.value = true

    const getAssistantMsg = (): Message | undefined => {
      const last = selectedMessages.value[selectedMessages.value.length - 1]
      return last && last.role === 'assistant' ? last : undefined
    }

    // 深度思考（reasoning）流
    const unlistenThinking = window.api.onAgentThinking((chunk: string) => {
      const msg = getAssistantMsg()
      if (msg) {
        msg.reasoning = (msg.reasoning || '') + chunk
      }
    })

    const unlistenThinkingDone = window.api.onAgentThinkingDone(() => {
      isThinking.value = false
    })

    const unlistenChunk = window.api.onAgentChunk((chunk: string) => {
      const msg = getAssistantMsg()
      if (msg) {
        msg.content += chunk
      }
    })

    const STREAM_TIMEOUT = 120_000 // 2 分钟超时

    // 用 Promise.race 包装流式完成信号 + 超时保护
    const streamDone = Promise.race([
      new Promise<void>((resolve) => {
        const unlistenDone = window.api.onAgentDone(() => {
          unlistenDone()
          resolve()
        })
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => {
          reject(new Error('请求超时，请重试'))
        }, STREAM_TIMEOUT)
      )
    ])

    // 构建对话历史（不含空占位的 assistant 消息）
    const history = selectedMessages.value
      .filter((m) => m.id !== assistantMsg.id && m.content)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const result = await window.api.sendAgentMessage(history)
      if (!result.success) {
        const msg = getAssistantMsg()
        if (msg) {
          msg.content = result.error || '抱歉，请求出错了，请重试'
        }
      } else {
        await streamDone
      }
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

      // 落库 assistant 消息（含 reasoning）
      const finalMsg = getAssistantMsg()
      if (finalMsg) {
        await window.api.addConversationMessage(conv.id, {
          role: 'assistant',
          content: finalMsg.content,
          reasoning: finalMsg.reasoning
        })
      }
      conv.updateAt = Date.now()
    }
  }

  function cancelMessage(): void {
    window.api.cancelAgentMessage()
    isThinking.value = false
  }

  /**
   * 停止所有正在执行中的任务（登出/切换场景）
   * 主进程的任务停止由 auth:logout 联动 abort 全部流，此处仅重置渲染层流状态
   */
  function stopAllTasks(): void {
    isStreaming.value = false
    isThinking.value = false
  }

  return {
    sidebarVisible,
    loaded,
    sendMessage,
    cancelMessage,
    stopAllTasks,
    isStreaming,
    isThinking,
    currentConversationId,
    createConversation,
    deleteConversation,
    batchDeleteConversations,
    updateConversationTitle,
    loadConversations,
    selectConversation,
    currentMessages,
    sortedConversations,
    currentConversation
  }
})
