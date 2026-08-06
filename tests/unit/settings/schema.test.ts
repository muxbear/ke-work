import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  flattenSettings,
  isSettingsKey,
  isValidSettingsValue,
  normalizeSettings,
  SETTINGS_SCHEMA,
  SETTINGS_VERSION,
  unflattenSettings
} from '../../../src/main/settings/schema'

describe('settings schema', () => {
  it('白名单 key（嵌套路径）', () => {
    expect(isSettingsKey('ui.language')).toBe(true)
    expect(isSettingsKey('network.proxyMode')).toBe(true)
    expect(isSettingsKey('notification.sound')).toBe(true)
    expect(isSettingsKey('bogus')).toBe(false)
    expect(isSettingsKey('ui')).toBe(false)
  })

  it('12 项配置全部在 schema 内且类型/默认值合法', () => {
    expect(Object.keys(SETTINGS_SCHEMA)).toHaveLength(12)
    for (const [key, entry] of Object.entries(SETTINGS_SCHEMA)) {
      expect(isSettingsKey(key)).toBe(true)
      expect(['string', 'number', 'boolean']).toContain(entry.type)
      expect(typeof entry.default).toBe(entry.type)
      expect(['instant', 'pending']).toContain(entry.applyTiming)
    }
  })

  it('默认值为全默认（VS Code 默认值合并权威）', () => {
    const d = defaultSettings()
    expect(d['ui.language']).toBe('zh-CN')
    expect(d['ui.fontSize']).toBe(17)
    expect(d['skills.autoUpdate']).toBe(true)
    expect(d['skills.safeInstall']).toBe(false)
    expect(d['plugins.autoUpdate']).toBe(true)
    expect(d['lockScreen.remoteLock']).toBe(false)
    expect(d['network.proxyMode']).toBe('direct')
    expect(d['network.proxyUrl']).toBe('')
    expect(d['workspace.defaultWorkspaceDir']).toBe('')
    expect(d['privacy.experienceImprovement']).toBe(true)
    expect(d['notification.clientNotifications']).toBe(true)
    expect(d['notification.sound']).toBe('none')
  })

  it('validate 拒绝非法枚举/区间/格式', () => {
    expect(isValidSettingsValue('ui.language', 'fr-FR')).toBe(false)
    expect(isValidSettingsValue('ui.language', 'zh-CN')).toBe(true)
    expect(isValidSettingsValue('ui.fontSize', 8)).toBe(false)
    expect(isValidSettingsValue('ui.fontSize', 17)).toBe(true)
    expect(isValidSettingsValue('network.proxyMode', 'bogus')).toBe(false)
    expect(isValidSettingsValue('network.proxyUrl', 'not-a-url')).toBe(false)
    expect(isValidSettingsValue('network.proxyUrl', 'http://127.0.0.1:7890')).toBe(true)
    expect(isValidSettingsValue('network.proxyUrl', '')).toBe(true)
    expect(isValidSettingsValue('workspace.defaultWorkspaceDir', 'relative/path')).toBe(false)
    expect(isValidSettingsValue('workspace.defaultWorkspaceDir', 'C:\\KeWork')).toBe(true)
    expect(isValidSettingsValue('notification.sound', 'loud')).toBe(false)
    expect(isValidSettingsValue('skills.autoUpdate', 'yes')).toBe(false)
    expect(isValidSettingsValue('skills.autoUpdate', true)).toBe(true)
  })

  it('normalizeSettings：空输入 = 全默认（默认值合并）', () => {
    const out = normalizeSettings({})
    expect(out).toEqual(defaultSettings())
  })

  it('normalizeSettings：嵌套对象输入拍平并保留合法值', () => {
    const out = normalizeSettings({ ui: { language: 'en', fontSize: 20 } })
    expect(out['ui.language']).toBe('en')
    expect(out['ui.fontSize']).toBe(20)
    expect(out['network.proxyMode']).toBe('direct') // 未提供项回默认
  })

  it('normalizeSettings：非法值静默回退默认', () => {
    const out = normalizeSettings({ ui: { language: 'fr-FR' }, notification: { sound: 'loud' } })
    expect(out['ui.language']).toBe('zh-CN')
    expect(out['notification.sound']).toBe('none')
  })

  it('flatten/unflatten 互逆（嵌套域 ↔ 扁平 key）', () => {
    const nested = { ui: { language: 'zh-CN', fontSize: 17 }, network: { proxyMode: 'direct' } }
    const flat = flattenSettings(nested)
    expect(flat['ui.language']).toBe('zh-CN')
    expect(flat['ui.fontSize']).toBe(17)
    expect(flat['network.proxyMode']).toBe('direct')
    expect(unflattenSettings(flat)).toEqual(nested)
  })

  it('SETTINGS_VERSION 当前为 1', () => {
    expect(SETTINGS_VERSION).toBe(1)
  })
})
