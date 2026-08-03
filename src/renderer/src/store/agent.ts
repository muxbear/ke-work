import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
// 渲染层 window.api 类型（preload 的全局声明；node tsconfig 下需此处显式合并）
import type { KeWorkWindowApi } from '../../../preload/index.d'
import { useWorkspaceStore } from './workspace'

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
  /** 消息创建时刻（渲染层本地记录；历史重开无该字段） */
  createdAt?: number
  /** 流式生成耗时 ms（assistant 完成时写入） */
  durationMs?: number
  /** 生成所用模型（发送时快照当前选择） */
  model?: string
}

export interface Conversation {
  id: string
  title: string
  createAt: number
  updateAt: number
  /** 会话绑定的工作空间（创建时确定；主进程权威，渲染层仅展示） */
  workspace?: { id: string; name: string; dir?: string } | null
}

/**
 * 生成一条 ID（会话/消息，会话 id 由渲染层生成，主进程按 userId 合成 thread_id）
 * @returns
 */
function getId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
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

  /** 启动时从数据源加载会话列表（主进程基于 LangGraph checkpointer 派生） */
  async function loadConversations(): Promise<void> {
    const result = await window.api.listConversations()
    if (result.success && result.data) {
      conversations.value = result.data
    }
    loaded.value = true
  }

  /**
   * 创建会话（多轮对话）
   * 会话数据存于 LangGraph checkpoint（首次发消息时生成），此处仅本地登记
   * @returns
   */
  async function createConversation(): Promise<Conversation> {
    const now = Date.now()
    const conv: Conversation = {
      id: getId(),
      title: '新对话',
      createAt: now,
      updateAt: now,
      // 绑定当前选择的工作空间（首次发送时主进程据此绑定会话；已绑定会话不受后续切换影响）
      workspace: useWorkspaceStore().currentWorkspace
    }
    conversations.value.unshift(conv)
    currentConversationId.value = conv.id
    selectedMessages.value = []
    return conv
  }

  /**
   * 进入"新建任务"欢迎态：清空当前会话选择与消息（不创建会话条目；
   * 发送第一条消息时 ensureConversation 才创建，避免点击导航即出现"新对话"条目）
   */
  function resetNewTask(): void {
    currentConversationId.value = null
    selectedMessages.value = []
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

  /** 重命名会话（主进程写自定义标题表；本地同步更新标题） */
  async function renameConversation(id: string, title: string): Promise<void> {
    const result = await window.api.renameConversation(id, title)
    if (!result.success) throw new Error(result.error || '重命名失败')
    const conv = conversations.value.find((c) => c.id === id)
    if (conv) conv.title = title
    if (currentConversation.value?.id === id) {
      currentConversation.value.title = title
    }
  }

  async function deleteConversation(id: string): Promise<void> {
    await window.api.deleteConversation(id)
    const idx = conversations.value.findIndex((c) => c.id === id)
    if (idx !== -1) conversations.value.splice(idx, 1)

    if (currentConversationId.value === id) {
      currentConversationId.value =
        conversations.value.length > 0 ? conversations.value[0].id : null
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

  /** 创建 assistant 占位消息（流式开始前插入，事件按 id 定位填充） */
  function createAssistantPlaceholder(model?: string): Message {
    return { id: getId(), role: 'assistant', content: '', createdAt: Date.now(), model }
  }

  /**
   * 共用流式管道：监听流事件填充 assistantMsg（sendMessage/regenerate 都走这里）
   * @param mode append=正常发送（主进程追加 user 消息）；regenerate=重新生成（主进程截断旧回复，不新增 user 消息）
   */
  async function runStream(
    conv: Conversation,
    assistantMsg: Message,
    content: string,
    opts: { mode: 'append' | 'regenerate' }
  ): Promise<void> {
    const startedAt = Date.now()

    // 按 id 定位（regenerate 截断后 index 语义会漂移；消息被移除时返回 undefined 则回调 no-op）
    const getAssistantMsg = (): Message | undefined => {
      return selectedMessages.value.find((m) => m.id === assistantMsg.id)
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

    try {
      // 主进程从 checkpoint 读取历史 + 追加/截断（会话数据全量由 LangGraph 管理）
      // workspaceId：当前选择的工作空间；主进程对已绑定会话忽略该参数（绑定优先）
      const result = await window.api.sendAgentMessage(
        conv.id,
        content,
        useWorkspaceStore().currentId ?? undefined,
        { regenerate: opts.mode === 'regenerate' }
      )
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
      conv.updateAt = Date.now()
      const msg = getAssistantMsg()
      if (msg) {
        msg.durationMs = Date.now() - startedAt
      }
    }
  }

  /**
   * 发送消息
   * @param content 消息内容
   * @param opts.model 生成所用模型（UI 展示快照）
   */
  async function sendMessage(content: string, opts?: { model?: string }): Promise<void> {
    const conv = await ensureConversation()

    const userMsg: Message = {
      id: getId(),
      role: 'user',
      content: content,
      createdAt: Date.now()
    }

    selectedMessages.value.push(userMsg)

    // 根据用户消息生成会话标题（本地；列表重新加载时由主进程从 checkpoint 派生）
    if (selectedMessages.value.length === 1) {
      conv.title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
    }

    // 创建一条 AI 消息进行占位
    const assistantMsg = createAssistantPlaceholder(opts?.model)
    selectedMessages.value.push(assistantMsg)
    conv.updateAt = Date.now()

    isStreaming.value = true
    isThinking.value = true

    await runStream(conv, assistantMsg, content, { mode: 'append' })
  }

  /**
   * 重新生成：重发最后一条用户提问，生成新的 AI 回复（旧回复从 UI 与 checkpoint 中替换）
   * @param opts.model 生成所用模型
   */
  async function regenerate(opts?: { model?: string }): Promise<void> {
    if (isStreaming.value) return
    const conv = currentConversation.value
    if (!conv) return

    const lastUserIdx = selectedMessages.value.findLastIndex((m) => m.role === 'user')
    if (lastUserIdx === -1) return
    const lastUser = selectedMessages.value[lastUserIdx]

    // UI 立即表现"替换"：截断到最后一条用户消息，移除旧 AI 回复
    selectedMessages.value = selectedMessages.value.slice(0, lastUserIdx + 1)
    const assistantMsg = createAssistantPlaceholder(opts?.model)
    selectedMessages.value.push(assistantMsg)
    conv.updateAt = Date.now()

    isStreaming.value = true
    isThinking.value = true

    await runStream(conv, assistantMsg, lastUser.content, { mode: 'regenerate' })
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
    regenerate,
    cancelMessage,
    stopAllTasks,
    isStreaming,
    isThinking,
    currentConversationId,
    createConversation,
    resetNewTask,
    renameConversation,
    deleteConversation,
    batchDeleteConversations,
    loadConversations,
    selectConversation,
    currentMessages,
    sortedConversations,
    currentConversation
  }
})
