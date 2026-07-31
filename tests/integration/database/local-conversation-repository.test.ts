import { beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'crypto'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'
import { LocalConversationRepository } from '../../../src/main/database/local/LocalConversationRepository'

describe('LocalConversationRepository', () => {
  let ds: LocalDataSource
  let repo: LocalConversationRepository
  const userId = 'u1'

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
    repo = new LocalConversationRepository(ds)
    ds.getDb()
      .prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(userId, 'wangke', 'hash', 1, 1)
  })

  it('create 返回带 id/时间戳的会话', async () => {
    const conv = await repo.create({ userId, title: '新对话' })
    expect(conv.id).toBeTruthy()
    expect(conv.userId).toBe(userId)
    expect(conv.createdAt).toBeGreaterThan(0)
    expect(conv.updatedAt).toBeGreaterThan(0)
  })

  it('findById 返回会话及消息列表', async () => {
    const conv = await repo.create({ userId, title: '对话' })
    await repo.addMessage(conv.id, { role: 'user', content: '你好' })
    const found = await repo.findById(conv.id)
    expect(found).not.toBeNull()
    expect(found!.messages).toHaveLength(1)
    expect(found!.messages[0].content).toBe('你好')
  })

  it('findById 不存在返回 null', async () => {
    expect(await repo.findById('nope')).toBeNull()
  })

  it('LS-06: findAll 按 updated_at 倒序', async () => {
    const a = await repo.create({ userId, title: 'A' })
    const b = await repo.create({ userId, title: 'B' })
    await repo.addMessage(a.id, { role: 'user', content: 'x' }) // 更新 a
    const list = await repo.findAll()
    expect(list.map((c) => c.id)).toEqual([a.id, b.id])
  })

  it('update 修改标题并刷新 updated_at', async () => {
    const conv = await repo.create({ userId, title: '旧标题' })
    const updated = await repo.update(conv.id, { title: '新标题' })
    expect(updated.title).toBe('新标题')
    expect(updated.updatedAt).toBeGreaterThanOrEqual(conv.updatedAt)
  })

  it('LS-05: delete 级联删除消息', async () => {
    const conv = await repo.create({ userId, title: '对话' })
    await repo.addMessage(conv.id, { role: 'user', content: 'hi' })
    await repo.delete(conv.id)
    expect(await repo.findById(conv.id)).toBeNull()
    const left = ds.getDb().prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }
    expect(left.n).toBe(0)
  })

  it('addMessage 追加并保存 reasoning/metadata', async () => {
    const conv = await repo.create({ userId, title: '对话' })
    const msg = await repo.addMessage(conv.id, {
      role: 'assistant',
      content: '回答',
      reasoning: '思考过程',
      metadata: JSON.stringify({ tool: 'x' })
    })
    expect(msg.id).toBeTruthy()
    expect(msg.reasoning).toBe('思考过程')
    const found = await repo.findById(conv.id)
    expect(found!.messages[0].metadata).toBe(JSON.stringify({ tool: 'x' }))
  })

  it('addMessage 到不存在的会话抛错', async () => {
    await expect(repo.addMessage('nope', { role: 'user', content: 'x' })).rejects.toThrow()
  })

  it('会话 id 使用 UUID 格式', async () => {
    const conv = await repo.create({ userId, title: 'x' })
    expect(randomUUID()).toBeTruthy()
    expect(conv.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
