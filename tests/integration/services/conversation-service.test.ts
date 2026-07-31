import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'
import { LocalConversationRepository } from '../../../src/main/database/local/LocalConversationRepository'
import { ConversationService } from '../../../src/main/services/ConversationService'

describe('ConversationService', () => {
  let service: ConversationService
  const userId = 'u1'

  beforeEach(() => {
    const ds = new LocalDataSource(':memory:')
    ds.getDb()
      .prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(userId, 'wangke', 'h', 1, 1)
    service = new ConversationService(new LocalConversationRepository(ds))
  })

  it('create → findById → addMessage → findAll 全链路', async () => {
    const conv = await service.create({ userId, title: '新对话' })
    const msg = await service.addMessage(conv.id, { role: 'user', content: '你好' })
    expect(msg.content).toBe('你好')
    const found = await service.findById(conv.id)
    expect(found!.messages).toHaveLength(1)
    const list = await service.findAll()
    expect(list.map((c) => c.id)).toContain(conv.id)
  })

  it('update 标题 / delete', async () => {
    const conv = await service.create({ userId, title: '旧' })
    const updated = await service.updateTitle(conv.id, '新')
    expect(updated.title).toBe('新')
    await service.delete(conv.id)
    expect(await service.findById(conv.id)).toBeNull()
  })
})
