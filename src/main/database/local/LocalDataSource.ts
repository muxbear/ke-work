import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { runSqlMigrations, seedMigrationFiles } from './SqlMigrationRunner'

/**
 * 本地 SQLite 数据源：封装连接生命周期与迁移
 * dbPath 可为文件路径或 ':memory:'（测试用）
 * migrationsDir 传入时走磁盘迁移目录（对齐 WorkBuddy .workbuddy-sqlite-migrations）；
 * 不传时回退内置常量迁移（:memory: 测试/未配置场景）
 */
export class LocalDataSource {
  private readonly db: Database.Database
  private readonly dbPath: string
  private readonly migrationsDir: string | undefined

  constructor(dbPath: string, migrationsDir?: string) {
    this.dbPath = dbPath
    this.migrationsDir = migrationsDir
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.runMigrations()
  }

  /** 获取底层连接（Repository 使用） */
  getDb(): Database.Database {
    return this.db
  }

  getDbPath(): string {
    return this.dbPath
  }

  runMigrations(): void {
    if (this.migrationsDir) {
      seedMigrationFiles(this.migrationsDir)
      runSqlMigrations(this.db, this.migrationsDir)
    } else {
      runMigrations(this.db)
    }
  }

  close(): void {
    this.db.close()
  }
}
