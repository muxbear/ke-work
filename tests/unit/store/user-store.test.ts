import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '../../../src/renderer/src/store/user'

/** 内存 localStorage（node 环境无 localStorage） */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value)
  }
}

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('setLogin 持久化 token 与用户信息', () => {
    const store = useUserStore()
    store.setLogin({ token: 't1', refreshToken: 'r1', user: { id: 'u1', username: 'wangke' } })
    expect(store.isLoggedIn).toBe(true)
    expect(localStorage.getItem('user_token')).toBe('t1')
    expect(localStorage.getItem('user_refresh_token')).toBe('r1')
  })

  it('logout 清除登录态', () => {
    const store = useUserStore()
    store.setLogin({ token: 't1', refreshToken: 'r1', user: { id: 'u1', username: 'wangke' } })
    store.logout()
    expect(store.isLoggedIn).toBe(false)
    expect(localStorage.getItem('user_token')).toBeNull()
  })

  it('从 localStorage 恢复登录态', () => {
    localStorage.setItem('user_token', 't1')
    localStorage.setItem('user_info', JSON.stringify({ id: 'u1', username: 'wangke' }))
    const store = useUserStore()
    expect(store.isLoggedIn).toBe(true)
    expect(store.userInfo?.username).toBe('wangke')
  })
})
