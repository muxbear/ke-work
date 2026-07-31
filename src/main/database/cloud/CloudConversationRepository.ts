import type { CloudDataSource } from './CloudDataSource'
import type {
  Conversation,
  ConversationWithMessages,
  IConversationRepository,
  Message,
  MessageRole
} from '../interfaces/IConversationRepository'

/** 云端会话实现（HTTP 适配，字段与本地契约一致） */
export class CloudConversationRepository implements IConversationRepository {
  constructor(private readonly ds: CloudDataSource) {}

  create(input: { userId: string; title: string }): Promise<Conversation> {
    return this.ds.post<Conversation>('/api/conversations', { title: input.title })
  }

  findById(id: string): Promise<ConversationWithMessages | null> {
    return this.ds.get<ConversationWithMessages>(`/api/conversations/${id}`)
  }

  findAll(): Promise<Conversation[]> {
    return this.ds.get<Conversation[]>('/api/conversations')
  }

  update(id: string, data: { title?: string }): Promise<Conversation> {
    return this.ds.patch<Conversation>(`/api/conversations/${id}`, data)
  }

  async delete(id: string): Promise<void> {
    await this.ds.delete(`/api/conversations/${id}`)
  }

  addMessage(
    conversationId: string,
    msg: { role: MessageRole; content: string; reasoning?: string; metadata?: string }
  ): Promise<Message> {
    return this.ds.post<Message>(`/api/conversations/${conversationId}/messages`, msg)
  }
}
