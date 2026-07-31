import { randomUUID } from 'crypto'
import type { LocalDataSource } from './LocalDataSource'
import type {
  AuditLogInput,
  IAuthRepository,
  SmsCodeRecord,
  UserRecord
} from '../interfaces/IAuthRepository'
import type { WorkMode } from '../../mode/work-mode'

interface UserRow {
  id: string
  username: string
  password_hash: string
  mobile: string | null
  wechat_openid: string | null
  avatar: string | null
  work_mode: WorkMode
  token_hash: string | null
  token_expire: number | null
  failed_login_attempts: number
  locked_until: number | null
  created_at: number
  updated_at: number
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    mobile: row.mobile ?? undefined,
    wechatOpenid: row.wechat_openid ?? undefined,
    avatar: row.avatar ?? undefined,
    workMode: row.work_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    tokenHash: row.token_hash,
    tokenExpire: row.token_expire
  }
}

const SELECT_USER = 'SELECT * FROM users'

/** 本地 SQLite 认证数据实现 */
export class LocalAuthRepository implements IAuthRepository {
  constructor(private readonly ds: LocalDataSource) {}

  private findBy(where: string, value: string): Promise<UserRecord | null> {
    const row = this.ds
      .getDb()
      .prepare(`${SELECT_USER} WHERE ${where} = ?`)
      .get(value) as UserRow | undefined
    return Promise.resolve(row ? toUserRecord(row) : null)
  }

  findByAccount(account: string): Promise<UserRecord | null> {
    return this.findBy('username', account).then((u) => u ?? this.findBy('mobile', account))
  }

  findByMobile(mobile: string): Promise<UserRecord | null> {
    return this.findBy('mobile', mobile)
  }

  findByWechatOpenid(openid: string): Promise<UserRecord | null> {
    return this.findBy('wechat_openid', openid)
  }

  async createUser(input: {
    username: string
    passwordHash?: string
    mobile?: string
    wechatOpenid?: string
  }): Promise<UserRecord> {
    const now = Date.now()
    const id = randomUUID()
    this.ds
      .getDb()
      .prepare(
        'INSERT INTO users (id, username, password_hash, mobile, wechat_openid, work_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        input.username,
        input.passwordHash ?? '',
        input.mobile ?? null,
        input.wechatOpenid ?? null,
        'local',
        now,
        now
      )
    return (await this.findByAccount(input.username))!
  }

  async recordLoginFailure(
    userId: string,
    maxAttempts: number,
    lockDurationMs: number,
    now: number
  ): Promise<{ attempts: number; lockedUntil: number | null }> {
    const row = this.ds.getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow
    const attempts = row.failed_login_attempts + 1
    let lockedUntil: number | null = null
    if (attempts >= maxAttempts) {
      lockedUntil = now + lockDurationMs
      this.ds
        .getDb()
        .prepare(
          'UPDATE users SET failed_login_attempts = 0, locked_until = ?, updated_at = ? WHERE id = ?'
        )
        .run(lockedUntil, now, userId)
      return { attempts: 0, lockedUntil }
    }
    this.ds
      .getDb()
      .prepare('UPDATE users SET failed_login_attempts = ?, updated_at = ? WHERE id = ?')
      .run(attempts, now, userId)
    return { attempts, lockedUntil }
  }

  async resetLoginFailures(userId: string): Promise<void> {
    this.ds
      .getDb()
      .prepare(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?'
      )
      .run(Date.now(), userId)
  }

  async updateToken(userId: string, tokenHash: string | null, expireAt: number | null): Promise<void> {
    this.ds
      .getDb()
      .prepare('UPDATE users SET token_hash = ?, token_expire = ?, updated_at = ? WHERE id = ?')
      .run(tokenHash, expireAt, Date.now(), userId)
  }

  async saveSmsCode(mobile: string, codeHash: string, expiresAt: number): Promise<void> {
    this.ds
      .getDb()
      .prepare(
        'INSERT INTO sms_codes (mobile, code_hash, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(mobile) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, used = 0, created_at = excluded.created_at'
      )
      .run(mobile, codeHash, expiresAt, Date.now())
  }

  async findSmsCode(mobile: string): Promise<SmsCodeRecord | null> {
    const row = this.ds
      .getDb()
      .prepare('SELECT * FROM sms_codes WHERE mobile = ?')
      .get(mobile) as
      | { mobile: string; code_hash: string; expires_at: number; used: number; created_at: number }
      | undefined
    if (!row) return null
    return {
      mobile: row.mobile,
      codeHash: row.code_hash,
      expiresAt: row.expires_at,
      used: row.used === 1,
      createdAt: row.created_at
    }
  }

  async markSmsCodeUsed(mobile: string): Promise<void> {
    this.ds.getDb().prepare('UPDATE sms_codes SET used = 1 WHERE mobile = ?').run(mobile)
  }

  async addAuditLog(input: AuditLogInput): Promise<void> {
    this.ds
      .getDb()
      .prepare(
        'INSERT INTO audit_logs (id, user_id, action, detail, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        randomUUID(),
        input.userId ?? null,
        input.action,
        input.detail ?? null,
        input.ipAddress ?? null,
        Date.now()
      )
  }
}
