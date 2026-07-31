import { describe, expect, it } from 'vitest'
import { signToken, verifyToken } from '../../../src/main/security/token'
import type { WorkMode } from '../../../src/main/mode/work-mode'

const SECRET = 'test-secret-0123456789abcdef'

describe('token', () => {
  it('SEC-06: 签发后可验证，载荷完整', () => {
    const token = signToken({ sub: 'user-1', mode: 'local' as WorkMode }, SECRET, {
      expiresInSec: 3600
    })
    const payload = verifyToken(token, SECRET)
    expect(payload.sub).toBe('user-1')
    expect(payload.mode).toBe('local')
  })

  it('SEC-07: 过期 token 拒绝', () => {
    const token = signToken({ sub: 'user-1', mode: 'local' as WorkMode }, SECRET, {
      expiresInSec: -10
    })
    expect(() => verifyToken(token, SECRET)).toThrow(/expired/i)
  })

  it('SEC-08: 篡改 payload 拒绝', () => {
    const token = signToken({ sub: 'user-1', mode: 'local' as WorkMode }, SECRET, {
      expiresInSec: 3600
    })
    const [header] = token.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'attacker', mode: 'local' })
    ).toString('base64url')
    expect(() => verifyToken(`${header}.${tamperedPayload}.${token.split('.')[2]}`, SECRET)).toThrow(
      /signature/i
    )
  })

  it('错误密钥拒绝', () => {
    const token = signToken({ sub: 'user-1', mode: 'local' as WorkMode }, SECRET, {
      expiresInSec: 3600
    })
    expect(() => verifyToken(token, 'wrong-secret')).toThrow(/signature/i)
  })
})
