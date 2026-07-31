import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ElectronSafeStorage,
  InMemorySecureStorage,
  type SafeStorageLike
} from '../../../src/main/security/secure-storage'

/** fake safeStorage：记录调用，可配置是否可用 */
function createFakeSafeStorage(): SafeStorageLike & { encryptCalls: number; decryptCalls: number } {
  const state: Record<string, string> = {}
  const fake = {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string): Buffer => {
      fake.encryptCalls++
      const key = 'enc:' + plain
      state[key] = plain
      return Buffer.from(key)
    },
    decryptString: (buffer: Buffer): string => {
      fake.decryptCalls++
      return state[buffer.toString()] ?? ''
    },
    encryptCalls: 0,
    decryptCalls: 0
  }
  return fake
}

describe('InMemorySecureStorage', () => {
  it('SEC-11a: 存入后可取回', () => {
    const s = new InMemorySecureStorage()
    s.set('k1', 'v1')
    expect(s.get('k1')).toBe('v1')
  })

  it('不存在的 key 返回 null', () => {
    const s = new InMemorySecureStorage()
    expect(s.get('nope')).toBeNull()
  })

  it('delete 后返回 null', () => {
    const s = new InMemorySecureStorage()
    s.set('k', 'v')
    s.delete('k')
    expect(s.get('k')).toBeNull()
  })
})

describe('ElectronSafeStorage', () => {
  it('SEC-11b: 加密写入文件，解密还原', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kw-sec-'))
    const fake = createFakeSafeStorage()
    const s = new ElectronSafeStorage(join(dir, 'secrets.bin'), fake)

    s.set('master-key', 'my-secret')
    expect(fake.encryptCalls).toBe(1)
    expect(existsSync(join(dir, 'secrets.bin'))).toBe(true)

    // 重新实例化（模拟重启），从文件解密
    const s2 = new ElectronSafeStorage(join(dir, 'secrets.bin'), fake)
    expect(s2.get('master-key')).toBe('my-secret')
  })

  it('文件损坏时返回 null 不崩溃', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kw-sec-'))
    const fake = createFakeSafeStorage()
    const s = new ElectronSafeStorage(join(dir, 'secrets.bin'), fake)
    s.set('k', 'v')
    // 篡改文件后，用新实例读取（实例有内存缓存，必须重新构造才走文件路径）
    writeFileSync(join(dir, 'secrets.bin'), 'corrupted')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fresh = new ElectronSafeStorage(join(dir, 'secrets.bin'), fake)
    expect(fresh.get('k')).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })
})
