import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'
import { LocalAuthRepository } from '../../../src/main/database/local/LocalAuthRepository'

describe('LocalAuthRepository', () => {
  let ds: LocalDataSource
  let repo: LocalAuthRepository

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
    repo = new LocalAuthRepository(ds)
  })

  it('createUser 后可按账号/手机号/微信查找', async () => {
    const user = await repo.createUser({
      username: 'wangke',
      passwordHash: 'hash',
      mobile: '13800138000',
      wechatOpenid: 'openid-1'
    })
    expect(user.id).toBeTruthy()
    expect((await repo.findByAccount('wangke'))?.id).toBe(user.id)
    expect((await repo.findByAccount('13800138000'))?.id).toBe(user.id)
    expect((await repo.findByMobile('13800138000'))?.id).toBe(user.id)
    expect((await repo.findByWechatOpenid('openid-1'))?.id).toBe(user.id)
  })

  it('不存在的账号返回 null', async () => {
    expect(await repo.findByAccount('nobody')).toBeNull()
  })

  it('重复用户名创建抛错', async () => {
    await repo.createUser({ username: 'wangke', passwordHash: 'h' })
    await expect(repo.createUser({ username: 'wangke', passwordHash: 'h' })).rejects.toThrow(
      /UNIQUE/i
    )
  })

  it('recordLoginFailure 递增计数并在达到上限时锁定', async () => {
    const user = await repo.createUser({ username: 'wangke', passwordHash: 'h' })
    for (let i = 1; i <= 4; i++) {
      const r = await repo.recordLoginFailure(user.id, 5, 900_000, 1_000_000)
      expect(r.attempts).toBe(i)
      expect(r.lockedUntil).toBeNull()
    }
    const r5 = await repo.recordLoginFailure(user.id, 5, 900_000, 1_000_000)
    expect(r5.attempts).toBe(0)
    expect(r5.lockedUntil).toBe(1_900_000)
  })

  it('resetLoginFailures 清零计数并解除锁定', async () => {
    const user = await repo.createUser({ username: 'wangke', passwordHash: 'h' })
    await repo.recordLoginFailure(user.id, 5, 900_000, 1_000_000)
    await repo.resetLoginFailures(user.id)
    const reloaded = await repo.findByAccount('wangke')
    expect(reloaded!.failedLoginAttempts).toBe(0)
    expect(reloaded!.lockedUntil).toBeNull()
  })

  it('updateToken 更新 token_hash 与过期时间', async () => {
    const user = await repo.createUser({ username: 'wangke', passwordHash: 'h' })
    await repo.updateToken(user.id, 'hash-abc', 1234567890)
    const reloaded = await repo.findByAccount('wangke')
    expect(reloaded!.tokenHash).toBe('hash-abc')
    expect(reloaded!.tokenExpire).toBe(1234567890)
    await repo.updateToken(user.id, null, null)
    expect((await repo.findByAccount('wangke'))!.tokenHash).toBeNull()
  })

  it('saveSmsCode / findSmsCode / markSmsCodeUsed 生命周期', async () => {
    await repo.saveSmsCode('13800138000', 'code-hash', 9999)
    const code = await repo.findSmsCode('13800138000')
    expect(code!.codeHash).toBe('code-hash')
    expect(code!.used).toBe(false)
    await repo.markSmsCodeUsed('13800138000')
    expect((await repo.findSmsCode('13800138000'))!.used).toBe(true)
  })

  it('不存在的验证码返回 null', async () => {
    expect(await repo.findSmsCode('13800138000')).toBeNull()
  })

  it('addAuditLog 写入审计日志', async () => {
    const user = await repo.createUser({ username: 'wangke', passwordHash: 'h' })
    await repo.addAuditLog({
      userId: user.id,
      action: 'login',
      detail: '{"mode":"local"}',
      ipAddress: '127.0.0.1'
    })
    const row = ds.getDb().prepare('SELECT * FROM audit_logs').get() as {
      action: string
      user_id: string
    }
    expect(row.action).toBe('login')
    expect(row.user_id).toBe(user.id)
  })
})
