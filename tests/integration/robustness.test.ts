import { describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../src/main/database/local/LocalDataSource'
import { LocalAuthRepository } from '../../src/main/database/local/LocalAuthRepository'
import { hashPassword } from '../../src/main/security/crypto'
import { AuthService } from '../../src/main/services/AuthService'
import { InMemorySecureStorage } from '../../src/main/security/secure-storage'

/**
 * 健壮性测试（测试方案 §7）
 * 注：会话/消息大数据量与并发用例已随 conversations/messages 表迁移至 LangGraph checkpointer
 * （由 ConversationStore + checkpointer 单测覆盖）
 */

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
