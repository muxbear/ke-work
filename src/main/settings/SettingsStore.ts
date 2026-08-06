import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { EventEmitter } from 'events'
import {
  defaultSettings,
  flattenSettings,
  isSettingsKey,
  isValidSettingsValue,
  normalizeSettings,
  SETTINGS_VERSION,
  unflattenSettings,
  type SettingsKey
} from './schema'

const SETTINGS_FILE = 'settings.json'

/**
 * 系统设置存储（对齐 WorkModeStore 模式 + WorkBuddy 实测规范）
 *
 * - 存储位置：~/.ke-work/settings.json（基础目录顶层，对齐 ~/.workbuddy/settings.json）
 * - 磁盘格式：嵌套功能域对象 + 顶层 version 字段（对齐 WorkBuddy workspace-state.json）
 * - 写入：① 旧文件复制为 .bak（对齐 memory.md.bak 实测）② 临时文件原子写 ③ rename 替换
 * - 损坏恢复：JSON 解析失败优先从 .bak 恢复；均失败回退默认并保留损坏文件为 .corrupt
 * - 非法值回退默认并修复回写（对齐 WorkModeStore.load fallback persist）
 * - 运行期主进程内存快照为权威，文件为持久化权威；外部编辑需重启生效
 */
export class SettingsStore {
  private settings: Record<SettingsKey, unknown>
  private readonly filePath: string
  private readonly emitter = new EventEmitter()

  constructor(baseDir: string) {
    this.filePath = join(baseDir, SETTINGS_FILE)
    mkdirSync(baseDir, { recursive: true })
    this.settings = defaultSettings()
    this.load()
  }

  private load(): void {
    try {
      if (!existsSync(this.filePath)) return // 缺失 → 全默认，首次 set 才落盘
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Record<string, unknown>
      // version 检查：文件来自更新版本应用（结构未知）→ 回退默认，不写盘避免破坏高版本数据
      const rawVersion = raw && typeof raw === 'object' ? raw['version'] : undefined
      if (typeof rawVersion === 'number' && rawVersion > SETTINGS_VERSION) {
        console.warn(`[settings] file version ${rawVersion} > supported ${SETTINGS_VERSION}, fallback to defaults`)
        return
      }
      this.settings = normalizeSettings(raw)
      // 修复回写：文件内值存在非法/缺失（normalize 已回退默认）时重写
      const normalized = unflattenSettings(this.settings)
      const stored = { ...raw }
      delete stored['version']
      if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
        console.warn('[settings] invalid values detected, repairing settings.json')
        this.persist()
      }
    } catch (err) {
      console.warn('[settings] failed to load settings.json, trying .bak:', err)
      if (this.tryRestoreFromBak()) return
      // .bak 也不可用 → 损坏文件保留为 .corrupt（VS Code 排查惯例），回退默认
      try {
        renameSync(this.filePath, `${this.filePath}.corrupt`)
      } catch (renameErr) {
        console.warn('[settings] failed to preserve corrupt file:', renameErr)
      }
      this.settings = defaultSettings()
    }
  }

  /** 从 .bak 恢复（对齐 WorkBuddy 备份思路）；成功返回 true */
  private tryRestoreFromBak(): boolean {
    const bakPath = `${this.filePath}.bak`
    if (!existsSync(bakPath)) return false
    try {
      const raw = JSON.parse(readFileSync(bakPath, 'utf-8')) as Record<string, unknown>
      this.settings = normalizeSettings(raw)
      console.warn('[settings] restored settings from .bak')
      this.persist()
      return true
    } catch (bakErr) {
      console.warn('[settings] .bak also corrupted:', bakErr)
      return false
    }
  }

  /** 写入：.bak 备份 → 临时文件 → 原子替换（UTF-8 无 BOM） */
  private persist(): void {
    if (existsSync(this.filePath)) {
      copyFileSync(this.filePath, `${this.filePath}.bak`)
    }
    const tmp = `${this.filePath}.tmp`
    const data = { version: SETTINGS_VERSION, ...unflattenSettings(this.settings) }
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmp, this.filePath)
  }

  get<K extends SettingsKey>(key: K): unknown {
    return this.settings[key]
  }

  getAll(): Record<SettingsKey, unknown> {
    return { ...this.settings }
  }

  /**
   * 校验并写入（白名单 + 类型 + 枚举/格式/区间校验，主进程为校验权威）。
   * 非法值抛错（由 IPC handler 转为 { success: false }），不静默。
   */
  set(key: SettingsKey, value: unknown): void {
    if (!isSettingsKey(key)) throw new Error(`[settings] unknown key: ${String(key)}`)
    if (!isValidSettingsValue(key, value)) {
      throw new Error(`[settings] invalid value for ${key}: ${JSON.stringify(value)}`)
    }
    this.settings[key] = value
    this.persist()
    this.emitter.emit('settings:changed', key, value)
  }

  onChanged(listener: (key: SettingsKey, value: unknown) => void): () => void {
    this.emitter.on('settings:changed', listener)
    return () => this.emitter.off('settings:changed', listener)
  }

  /** 测试用：当前文件路径 */
  getFilePath(): string {
    return this.filePath
  }
}

export { flattenSettings }
