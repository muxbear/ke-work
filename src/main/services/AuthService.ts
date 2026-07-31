import { randomInt } from 'crypto'
import type { IAuthRepository, UserRecord } from '../database/interfaces/IAuthRepository'
import { sha256, verifyPassword } from '../security/crypto'
import { signToken, type TokenPayload } from '../security/token'
import type { ISecureStorage } from '../security/secure-storage'

export interface AuthResult {
  token: string
  refreshToken: string
  user: { id: string; username: string; mobile?: string }
}

export interface AuthServiceDeps {
  repository: IAuthRepository
  jwtSecret: string
  secureStorage: ISecureStorage
  now?: () => number
  smsSender?: { send(mobile: string, code: string): Promise<void> }
  wechatClient?: { exchangeCode(code: string): Promise<string> }
  maxFailedAttempts?: number
  lockDurationMs?: number
  smsCodeTtlMs?: number
  accessTokenTtlSec?: number
  refreshTokenTtlSec?: number
}

const ACCESS_TTL_SEC = 2 * 60 * 60
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60

export class AuthService {
  private readonly repo: IAuthRepository
  private readonly secret: string
  private readonly now: () => number
  private readonly smsSender: { send(mobile: string, code: string): Promise<void> }
  private readonly wechatClient: { exchangeCode(code: string): Promise<string> }
  private readonly maxFailedAttempts: number
  private readonly lockDurationMs: number
  private readonly smsCodeTtlMs: number
  private readonly accessTokenTtlSec: number
  private readonly refreshTokenTtlSec: number

  constructor(deps: AuthServiceDeps) {
    this.repo = deps.repository
    this.secret = deps.jwtSecret
    this.now = deps.now ?? Date.now
    this.smsSender = deps.smsSender ?? { send: async () => {} }
    this.wechatClient = deps.wechatClient ?? { exchangeCode: async () => '' }
    this.maxFailedAttempts = deps.maxFailedAttempts ?? 5
    this.lockDurationMs = deps.lockDurationMs ?? 15 * 60 * 1000
    this.smsCodeTtlMs = deps.smsCodeTtlMs ?? 5 * 60 * 1000
    this.accessTokenTtlSec = deps.accessTokenTtlSec ?? ACCESS_TTL_SEC
    this.refreshTokenTtlSec = deps.refreshTokenTtlSec ?? REFRESH_TTL_SEC
  }

  // ── 密码登录 ──

  async loginByPassword(account: string, password: string): Promise<AuthResult> {
    const user = await this.repo.findByAccount(account)
    if (!user) {
      // 统一错误消息，防用户枚举
      await this.repo.addAuditLog({ action: 'login_failed', detail: 'account not found' })
      throw new Error('账号或密码错误')
    }
    this.assertNotLocked(user)

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      await this.handleLoginFailure(user)
      throw new Error('账号或密码错误')
    }

    await this.repo.resetLoginFailures(user.id)
    return this.completeLogin(user, 'login')
  }

  // ── 短信登录 ──

  async sendSmsCode(mobile: string): Promise<void> {
    if (!/^1[3-9]\d{9}$/.test(mobile)) {
      throw new Error('手机号格式不正确')
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const codeHash = sha256(code)
    await this.repo.saveSmsCode(mobile, codeHash, this.now() + this.smsCodeTtlMs)
    await this.smsSender.send(mobile, code)
    await this.repo.addAuditLog({ action: 'sms_code_sent', detail: mobile })
  }

  async loginBySms(mobile: string, code: string): Promise<AuthResult> {
    const record = await this.repo.findSmsCode(mobile)
    if (!record || record.used || record.expiresAt <= this.now()) {
      throw new Error('验证码无效或已过期')
    }
    if (sha256(code) !== record.codeHash) {
      throw new Error('验证码错误')
    }
    await this.repo.markSmsCodeUsed(mobile)

    let user = await this.repo.findByMobile(mobile)
    if (!user) {
      user = await this.repo.createUser({ username: mobile, mobile })
    }
    this.assertNotLocked(user)
    await this.repo.resetLoginFailures(user.id)
    return this.completeLogin(user, 'login_sms')
  }

  // ── 微信登录 ──

  async loginByWechat(code: string): Promise<AuthResult> {
    const openid = await this.wechatClient.exchangeCode(code)
    if (!openid) throw new Error('微信授权失败')

    let user = await this.repo.findByWechatOpenid(openid)
    if (!user) {
      user = await this.repo.createUser({
        username: `wx_${sha256(openid).slice(0, 12)}`,
        wechatOpenid: openid
      })
    }
    this.assertNotLocked(user)
    await this.repo.resetLoginFailures(user.id)
    return this.completeLogin(user, 'login_wechat')
  }

  // ── 登出 ──

  /** 登出：清除 token 哈希并记录审计 */
  async logout(account: string): Promise<void> {
    const user = await this.repo.findByAccount(account)
    if (user) {
      await this.repo.updateToken(user.id, null, null)
      await this.repo.addAuditLog({ userId: user.id, action: 'logout' })
    }
  }

  // ── 内部工具 ──

  private assertNotLocked(user: UserRecord): void {
    if (user.lockedUntil && user.lockedUntil > this.now()) {
      const minutes = Math.ceil((user.lockedUntil - this.now()) / 60000)
      throw new Error(`账户已锁定，请 ${minutes} 分钟后再试`)
    }
  }

  private async handleLoginFailure(user: UserRecord): Promise<void> {
    const { lockedUntil } = await this.repo.recordLoginFailure(
      user.id,
      this.maxFailedAttempts,
      this.lockDurationMs,
      this.now()
    )
    await this.repo.addAuditLog({
      userId: user.id,
      action: 'login_failed',
      detail: JSON.stringify({ locked: Boolean(lockedUntil) })
    })
  }

  private async completeLogin(user: UserRecord, action: string): Promise<AuthResult> {
    const payload: TokenPayload = { sub: user.id, mode: 'local' }
    const token = signToken(payload, this.secret, { expiresInSec: this.accessTokenTtlSec })
    const refreshToken = signToken({ ...payload, type: 'refresh' } as never, this.secret, {
      expiresInSec: this.refreshTokenTtlSec
    })
    const expireAt = this.now() + this.accessTokenTtlSec * 1000
    await this.repo.updateToken(user.id, sha256(token), expireAt)
    await this.repo.addAuditLog({ userId: user.id, action })
    return {
      token,
      refreshToken,
      user: { id: user.id, username: user.username, mobile: user.mobile }
    }
  }
}
