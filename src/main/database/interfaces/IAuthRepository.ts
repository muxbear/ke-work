import type { WorkMode } from '../../mode/work-mode'

export interface UserRecord {
  id: string
  username: string
  passwordHash: string
  mobile?: string
  wechatOpenid?: string
  avatar?: string
  workMode: WorkMode
  createdAt: number
  updatedAt: number
  failedLoginAttempts: number
  lockedUntil: number | null
  tokenHash: string | null
  tokenExpire: number | null
}

export interface SmsCodeRecord {
  mobile: string
  codeHash: string
  expiresAt: number
  used: boolean
  createdAt: number
}

export interface AuditLogInput {
  userId?: string
  action: string
  detail?: string
  ipAddress?: string
}

/** 认证数据访问接口（本地 SQLite / 云端 API 共用契约） */
export interface IAuthRepository {
  /** 按账号（username 或 mobile）查找用户 */
  findByAccount(account: string): Promise<UserRecord | null>
  findByMobile(mobile: string): Promise<UserRecord | null>
  findByWechatOpenid(openid: string): Promise<UserRecord | null>
  createUser(input: {
    username: string
    passwordHash?: string
    mobile?: string
    wechatOpenid?: string
  }): Promise<UserRecord>
  /** 记录登录失败，返回最新计数与锁定时间 */
  recordLoginFailure(
    userId: string,
    maxAttempts: number,
    lockDurationMs: number
  ): Promise<{ attempts: number; lockedUntil: number | null }>
  resetLoginFailures(userId: string): Promise<void>
  updateToken(userId: string, tokenHash: string | null, expireAt: number | null): Promise<void>
  saveSmsCode(mobile: string, codeHash: string, expiresAt: number): Promise<void>
  findSmsCode(mobile: string): Promise<SmsCodeRecord | null>
  markSmsCodeUsed(mobile: string): Promise<void>
  addAuditLog(input: AuditLogInput): Promise<void>
}
