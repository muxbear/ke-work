import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SessionService } from '../../../src/main/services/SessionService'

describe('SessionService', () => {
  it('未登录时 requireUserId 抛错', () => {
    const session = new SessionService()
    expect(() => session.requireUserId()).toThrow(/未登录/)
    expect(session.getCurrentUserId()).toBeNull()
  })

  it('setCurrentUser 后 requireUserId 返回用户 id', () => {
    const session = new SessionService()
    session.setCurrentUser('u1')
    expect(session.getCurrentUserId()).toBe('u1')
    expect(session.requireUserId()).toBe('u1')
  })

  it('clear 清除当前用户', () => {
    const session = new SessionService()
    session.setCurrentUser('u1')
    session.clear()
    expect(session.getCurrentUserId()).toBeNull()
  })

  it('持久化：模拟重启后恢复当前用户', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kw-session-'))
    const s1 = new SessionService(dir)
    s1.setCurrentUser('u1')
    // 重新实例化（模拟应用重启）
    const s2 = new SessionService(dir)
    expect(s2.getCurrentUserId()).toBe('u1')
    expect(s2.requireUserId()).toBe('u1')
  })

  it('持久化：clear 后重启恢复为空', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kw-session-'))
    const s1 = new SessionService(dir)
    s1.setCurrentUser('u1')
    s1.clear()
    const s2 = new SessionService(dir)
    expect(s2.getCurrentUserId()).toBeNull()
  })
})
