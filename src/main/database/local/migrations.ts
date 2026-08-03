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
  },
  {
    // 工作空间：为任务指定工作目录（path UNIQUE 保证外部/时间戳目录重复选择幂等）
    version: 4,
    sql: `
CREATE TABLE IF NOT EXISTS workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL UNIQUE,
  source     TEXT NOT NULL DEFAULT 'created',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_created ON workspaces(created_at DESC);
`
  },
  {
    // 会话自定义标题（重命名覆盖；列表读取时优先于此表，未覆盖时用首条消息派生标题）
    version: 5,
    sql: `
CREATE TABLE IF NOT EXISTS conversation_titles (
  user_id         TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, conversation_id)
);
`
  },
  {
    // 工作空间归属用户：NULL = 无主旧数据（首次加载时接管）或机器级共享的默认空间记录
    version: 6,
    sql: `
ALTER TABLE workspaces ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id, created_at DESC);
`
  },
  {
    // 会话→工作空间绑定（业务表显式存储；LangGraph checkpoint metadata 不可靠，仅作历史 fallback）
    version: 7,
    sql: `
CREATE TABLE IF NOT EXISTS conversation_workspaces (
  user_id         TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  workspace_id    TEXT NOT NULL,
  workspace_name  TEXT,
  workspace_dir   TEXT,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, conversation_id)
);
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
