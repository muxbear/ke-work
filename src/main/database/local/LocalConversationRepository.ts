import { randomUUID } from 'crypto'
import type { LocalDataSource } from './LocalDataSource'
import type {
  Conversation,
  ConversationWithMessages,
  IConversationRepository,
  Message,
  MessageRole
} from '../interfaces/IConversationRepository'

interface ConversationRow {
  id: string
  user_id: string
  title: string
  created_at: number
  updated_at: number
}

interface MessageRow {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  reasoning: string | null
  metadata: string | null
  created_at: number
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 本地 SQLite 会话存储实现 */
export class LocalConversationRepository implements IConversationRepository {
  constructor(private readonly ds: LocalDataSource) {}

  async create(input: { userId: string; title: string }): Promise<Conversation> {
    const now = Date.now()
    const id = randomUUID()
    this.ds
      .getDb()
      .prepare(
        'INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, input.userId, input.title, now, now)
    return { id, userId: input.userId, title: input.title, createdAt: now, updatedAt: now }
  }

  async findById(id: string): Promise<ConversationWithMessages | null> {
    const conv = this.ds
      .getDb()
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(id) as ConversationRow | undefined
    if (!conv) return null

    const rows = this.ds
      .getDb()
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at')
      .all(id) as MessageRow[]
    const messages: Message[] = rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      content: r.content,
      reasoning: r.reasoning ?? undefined,
      metadata: r.metadata ?? undefined,
      createdAt: r.created_at
    }))
    return { ...toConversation(conv), messages }
  }

  async findAll(): Promise<Conversation[]> {
    const rows = this.ds
      .getDb()
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
      .all() as ConversationRow[]
    return rows.map(toConversation)
  }

  async update(id: string, data: { title?: string }): Promise<Conversation> {
    const now = Date.now()
    const existing = this.ds
      .getDb()
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(id) as ConversationRow | undefined
    if (!existing) throw new Error(`conversation not found: ${id}`)

    const title = data.title ?? existing.title
    this.ds
      .getDb()
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, now, id)
    return { ...toConversation(existing), title, updatedAt: now }
  }

  async delete(id: string): Promise<void> {
    this.ds.getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  async addMessage(
    conversationId: string,
    msg: { role: MessageRole; content: string; reasoning?: string; metadata?: string }
  ): Promise<Message> {
    const exists = this.ds
      .getDb()
      .prepare('SELECT id FROM conversations WHERE id = ?')
      .get(conversationId)
    if (!exists) throw new Error(`conversation not found: ${conversationId}`)

    const now = Date.now()
    const id = randomUUID()
    this.ds
      .getDb()
      .prepare(
        'INSERT INTO messages (id, conversation_id, role, content, reasoning, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        conversationId,
        msg.role,
        msg.content,
        msg.reasoning ?? null,
        msg.metadata ?? null,
        now
      )
    this.ds
      .getDb()
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, conversationId)
    return {
      id,
      conversationId,
      role: msg.role,
      content: msg.content,
      reasoning: msg.reasoning,
      metadata: msg.metadata,
      createdAt: now
    }
  }
}
