import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'

describe('LocalDataSource', () => {
  let ds: LocalDataSource

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
  })

  it('LS-01: 迁移创建全部表（会话数据已迁移 LangGraph，无 conversations/messages）', () => {
    const tables = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).toEqual(
      expect.arrayContaining(['users', 'config', 'audit_logs', 'sms_codes'])
    )
    expect(tables).not.toContain('conversations')
    expect(tables).not.toContain('messages')
  })

  it('LS-02: 迁移幂等，重复执行不报错', () => {
    expect(() => ds.runMigrations()).not.toThrow()
    const tables = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
    expect(tables.length).toBeGreaterThanOrEqual(4)
  })

  it('LS-03: users.username 唯一约束', () => {
    const db = ds.getDb()
    db.prepare(
      'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('u1', 'wangke', 'hash1', 1, 1)
    expect(() =>
      db
        .prepare(
          'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run('u2', 'wangke', 'hash2', 1, 1)
    ).toThrow(/UNIQUE/i)
  })

  it('LS-04: v3 迁移删除废弃的 conversations/messages 表（老库兼容）', () => {
    // 模拟 v2 老库：已建 conversations/messages 且 user_version=2
    const dir = mkdtempSync(join(tmpdir(), 'kw-ls-mig-'))
    const path = join(dir, 'old.db')

    const oldDb = new Database(path)
    oldDb.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE);
      CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL);
    `)
    oldDb.pragma('user_version = 2')
    oldDb.close()

    // 打开老库触发 v3 迁移
    const upgraded = new LocalDataSource(path)
    const tables = upgraded
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).not.toContain('conversations')
    expect(tables).not.toContain('messages')
    upgraded.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('LS-10: 迁移 v2 创建 sms_codes 表', () => {
    const tables = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).toContain('sms_codes')
  })

  it('LS-09: better-sqlite3 同步写不产生 database is locked', () => {
    const db = ds.getDb()
    for (let i = 0; i < 100; i++) {
      db.prepare('INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)').run(`k${i}`, 'v', i)
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM config').get()).toEqual({ n: 100 })
  })
})
