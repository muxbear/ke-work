import { beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../../../src/main/security/crypto'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'
import { LocalAuthRepository } from '../../../src/main/database/local/LocalAuthRepository'
import { AuthService, type AuthServiceDeps } from '../../../src/main/services/AuthService'
import { InMemorySecureStorage } from '../../../src/main/security/secure-storage'

const JWT_SECRET = 'test-secret-0123456789abcdef'

async function setup(now: number): Promise<{
  service: AuthService
  repo: LocalAuthRepository
  advance: (ms: number) => void
}> {
  const ds = new LocalDataSource(':memory:')
  const repo = new LocalAuthRepository(ds)
  let current = now
  const deps: AuthServiceDeps = {
    repository: repo,
    jwtSecret: JWT_SECRET,
    secureStorage: new InMemorySecureStorage(),
    now: () => current,
    smsSender: { send: async () => {} },
    wechatClient: { exchangeCode: async () => 'openid-test' }
  }
  const service = new AuthService(deps)
  return { service, repo, advance: (ms) => (current += ms) }
}

describe('AuthService 密码登录', () => {
  let ctx: Awaited<ReturnType<typeof setup>>

  beforeEach(async () => {
    ctx = await setup(1_000_000)
    const hash = await hashPassword('Secret123!')
    await ctx.repo.createUser({ username: 'wangke', passwordHash: hash, mobile: '13800138000' })
  })

  it('AUTH-01: 正确账号密码登录成功，返回 token+user 并写审计', async () => {
    const result = await ctx.service.loginByPassword('wangke', 'Secret123!')
    expect(result.token).toBeTruthy()
    expect(result.refreshToken).toBeTruthy()
    expect(result.user.username).toBe('wangke')
    const log = ctx.repo['ds']
      .getDb()
      .prepare('SELECT * FROM audit_logs WHERE action = ?')
      .all('login')
    expect(log.length).toBeGreaterThan(0)
  })

  it('AUTH-02: 错误密码抛统一错误且失败计数+1', async () => {
    await expect(ctx.service.loginByPassword('wangke', 'WrongPass!')).rejects.toThrow(
      '账号或密码错误'
    )
    const user = await ctx.repo.findByAccount('wangke')
    expect(user!.failedLoginAttempts).toBe(1)
  })

  it('SEC-12: 连续 5 次失败锁定 15 分钟', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(ctx.service.loginByPassword('wangke', 'WrongPass!')).rejects.toThrow()
    }
    await expect(ctx.service.loginByPassword('wangke', 'Secret123!')).rejects.toThrow(/锁定/)
  })

  it('SEC-13: 锁定期间正确密码也拒绝', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(ctx.service.loginByPassword('wangke', 'WrongPass!')).rejects.toThrow()
    }
    await expect(ctx.service.loginByPassword('wangke', 'Secret123!')).rejects.toThrow(/锁定/)
  })

  it('SEC-14: 锁定 15 分钟后解锁，登录成功且计数清零', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(ctx.service.loginByPassword('wangke', 'WrongPass!')).rejects.toThrow()
    }
    ctx.advance(15 * 60 * 1000 + 1)
    const result = await ctx.service.loginByPassword('wangke', 'Secret123!')
    expect(result.token).toBeTruthy()
    const user = await ctx.repo.findByAccount('wangke')
    expect(user!.failedLoginAttempts).toBe(0)
    expect(user!.lockedUntil).toBeNull()
  })

  it('不存在的账号返回统一错误（防用户枚举）', async () => {
    await expect(ctx.service.loginByPassword('ghost', 'whatever1')).rejects.toThrow(
      '账号或密码错误'
    )
  })
})
