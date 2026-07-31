import type { LocalDataSource } from './LocalDataSource'
import type { IConfigRepository } from '../interfaces/IConfigRepository'

/** 本地 SQLite 配置存储实现 */
export class LocalConfigRepository implements IConfigRepository {
  constructor(private readonly ds: LocalDataSource) {}

  async get(key: string): Promise<string | null> {
    const row = this.ds
      .getDb()
      .prepare('SELECT value FROM config WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  async set(key: string, value: string): Promise<void> {
    const now = Date.now()
    this.ds
      .getDb()
      .prepare(
        'INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      )
      .run(key, value, now)
  }

  async delete(key: string): Promise<void> {
    this.ds.getDb().prepare('DELETE FROM config WHERE key = ?').run(key)
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = this.ds.getDb().prepare('SELECT key, value FROM config').all() as Array<{
      key: string
      value: string
    }>
    const result: Record<string, string> = {}
    for (const row of rows) result[row.key] = row.value
    return result
  }
}
