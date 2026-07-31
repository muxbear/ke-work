export type MessageRole = 'user' | 'assistant' | 'tool' | 'system'

export interface Conversation {
  id: string
  userId: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  reasoning?: string
  metadata?: string
  createdAt: number
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[]
}

/** 会话数据访问接口（本地 SQLite / 云端 API 共用契约） */
export interface IConversationRepository {
  create(input: { userId: string; title: string }): Promise<Conversation>
  findById(id: string): Promise<ConversationWithMessages | null>
  findAll(): Promise<Conversation[]>
  update(id: string, data: { title?: string }): Promise<Conversation>
  delete(id: string): Promise<void>
  addMessage(
    conversationId: string,
    msg: { role: MessageRole; content: string; reasoning?: string; metadata?: string }
  ): Promise<Message>
}
