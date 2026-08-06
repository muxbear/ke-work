import { isAbsolute } from 'path'

/**
 * 系统设置 Schema 权威（VS Code 默认值合并模式 + WorkBuddy 嵌套功能域分组）
 *
 * 存储 key 为嵌套路径字符串（如 'ui.language'），磁盘文件为嵌套对象（对齐 WorkBuddy
 * settings.json 的 camelCase 域分组：sandbox/claw/enabledPlugins 实测）；主进程为唯一
 * 校验权威（白名单 + 类型 + 枚举/格式/区间），渲染层不可信。
 */

export type ApplyTiming = 'instant' | 'pending'

export type SettingsKey =
  | 'ui.language'
  | 'ui.fontSize'
  | 'skills.autoUpdate'
  | 'skills.safeInstall'
  | 'plugins.autoUpdate'
  | 'lockScreen.remoteLock'
  | 'network.proxyMode'
  | 'network.proxyUrl'
  | 'workspace.defaultWorkspaceDir'
  | 'privacy.experienceImprovement'
  | 'notification.clientNotifications'
  | 'notification.sound'

export interface SettingsSchemaEntry {
  type: 'string' | 'number' | 'boolean'
  default: unknown
  /** 生效时机：instant=保存即生效；pending=功能无落点仅持久化（UI 显式标注"后续版本生效"） */
  applyTiming: ApplyTiming
  /** 枚举/格式/区间校验（非法值回退默认） */
  validate?: (v: unknown) => boolean
}

const LANGUAGE_OPTIONS = ['zh-CN', 'zh-TW', 'en']
const PROXY_MODES = ['direct', 'system', 'manual']
const SOUND_OPTIONS = ['none', 'crisp', 'soft']

/** http(s)://host[:port][/path] 格式（代理地址必填校验） */
const PROXY_URL_RE = /^https?:\/\/[^:\s/]+(:\d{1,5})?(\/.*)?$/

export const SETTINGS_SCHEMA: Record<SettingsKey, SettingsSchemaEntry> = {
  'ui.language': {
    type: 'string',
    default: 'zh-CN',
    applyTiming: 'instant',
    validate: (v) => LANGUAGE_OPTIONS.includes(v as string)
  },
  'ui.fontSize': {
    type: 'number',
    default: 17,
    applyTiming: 'instant',
    validate: (v) => Number.isInteger(v) && (v as number) >= 12 && (v as number) <= 24
  },
  'skills.autoUpdate': { type: 'boolean', default: true, applyTiming: 'pending' },
  'skills.safeInstall': { type: 'boolean', default: false, applyTiming: 'pending' },
  'plugins.autoUpdate': { type: 'boolean', default: true, applyTiming: 'pending' },
  'lockScreen.remoteLock': { type: 'boolean', default: false, applyTiming: 'instant' },
  'network.proxyMode': {
    type: 'string',
    default: 'direct',
    applyTiming: 'instant',
    validate: (v) => PROXY_MODES.includes(v as string)
  },
  'network.proxyUrl': {
    type: 'string',
    default: '',
    applyTiming: 'instant',
    validate: (v) => typeof v === 'string' && (v === '' || PROXY_URL_RE.test(v))
  },
  'workspace.defaultWorkspaceDir': {
    type: 'string',
    default: '',
    applyTiming: 'instant',
    validate: (v) => typeof v === 'string' && (v === '' || isAbsolute(v))
  },
  'privacy.experienceImprovement': { type: 'boolean', default: true, applyTiming: 'pending' },
  'notification.clientNotifications': { type: 'boolean', default: true, applyTiming: 'pending' },
  'notification.sound': {
    type: 'string',
    default: 'none',
    applyTiming: 'pending',
    validate: (v) => SOUND_OPTIONS.includes(v as string)
  }
}

/** settings.json 顶层结构版本（对齐 WorkBuddy workspace-state.json 的 version 字段） */
export const SETTINGS_VERSION = 1

/** 白名单守卫 */
export function isSettingsKey(k: string): k is SettingsKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_SCHEMA, k)
}

/** 单值完整校验（白名单 + 类型 + 枚举/格式/区间）；非法返回 false */
export function isValidSettingsValue(key: SettingsKey, value: unknown): boolean {
  const entry = SETTINGS_SCHEMA[key]
  if (!entry) return false
  if (!isValidValue(entry, value)) return false
  if (entry.validate && !entry.validate(value)) return false
  return true
}

/** 全默认值（扁平 key 映射） */
export function defaultSettings(): Record<SettingsKey, unknown> {
  const out = {} as Record<SettingsKey, unknown>
  for (const [key, entry] of Object.entries(SETTINGS_SCHEMA)) {
    out[key as SettingsKey] = entry.default
  }
  return out
}

function isValidValue(entry: SettingsSchemaEntry, value: unknown): boolean {
  switch (entry.type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'string':
      return typeof value === 'string'
  }
}

/** 嵌套对象拍平：{"ui":{"language":"zh-CN"}} → {"ui.language":"zh-CN"} */
export function flattenSettings(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenSettings(value as Record<string, unknown>, path))
    } else {
      out[path] = value
    }
  }
  return out
}

/** 扁平 key 映射还原为嵌套对象（persist 写盘用，对齐 WorkBuddy 嵌套域格式） */
export function unflattenSettings(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.')
    let node = out
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (typeof node[part] !== 'object' || node[part] === null) {
        node[part] = {}
      }
      node = node[part] as Record<string, unknown>
    }
    node[parts[parts.length - 1]] = value
  }
  return out
}

/**
 * 默认值合并（VS Code 模式）：默认值 ∪ 文件内值，逐字段类型/枚举校验，非法值回退默认。
 * 输入为磁盘嵌套对象（含 version 等非设置字段会被 flatten 后忽略）。
 */
export function normalizeSettings(raw: Record<string, unknown>): Record<SettingsKey, unknown> {
  const flat = flattenSettings(raw)
  const out = defaultSettings()
  for (const [key, entry] of Object.entries(SETTINGS_SCHEMA)) {
    if (!(key in flat)) continue
    const value = flat[key]
    if (!isValidValue(entry, value)) continue
    if (entry.validate && !entry.validate(value)) continue
    ;(out as Record<string, unknown>)[key] = value
  }
  return out
}
