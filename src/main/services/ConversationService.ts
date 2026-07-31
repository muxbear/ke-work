import type {
  Conversation,
  ConversationWithMessages,
  IConversationRepository,
  Message,
  MessageRole
} from '../database/interfaces/IConversationRepository'

/** 会话业务层：透传 Repository（本地/云端 Strategy 由工厂决定） */
export class ConversationService {
  constructor(private readonly repo: IConversationRepository) {}

  create(input: { userId: string; title: string }): Promise<Conversation> {
    return this.repo.create(input)
  }

  findById(id: string): Promise<ConversationWithMessages | null> {
    return this.repo.findById(id)
  }

  findAll(): Promise<Conversation[]> {
    return this.repo.findAll()
  }

  updateTitle(id: string, title: string): Promise<Conversation> {
    return this.repo.update(id, { title })
  }

  delete(id: string): Promise<void> {
    return this.repo.delete(id)
  }

  addMessage(
    conversationId: string,
    msg: { role: MessageRole; content: string; reasoning?: string; metadata?: string }
  ): Promise<Message> {
    return this.repo.addMessage(conversationId, msg)
  }
}
