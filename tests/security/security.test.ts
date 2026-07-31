import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDataSource } from '../../src/main/database/local/LocalDataSource'
import { LocalAuthRepository } from '../../src/main/database/local/LocalAuthRepository'
import { LocalConversationRepository } from '../../src/main/database/local/LocalConversationRepository'
import { LocalConfigRepository } from '../../src/main/database/local/LocalConfigRepository'
import { hashPassword, sha256 } from '../../src/main/security/crypto'

/**
 * 安全专项（测试方案 §6 OWASP 映射）
 */

describe('SQL 注入防护', () => {
  let ds: LocalDataSource
  let authRepo: LocalAuthRepository
  let convRepo: LocalConversationRepository
  let configRepo: LocalConfigRepository

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
    authRepo = new LocalAuthRepository(ds)
    convRepo = new LocalConversationRepository(ds)
    configRepo = new LocalConfigRepository(ds)
    ds.getDb()
      .prepare(
        'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run('u1', 'wangke', 'h', 1, 1)
  })

  it('注入式账号：`\'; DROP TABLE users;--` 按字面值处理，不执行注入', async () => {
    const injection = "'; DROP TABLE users;--"
    // 按账号查找：注入串找不到用户，且 users 表未被删除
    expect(await authRepo.findByAccount(injection)).toBeNull()
    const tables = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get()
    expect(tables).toBeTruthy()
  })

  it('注入式会话标题：存储后按字面值读取', async () => {
    const injection = "x' OR '1'='1"
    const conv = await convRepo.create({ userId: 'u1', title: injection })
    const found = await convRepo.findById(conv.id)
    expect(found!.title).toBe(injection)
  })

  it('注入式配置键：读写均按字面值', async () => {
    const injection = "k' OR '1'='1"
    await configRepo.set(injection, 'v')
    expect(await configRepo.get(injection)).toBe('v')
  })
})

describe('密码与哈希强度', () => {
  it('bcrypt 哈希含随机盐且轮数≥10', async () => {
    const hash = await hashPassword('Secret123!')
    expect(hash).toMatch(/^\$2[aby]\$10\$/)
  })

  it('暴力枚举候选密码不命中（bcrypt 慢哈希为防暴力核心，单次 compare 数百毫秒级）', async () => {
    const hash = await hashPassword('CorrectHorse1!')
    const { verifyPassword } = await import('../../src/main/security/crypto')
    // 20 次枚举（bcryptjs 纯 JS cost=10 单次 ~50ms，穷举 8 位密码空间在现实中不可行）
    for (let i = 0; i < 20; i++) {
      const candidate = `Guess${i}!!`
      expect(await verifyPassword(candidate, hash)).toBe(false)
    }
  })
})

describe('token 哈希存储', () => {
  it('sha256 摘要与 bcrypt 哈希不可逆比较（无明文泄漏）', () => {
    const token = 'jwt-token-value-123'
    const digest = sha256(token)
    expect(digest).toHaveLength(64)
    expect(digest).not.toContain('jwt-token')
  })
})

describe('审计日志完整性', () => {
  it('AUTH-12: 登录失败/成功均留痕', async () => {
    const ds2 = new LocalDataSource(':memory:')
    const repo2 = new LocalAuthRepository(ds2)
    await repo2.addAuditLog({ action: 'login_failed', detail: '{"locked":false}' })
    await repo2.addAuditLog({ action: 'login' })
    const rows = ds2
      .getDb()
      .prepare('SELECT action FROM audit_logs ORDER BY created_at')
      .all() as Array<{ action: string }>
    expect(rows.map((r) => r.action)).toEqual(['login_failed', 'login'])
  })
})
