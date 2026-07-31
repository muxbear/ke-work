import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword, sha256 } from '../../../src/main/security/crypto'

describe('crypto', () => {
  it('SEC-01: 哈希不可逆，不含明文', async () => {
    const hash = await hashPassword('Secret123!')
    expect(hash).not.toContain('Secret123!')
    expect(hash.startsWith('$2')).toBe(true)
  })

  it('SEC-02: 同密码两次哈希不同（随机盐）', async () => {
    const a = await hashPassword('Secret123!')
    const b = await hashPassword('Secret123!')
    expect(a).not.toBe(b)
  })

  it('SEC-03: 正确密码验证通过', async () => {
    const hash = await hashPassword('Secret123!')
    expect(await verifyPassword('Secret123!', hash)).toBe(true)
  })

  it('SEC-04: 错误密码验证失败', async () => {
    const hash = await hashPassword('Secret123!')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('SEC-05: 短密码（<6）拒绝', async () => {
    await expect(hashPassword('12345')).rejects.toThrow(/at least 6/i)
  })

  it('sha256 输出 64 位十六进制', () => {
    expect(sha256('abc')).toMatch(/^[0-9a-f]{64}$/)
  })
})
