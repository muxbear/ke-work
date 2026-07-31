/**
 * E2E 测试数据预置脚本
 * 在指定 KE_WORK_HOME 下创建 ke-work.db 并插入测试用户
 * 用法: node tests/e2e/setup-test-data.mjs <dataHome>
 */
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { mkdirSync } from 'fs'
import { join } from 'path'

const dataHome = process.argv[2]
if (!dataHome) {
  console.error('usage: node tests/e2e/setup-test-data.mjs <dataHome>')
  process.exit(1)
}

mkdirSync(join(dataHome, 'config'), { recursive: true })
mkdirSync(join(dataHome, 'conversations'), { recursive: true })
mkdirSync(join(dataHome, 'logs'), { recursive: true })
mkdirSync(join(dataHome, 'cache'), { recursive: true })
mkdirSync(join(dataHome, 'workspace'), { recursive: true })

const db = new Database(join(dataHome, 'ke-work.db'))
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT,
  mobile TEXT UNIQUE,
  wechat_openid TEXT UNIQUE,
  avatar TEXT,
  work_mode TEXT NOT NULL DEFAULT 'local',
  token_hash TEXT,
  token_expire INTEGER,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '新对话',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT NOT NULL DEFAULT '',
  reasoning TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sms_codes (
  mobile TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`)

const hash = bcrypt.hashSync('Secret123!', 10)
const now = Date.now()
db.prepare(
  'INSERT OR REPLACE INTO users (id, username, password_hash, mobile, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
).run('e2e-user', 'e2euser', hash, '13800138000', now, now)

db.close()
console.log(`[e2e] test data ready at ${join(dataHome, 'ke-work.db')}`)
