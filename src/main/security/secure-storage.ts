import { existsSync, readFileSync, writeFileSync } from 'fs'

/** 系统级安全存储接口（Windows DPAPI / macOS Keychain 的抽象） */
export interface ISecureStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  delete(key: string): void
}

/** Electron safeStorage 的最小类型（便于测试注入 fake） */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

/**
 * 基于 Electron safeStorage 的实现
 * 加密内容序列化为 JSON 持久化到文件（跨重启保持）
 */
export class ElectronSafeStorage implements ISecureStorage {
  private cache: Record<string, string> | null = null

  constructor(
    private readonly filePath: string,
    private readonly safeStorage: SafeStorageLike
  ) {}

  private load(): Record<string, string> {
    if (this.cache) return this.cache
    this.cache = {}
    if (existsSync(this.filePath)) {
      try {
        const records = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Array<{
          k: string
          v: string
        }>
        if (!Array.isArray(records)) throw new Error('invalid format')
        for (const record of records) {
          const buf = Buffer.from(record.v, 'base64')
          this.cache[record.k] = this.safeStorage.decryptString(buf)
        }
      } catch (err) {
        console.warn('[secure-storage] failed to load secrets file:', err)
        this.cache = {}
      }
    }
    return this.cache
  }

  private persist(): void {
    const records = Object.entries(this.load()).map(([k, v]) => ({
      k,
      v: this.safeStorage.encryptString(v).toString('base64')
    }))
    writeFileSync(this.filePath, JSON.stringify(records), 'utf-8')
  }

  get(key: string): string | null {
    return this.load()[key] ?? null
  }

  set(key: string, value: string): void {
    this.load()[key] = value
    this.persist()
  }

  delete(key: string): void {
    if (key in this.load()) {
      delete this.load()[key]
      this.persist()
    }
  }
}

/** 内存实现（测试用） */
export class InMemorySecureStorage implements ISecureStorage {
  private store = new Map<string, string>()

  get(key: string): string | null {
    return this.store.get(key) ?? null
  }

  set(key: string, value: string): void {
    this.store.set(key, value)
  }

  delete(key: string): void {
    this.store.delete(key)
  }
}
