import type { BaseCheckpointSaver, CheckpointTuple } from '@langchain/langgraph-checkpoint'
import type { Database } from 'better-sqlite3'

/** 会话绑定的工作空间（checkpoint metadata 派生；无绑定为 undefined，归"默认空间"） */
export interface ConversationWorkspace {
  id: string
  name: string
  dir?: string
}

/** 会话摘要（会话列表项） */
export interface ConversationSummary {
  id: string
  title: string
  createAt: number
  updateAt: number
  workspace?: ConversationWorkspace | null
}

/** 会话内消息（供 UI 展示） */
export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  /** 深度思考内容（checkpoint 中 AI 消息 blocks 的 reasoning 块提取） */
  reasoning?: string
}

/**
 * 解析新版 LangChain 消息块 content（checkpoint 中 AI 消息 content 为 blocks 数组）：
 * - `{ type: 'text', text }` 块拼接为正文（markdown）
 * - `{ type: 'reasoning', reasoning }` 块提取为思考内容
 * - tool_use 等其余块忽略
 * string content 原样返回（旧格式/用户消息）
 */
function parseBlocks(content: unknown): { content: string; reasoning?: string } {
  if (typeof content === 'string') return { content }
  if (!Array.isArray(content)) return { content: '' }
  const parts: string[] = []
  const reasoningParts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as { type?: string; text?: unknown; reasoning?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
    else if (b.type === 'reasoning' && typeof b.reasoning === 'string') reasoningParts.push(b.reasoning)
  }
  return {
    content: parts.join(''),
    reasoning: reasoningParts.length ? reasoningParts.join('\n') : undefined
  }
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
  constructor(
    private readonly getCheckpointer: () => BaseCheckpointSaver,
    private readonly getDb?: () => Database
  ) {}

  /** 读取用户全部会话的自定义标题（conversation_titles 表，按用户隔离） */
  private loadCustomTitles(userId: string): Map<string, string> {
    const map = new Map<string, string>()
    if (!this.getDb) return map
    try {
      const rows = this.getDb()
        .prepare('SELECT conversation_id, title FROM conversation_titles WHERE user_id = ?')
        .all(userId) as Array<{ conversation_id: string; title: string }>
      for (const row of rows) map.set(row.conversation_id, row.title)
    } catch (err) {
      console.error('[ConversationStore] loadCustomTitles failed:', err)
    }
    return map
  }

  /** 构造 thread_id（用户隔离单点：入参不信任，统一由 userId 合成） */
  buildThreadId(userId: string, conversationId: string): string {
    return `${THREAD_PREFIX}${userId}:${conversationId}`
  }

  /** 从 checkpoint metadata 宽容读取工作空间绑定（旧会话无该字段返回 null） */
  private readWorkspace(tuple: CheckpointTuple): ConversationWorkspace | null {
    const ws = (tuple.metadata as Record<string, unknown> | undefined)?.workspace as
      | { id?: unknown; name?: unknown; dir?: unknown }
      | undefined
    if (!ws || typeof ws.id !== 'string' || !ws.id) return null
    return {
      id: ws.id,
      name: typeof ws.name === 'string' ? ws.name : '',
      dir: typeof ws.dir === 'string' ? ws.dir : undefined
    }
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

    // 同一会话（thread_id）的多个 checkpoint 版本（LangGraph 图的每步都保存）只保留最新一个，
    // 否则侧栏会出现多个相同 id 的任务项（hover 菜单同时打开、数据重复展示）
    const seenThreads = new Set<string>()
    const uniqueTuples: CheckpointTuple[] = []
    for (const tuple of tuples) {
      const threadId = tuple.config.configurable?.thread_id
      if (typeof threadId !== 'string' || seenThreads.has(threadId)) continue
      seenThreads.add(threadId)
      uniqueTuples.push(tuple)
    }

    // 自定义标题（重命名）优先，未覆盖时用首条消息派生标题
    const customTitles = this.loadCustomTitles(userId)

    return uniqueTuples.map((tuple) => {
      const threadId = tuple.config.configurable?.thread_id as string
      const conversationId = threadId.slice(prefix.length)
      const meta = tuple.metadata as Record<string, unknown> | undefined
      const created = (meta?.created_at as Date | undefined) ?? new Date(0)
      const updated = (meta?.updated_at as Date | undefined) ?? created
      return {
        id: conversationId,
        title: customTitles.get(conversationId) ?? this.deriveTitle(tuple),
        createAt: created.getTime(),
        updateAt: updated.getTime(),
        workspace: this.readWorkspace(tuple)
      }
    })
  }

  /** 重命名会话（自定义标题写 conversation_titles 表，列表读取时优先） */
  async renameConversation(userId: string, conversationId: string, title: string): Promise<void> {
    if (!this.getDb) throw new Error('会话重命名不可用')
    const trimmed = title.trim().slice(0, 50)
    if (!trimmed) throw new Error('标题不能为空')
    this.getDb()
      .prepare(
        'INSERT INTO conversation_titles (user_id, conversation_id, title, updated_at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(user_id, conversation_id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at'
      )
      .run(userId, conversationId, trimmed, Date.now())
  }

  /** 读取会话绑定的工作空间（agent:send 时主进程权威解析：已绑定 > 渲染层当前选择） */
  async getWorkspace(
    userId: string,
    conversationId: string
  ): Promise<ConversationWorkspace | null> {
    const checkpointer = this.getCheckpointer()
    const tuple = await checkpointer.getTuple({
      configurable: { thread_id: this.buildThreadId(userId, conversationId) }
    })
    if (!tuple) return null
    return this.readWorkspace(tuple)
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
        // checkpoint 中 AI 消息 content 为消息块数组（新版架构），解析为 markdown 正文 + 思考
        const parsed = parseBlocks(msg.content)
        return {
          id: msg.id ?? '',
          role,
          content: parsed.content,
          ...(parsed.reasoning ? { reasoning: parsed.reasoning } : {})
        }
      })
      .filter((m): m is ConversationMessage => m !== null)
  }

  /** 删除会话（删 checkpoint + 自定义标题记录；store 长期记忆按用户命名空间，不随会话删除） */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const checkpointer = this.getCheckpointer()
    await checkpointer.deleteThread(this.buildThreadId(userId, conversationId))
    if (this.getDb) {
      this.getDb()
        .prepare('DELETE FROM conversation_titles WHERE user_id = ? AND conversation_id = ?')
        .run(userId, conversationId)
    }
  }
}
