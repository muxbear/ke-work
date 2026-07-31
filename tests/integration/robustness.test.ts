import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../src/main/database/local/LocalDataSource'
import { LocalConversationRepository } from '../../src/main/database/local/LocalConversationRepository'
import { LocalAuthRepository } from '../../src/main/database/local/LocalAuthRepository'
import { hashPassword } from '../../src/main/security/crypto'
import { AuthService } from '../../src/main/services/AuthService'
import { InMemorySecureStorage } from '../../src/main/security/secure-storage'

/**
 * 健壮性测试（测试方案 §7）
 */

describe('大数据量', () => {
  let ds: LocalDataSource
  let repo: LocalConversationRepository

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
    repo = new LocalConversationRepository(ds)
    ds.getDb()
      .prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run('u1', 'wangke', 'h', 1, 1)
  })

  it('10,000 条消息的会话读取正确且快速', async () => {
    const conv = await repo.create({ userId: 'u1', title: '大数据' })
    const batch = ds.getDb().prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    ds.getDb().transaction(() => {
      for (let i = 0; i < 10_000; i++) {
        batch.run(`m${i}`, conv.id, 'user', `消息${i}`, i)
      }
    })()

    const start = Date.now()
    const found = await repo.findById(conv.id)
    const elapsed = Date.now() - start
    expect(found!.messages).toHaveLength(10_000)
    expect(elapsed).toBeLessThan(500)
  })

  it('200 个会话的列表读取', async () => {
    for (let i = 0; i < 200; i++) {
      await repo.create({ userId: 'u1', title: `会话${i}` })
    }
    const start = Date.now()
    const list = await repo.findAll()
    const elapsed = Date.now() - start
    expect(list).toHaveLength(200)
    expect(elapsed).toBeLessThan(500)
  })
})

describe('重复登录/登出循环', () => {
  it('连续 20 次登录/登出无异常', async () => {
    const ds = new LocalDataSource(':memory:')
    const repo = new LocalAuthRepository(ds)
    const hash = await hashPassword('Secret123!')
    await repo.createUser({ username: 'wangke', passwordHash: hash })
    const service = new AuthService({
      repository: repo,
      jwtSecret: 'test-secret-0123456789abcdef',
      secureStorage: new InMemorySecureStorage()
    })

    for (let i = 0; i < 20; i++) {
      const result = await service.loginByPassword('wangke', 'Secret123!')
      expect(result.token).toBeTruthy()
      await service.logout('wangke')
    }
    const user = await repo.findByAccount('wangke')
    expect(user!.tokenHash).toBeNull()
  })
})

describe('并发写入', () => {
  it('20 个并发 addMessage 全部落库', async () => {
    const ds = new LocalDataSource(':memory:')
    const repo = new LocalConversationRepository(ds)
    ds.getDb()
      .prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run('u1', 'wangke', 'h', 1, 1)
    const conv = await repo.create({ userId: 'u1', title: '并发' })

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repo.addMessage(conv.id, { role: 'user', content: `并发消息${i}` })
      )
    )
    const found = await repo.findById(conv.id)
    expect(found!.messages).toHaveLength(20)
  })
})
