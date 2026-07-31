import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const SESSION_FILE = 'session.json'

/**
 * 会话服务：维护主进程侧的当前登录用户
 * 登录成功时设置并持久化（重启后恢复），登出/模式切换时清除；
 * 供 IPC 层获取真实 userId（不信任渲染层传参）
 */
export class SessionService {
  private userId: string | null = null
  private readonly filePath: string | null

  /**
   * @param configDir 配置目录；不传时纯内存（测试用）
   */
  constructor(configDir?: string) {
    if (configDir) {
      this.filePath = join(configDir, SESSION_FILE)
      if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
      this.load()
    } else {
      this.filePath = null
    }
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) return
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as { userId?: unknown }
      if (typeof raw.userId === 'string') {
        this.userId = raw.userId
      }
    } catch {
      this.userId = null
    }
  }

  private persist(): void {
    if (!this.filePath) return
    writeFileSync(this.filePath, JSON.stringify({ userId: this.userId }), 'utf-8')
  }

  setCurrentUser(userId: string): void {
    this.userId = userId
    this.persist()
  }

  clear(): void {
    this.userId = null
    this.persist()
  }

  getCurrentUserId(): string | null {
    return this.userId
  }

  /** 获取当前用户 id，未登录时抛错 */
  requireUserId(): string {
    if (!this.userId) throw new Error('未登录，请先登录')
    return this.userId
  }
}
