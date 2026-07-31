import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

/**
 * 本地 SQLite 数据源：封装连接生命周期与迁移
 * dbPath 可为文件路径或 ':memory:'（测试用）
 */
export class LocalDataSource {
  private readonly db: Database.Database
  private readonly dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    runMigrations(this.db)
  }

  /** 获取底层连接（Repository 使用） */
  getDb(): Database.Database {
    return this.db
  }

  getDbPath(): string {
    return this.dbPath
  }

  runMigrations(): void {
    runMigrations(this.db)
  }

  close(): void {
    this.db.close()
  }
}
