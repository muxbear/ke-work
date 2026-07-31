import { describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../src/main/database/local/LocalDataSource'
import { LocalConversationRepository } from '../../src/main/database/local/LocalConversationRepository'

/**
 * Bug 复现：preload 的 createConversation 传 userId=''，
 * 真实迁移含外键约束（foreign_keys=ON）→ 应触发 FOREIGN KEY 失败
 */
describe('BUG 复现：userId 为空创建会话', () => {
  it('真实迁移环境（含外键）下 userId="" 创建会话失败', async () => {
    const ds = new LocalDataSource(':memory:')
    const repo = new LocalConversationRepository(ds)
    // preload 实际传递的是 ''（见 src/preload/index.ts:61）
    await expect(repo.create({ userId: '', title: '新对话' })).rejects.toThrow(/FOREIGN KEY/i)
  })

  it('存在合法用户时可正常创建', async () => {
    const ds = new LocalDataSource(':memory:')
    ds.getDb()
      .prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run('u1', 'wangke', 'h', 1, 1)
    const repo = new LocalConversationRepository(ds)
    const conv = await repo.create({ userId: 'u1', title: '新对话' })
    expect(conv.userId).toBe('u1')
  })
})
