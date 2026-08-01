import type { Database } from 'better-sqlite3'

/** 版本化迁移：每项为 { version, sql }，按 user_version 增量应用 */
export const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT,
  mobile        TEXT UNIQUE,
  wechat_openid TEXT UNIQUE,
  avatar        TEXT,
  work_mode     TEXT NOT NULL DEFAULT 'local',
  token_hash    TEXT,
  token_expire  INTEGER,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_log_user ON audit_logs(user_id, created_at DESC);
`
  },
  {
    version: 2,
    sql: `
CREATE TABLE IF NOT EXISTS sms_codes (
  mobile     TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`
  },
  {
    // 会话数据迁移至 LangGraph checkpointer（长短期记忆统一走 LangChain 方案），删除废弃表
    version: 3,
    sql: `
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
`
  }
]

/** 应用所有未执行的迁移 */
export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    db.exec(migration.sql)
    db.pragma(`user_version = ${migration.version}`)
  }
}
