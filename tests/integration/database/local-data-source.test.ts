import { describe, expect, it, beforeEach } from 'vitest'
import { LocalDataSource } from '../../../src/main/database/local/LocalDataSource'

describe('LocalDataSource', () => {
  let ds: LocalDataSource

  beforeEach(() => {
    ds = new LocalDataSource(':memory:')
  })

  it('LS-01: 迁移创建全部表', () => {
    const tables = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).toEqual(
      expect.arrayContaining(['users', 'conversations', 'messages', 'config', 'audit_logs'])
    )
  })

  it('LS-02: 迁移幂等，重复执行不报错', () => {
    expect(() => ds.runMigrations()).not.toThrow()
    const tables = ds
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
    expect(tables.length).toBeGreaterThanOrEqual(5)
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

  it('LS-04: messages.role CHECK 约束', () => {
    const db = ds.getDb()
    db.prepare(
      'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('u1', 'wangke', 'hash1', 1, 1)
    db.prepare(
      'INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('c1', 'u1', '对话', 1, 1)
    expect(() =>
      db
        .prepare(
          'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run('m1', 'c1', 'robot', 'hi', 1)
    ).toThrow(/CHECK/i)
  })

  it('LS-05: 删除会话级联删除消息', () => {
    const db = ds.getDb()
    db.prepare(
      'INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('u1', 'wangke', 'hash1', 1, 1)
    db.prepare(
      'INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('c1', 'u1', '对话', 1, 1)
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run('m1', 'c1', 'user', 'hi', 1)
    db.prepare('DELETE FROM conversations WHERE id = ?').run('c1')
    const left = db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }
    expect(left.n).toBe(0)
  })

  it('LS-09: better-sqlite3 同步写不产生 database is locked', () => {
    const db = ds.getDb()
    for (let i = 0; i < 100; i++) {
      db.prepare('INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)').run(`k${i}`, 'v', i)
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM config').get()).toEqual({ n: 100 })
  })
})
