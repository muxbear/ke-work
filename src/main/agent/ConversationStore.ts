import type { BaseCheckpointSaver, CheckpointTuple } from '@langchain/langgraph-checkpoint'

/** 会话摘要（会话列表项） */
export interface ConversationSummary {
  id: string
  title: string
  createAt: number
  updateAt: number
}

/** 会话内消息（供 UI 展示） */
export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
}

const THREAD_PREFIX = 'u:'
const TITLE_MAX_LEN = 30
const DEFAULT_TITLE = '新对话'

/**
 * 基于 LangGraph checkpointer 的会话读写服务
 *
 * 会话数据全部存于 LangGraph 短期记忆（checkpointer）：
 * - thread_id = `u:{userId}:{conversationId}`（userId 前缀实现用户隔离）
 * - 会话列表 = checkpointer.list() 全量扫描 + 前缀过滤
 * - 消息历史 = checkpoint state 的 messages 通道（channel_values.messages）
 * - 删除会话 = checkpointer.deleteThread()
 */
export class ConversationStore {
  constructor(private readonly getCheckpointer: () => BaseCheckpointSaver) {}

  /** 构造 thread_id（用户隔离单点：入参不信任，统一由 userId 合成） */
  buildThreadId(userId: string, conversationId: string): string {
    return `${THREAD_PREFIX}${userId}:${conversationId}`
  }

  /** 从 checkpoint 派生会话标题：首条 user 消息截断（与原 DB 逻辑一致） */
  private deriveTitle(tuple: CheckpointTuple): string {
    const messages = tuple.checkpoint.channel_values?.messages as
      | Array<{ role?: string; content?: unknown }>
      | undefined
    const firstUser = messages?.find((m) => m.role === 'user' || m.role === 'human')
    const content = typeof firstUser?.content === 'string' ? firstUser.content.trim() : ''
    if (!content) return DEFAULT_TITLE
    return content.length > TITLE_MAX_LEN ? `${content.slice(0, TITLE_MAX_LEN)}...` : content
  }

  /** 列出某用户的全部会话（按更新时间降序） */
  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const checkpointer = this.getCheckpointer()
    const prefix = `${THREAD_PREFIX}${userId}:`

    const tuples: CheckpointTuple[] = []
    for await (const tuple of checkpointer.list({})) {
      const threadId = tuple.config.configurable?.thread_id
      if (typeof threadId === 'string' && threadId.startsWith(prefix)) {
        tuples.push(tuple)
      }
    }

    tuples.sort((a, b) => {
      const at = (a.metadata as Record<string, unknown> | undefined)?.updated_at as Date | undefined
      const bt = (b.metadata as Record<string, unknown> | undefined)?.updated_at as Date | undefined
      return (bt ?? new Date(0)).getTime() - (at ?? new Date(0)).getTime()
    })

    return tuples.map((tuple) => {
      const threadId = tuple.config.configurable?.thread_id as string
      const meta = tuple.metadata as Record<string, unknown> | undefined
      const created = (meta?.created_at as Date | undefined) ?? new Date(0)
      const updated = (meta?.updated_at as Date | undefined) ?? created
      return {
        id: threadId.slice(prefix.length),
        title: this.deriveTitle(tuple),
        createAt: created.getTime(),
        updateAt: updated.getTime()
      }
    })
  }

  /** 读取会话内消息（越权校验：thread_id 由 userId 合成） */
  async getMessages(userId: string, conversationId: string): Promise<ConversationMessage[]> {
    const checkpointer = this.getCheckpointer()
    const threadId = this.buildThreadId(userId, conversationId)
    const tuple = await checkpointer.getTuple({ configurable: { thread_id: threadId } })
    if (!tuple) return []

    const messages = tuple.checkpoint.channel_values?.messages
    if (!Array.isArray(messages)) return []

    return messages
      .map((msg: { id?: string; getType?: () => string; role?: string; content?: unknown }) => {
        const rawRole = typeof msg.getType === 'function' ? msg.getType() : msg.role
        let role: ConversationMessage['role']
        switch (rawRole) {
          case 'human':
            role = 'user'
            break
          case 'ai':
            role = 'assistant'
            break
          case 'tool':
            role = 'tool'
            break
          case 'system':
            role = 'system'
            break
          default:
            return null
        }
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        return { id: msg.id ?? '', role, content }
      })
      .filter((m): m is ConversationMessage => m !== null)
  }

  /** 删除会话（仅删 checkpoint；store 长期记忆按用户命名空间，不随会话删除） */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const checkpointer = this.getCheckpointer()
    await checkpointer.deleteThread(this.buildThreadId(userId, conversationId))
  }
}
